import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Candidato exibido no dropdown. O CPF já chega MASCARADO
 * (`***.***.***-NN`) — o valor em claro devolvido pela RPC é descartado
 * assim que o resultado chega (nunca é guardado em estado, persistido ou logado).
 */
interface Candidate {
  id: string;
  full_name: string;
  cpfMasked: string;
  status: string;
}

interface Props {
  /** Nome exibido (client_name) — texto livre para prospect não cadastrado. */
  clientName: string;
  /** client_id (uuid) quando um cliente do cadastro foi selecionado; null p/ prospect. */
  clientId: string | null;
  /**
   * Dispara a cada mudança. Ao digitar manualmente, `clientId` volta null
   * (o texto deixou de corresponder ao cliente selecionado). Ao escolher um
   * candidato, vem o uuid + o nome do cadastro.
   */
  onChange: (clientName: string, clientId: string | null) => void;
}

/** Mascara o CPF em claro para `***.***.***-NN` (só os 2 últimos dígitos). */
function maskCpf(raw: string | null | undefined): string {
  const digits = (raw ?? "").replace(/\D/g, "");
  const last2 = digits.slice(-2).padStart(2, "*");
  return `***.***.***-${last2}`;
}

/**
 * Campo de cliente da reunião: autocomplete que resolve e grava `client_id`
 * quando o cliente já existe (via `agent_consultar_cliente` na sessão do
 * usuário — o gate `is_recepcao_or_socio()` passa pelo JWT), mantendo a opção
 * de nome livre sem `client_id` para prospect ainda não cadastrado.
 */
export function ClientAutocomplete({ clientName, clientId, onChange }: Props) {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState<string>("");
  const boxRef = useRef<HTMLDivElement>(null);

  // Fecha o dropdown ao clicar fora.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  // Busca com debounce. A guarda `cancelled` evita que uma resposta antiga
  // sobrescreva a atual.
  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) { setCandidates([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    const h = setTimeout(() => {
      void (async () => {
        const { data, error } = await (supabase as unknown as {
          rpc: (fn: string, args: Record<string, unknown>) => Promise<{
            data: { id: string; full_name: string; cpf: string | null; status: string }[] | null;
            error: unknown;
          }>;
        }).rpc("agent_consultar_cliente", { p_busca: term });
        if (cancelled) return;
        // Mascara na chegada e DESCARTA o CPF em claro (não vai para o estado).
        const mapped: Candidate[] = error || !data ? [] : data.map((r) => ({
          id: r.id,
          full_name: r.full_name,
          cpfMasked: maskCpf(r.cpf),
          status: r.status,
        }));
        setCandidates(mapped);
        setOpen(true);
        setLoading(false);
      })();
    }, 300);
    return () => { cancelled = true; clearTimeout(h); };
  }, [query]);

  const select = (c: Candidate) => {
    onChange(c.full_name, c.id);
    setQuery("");
    setCandidates([]);
    setOpen(false);
  };

  return (
    <div ref={boxRef} style={{ position: "relative" }}>
      <input
        value={clientName}
        placeholder="Buscar cliente por nome ou CPF…"
        aria-label="Cliente"
        aria-expanded={open}
        role="combobox"
        aria-autocomplete="list"
        onChange={(e) => {
          const v = e.target.value;
          // Digitar manualmente quebra o vínculo com o cliente selecionado.
          onChange(v, null);
          setQuery(v);
        }}
        onFocus={() => { if (candidates.length > 0) setOpen(true); }}
        style={{
          width: "100%", padding: "8px 10px", borderRadius: 6, boxSizing: "border-box",
          background: "var(--bg1, #09090f)", border: "1px solid var(--border, #1e1e2e)",
          color: "var(--text1, #eeeef5)", fontSize: 13, fontFamily: "inherit",
        }}
      />
      {clientId && (
        <span
          title="Cliente vinculado ao cadastro"
          style={{ position: "absolute", right: 8, top: 8, fontSize: 11, color: "#16A34A", fontWeight: 600 }}
        >
          ✓ vinculado
        </span>
      )}
      {open && (loading || candidates.length > 0) && (
        <ul
          role="listbox"
          style={{
            position: "absolute", zIndex: 10, top: "100%", left: 0, right: 0, margin: "4px 0 0",
            padding: 4, listStyle: "none", background: "var(--bg3, #13131f)", color: "var(--text1, #eeeef5)",
            border: "1px solid var(--border, #1e1e2e)", borderRadius: 8, boxShadow: "0 6px 20px rgba(0,0,0,0.4)",
            maxHeight: 240, overflowY: "auto",
          }}
        >
          {loading && <li style={{ padding: 8, fontSize: 12, color: "var(--text3, #999)" }}>Buscando…</li>}
          {!loading && candidates.length === 0 && (
            <li style={{ padding: 8, fontSize: 12, color: "var(--text3, #999)" }}>Nenhum cliente encontrado.</li>
          )}
          {!loading && candidates.map((c) => (
            <li key={c.id} role="option" aria-selected={c.id === clientId}>
              <button
                type="button"
                onClick={() => select(c)}
                style={{
                  display: "block", width: "100%", textAlign: "left", padding: "8px 10px", borderRadius: 6,
                  border: "none", background: "transparent", cursor: "pointer",
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 600 }}>{c.full_name}</div>
                <div style={{ fontSize: 11, color: "var(--text2, #666)" }}>{c.cpfMasked} · {c.status}</div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
