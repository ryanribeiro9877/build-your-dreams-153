import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { saveGeneratedMinuta } from "@/lib/clientDocuments";

// ONDA2/8.1 — "Salvar minuta no cliente".
//
// A peça é gerada no chat (texto completo em mãos). Aqui o usuário escolhe o
// CLIENTE (busca por nome/CPF via agent_consultar_cliente) e, quando o cliente
// tem mais de um card, o CASO/CARD (task_id) ao qual vincular a minuta. Em
// seguida geramos o .docx (padrão Bacellar) e gravamos em client_documents
// (document_type 'minuta', origem 'sistema') — sem reemitir a peça pelo LLM.

interface ClienteHit { id: string; full_name: string; cpfMasked: string }
interface CardHit { id: string; title: string; situacao: string | null }

// Máscara de CPF para exibição (mesmo padrão do ClientAutocomplete): mostra só os
// 2 últimos dígitos. O CPF em claro é descartado — nunca entra no estado.
function maskCpf(raw: string | null | undefined): string {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (!digits) return "";
  return `***.***.***-${digits.slice(-2).padStart(2, "*")}`;
}

// A RPC agent_consultar_cliente não está nos tipos gerados (SECURITY DEFINER que
// re-checa papel via JWT); chamamos via cast, como o ClientAutocomplete.
type RpcClient = { rpc: (fn: string, args: Record<string, unknown>) => Promise<{
  data: { id: string; full_name: string; cpf: string | null; status: string }[] | null; error: { message: string } | null;
}> };

export interface SalvarMinutaModalProps {
  content: string;
  onClose: () => void;
  onSaved?: () => void;
}

export function SalvarMinutaModal({ content, onClose, onSaved }: SalvarMinutaModalProps) {
  const { user } = useAuth();
  const [busca, setBusca] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [clientes, setClientes] = useState<ClienteHit[] | null>(null);
  const [cliente, setCliente] = useState<ClienteHit | null>(null);
  const [cards, setCards] = useState<CardHit[] | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function buscar() {
    const q = busca.trim();
    if (q.length < 2) { setErro("Digite ao menos 2 caracteres."); return; }
    setErro(null); setBuscando(true); setClientes(null);
    const { data, error } = await (supabase as unknown as RpcClient)
      .rpc("agent_consultar_cliente", { p_busca: q });
    setBuscando(false);
    if (error) { setErro(error.message); return; }
    // Mascara na chegada e DESCARTA o CPF em claro (não vai para o estado).
    setClientes((data ?? []).map((r) => ({ id: r.id, full_name: r.full_name, cpfMasked: maskCpf(r.cpf) })));
  }

  async function escolherCliente(c: ClienteHit) {
    setCliente(c); setErro(null); setCards(null); setTaskId(null);
    const { data, error } = await supabase
      .from("user_tasks")
      .select("id, title, situacao")
      .eq("client_id", c.id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) { setErro(error.message); setCards([]); return; }
    const list = (data as CardHit[]) ?? [];
    setCards(list);
    // 0 card → sem vínculo; 1 card → vincula automaticamente; >1 → usuário escolhe.
    if (list.length === 1) setTaskId(list[0].id);
  }

  async function salvar() {
    if (!cliente || !user) return;
    setSalvando(true); setErro(null);
    const r = await saveGeneratedMinuta(cliente.id, cliente.full_name, user.id, { content, taskId });
    setSalvando(false);
    if (!r.ok) { setErro(r.error ?? "falha ao salvar"); return; }
    setOk(true);
    onSaved?.();
  }

  const box: React.CSSProperties = {
    background: "var(--bg2, #11111a)", border: "1px solid var(--border, #25253a)",
    borderRadius: 14, width: "min(560px, 100%)", maxHeight: "min(86vh, 100%)",
    display: "flex", flexDirection: "column", boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
  };
  const row: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 8, padding: "9px 11px",
    borderRadius: 9, border: "1px solid var(--border, #25253a)", cursor: "pointer",
    background: "transparent", textAlign: "left", width: "100%", color: "var(--text1,#eeeef5)",
  };
  const primaryBtn: React.CSSProperties = {
    padding: "8px 16px", borderRadius: 9, fontSize: 12.5, fontWeight: 700, cursor: "pointer",
    background: "rgba(59,130,246,0.16)", border: "1px solid rgba(59,130,246,0.4)", color: "#60A5FA",
  };

  return createPortal(
    <div
      role="dialog" aria-modal="true" aria-label="Salvar minuta no cliente"
      onClick={(e) => { e.stopPropagation(); onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 1100, background: "rgba(0,0,0,0.72)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
        animation: "fadeUp 0.18s ease both",
      }}
    >
      <div onClick={(e) => e.stopPropagation()} style={box}>
        {/* Cabeçalho */}
        <div style={{
          display: "flex", alignItems: "center", gap: 12, padding: "14px 18px",
          borderBottom: "1px solid var(--border, #25253a)", flexShrink: 0,
        }}>
          <div style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 700, color: "var(--text1, #eeeef5)" }}>
            Salvar minuta no cliente
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" title="Fechar (Esc)" style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 30, height: 30, borderRadius: 8, cursor: "pointer", background: "transparent",
            border: "1px solid var(--border, #25253a)", color: "var(--text2, #c4c4d4)", flexShrink: 0,
          }}>
            <X size={16} />
          </button>
        </div>

        {/* Corpo */}
        <div style={{ overflowY: "auto", padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
          {ok ? (
            <div style={{ fontSize: 13, color: "#34D399" }}>
              ✓ Minuta salva em <strong>{cliente?.full_name}</strong>
              {taskId ? " e vinculada ao card selecionado." : " (sem vínculo a card)."}
            </div>
          ) : !cliente ? (
            <>
              <label style={{ fontSize: 12, color: "var(--text3,#7a7a92)" }}>Buscar cliente por nome ou CPF</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") buscar(); }}
                  placeholder="ex.: Maria Silva ou 123.456.789-00"
                  autoFocus
                  style={{
                    flex: 1, padding: "9px 11px", borderRadius: 9, fontSize: 13,
                    background: "var(--bg1,#0b0b12)", border: "1px solid var(--border,#25253a)",
                    color: "var(--text1,#eeeef5)",
                  }}
                />
                <button type="button" onClick={buscar} disabled={buscando} style={primaryBtn}>
                  {buscando ? "..." : "Buscar"}
                </button>
              </div>
              {clientes && clientes.length === 0 && (
                <div style={{ fontSize: 12.5, color: "var(--text3,#7a7a92)" }}>Nenhum cliente encontrado.</div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {clientes?.map((c) => (
                  <button key={c.id} type="button" style={row} onClick={() => escolherCliente(c)}>
                    <span style={{ fontWeight: 600 }}>{c.full_name}</span>
                    {c.cpfMasked && <span style={{ fontSize: 11, color: "var(--text3,#7a7a92)" }}>· {c.cpfMasked}</span>}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 12.5 }}>
                Cliente: <strong>{cliente.full_name}</strong>{" "}
                <button type="button" onClick={() => { setCliente(null); setCards(null); setTaskId(null); }}
                  style={{ marginLeft: 6, fontSize: 11, color: "#60A5FA", background: "none", border: "none", cursor: "pointer" }}>
                  trocar
                </button>
              </div>

              {cards === null ? (
                <div style={{ fontSize: 12.5, color: "var(--text3,#7a7a92)" }}>Carregando cards...</div>
              ) : cards.length === 0 ? (
                <div style={{ fontSize: 12.5, color: "var(--text3,#7a7a92)" }}>
                  Este cliente não tem cards — a minuta será salva sem vínculo a card.
                </div>
              ) : cards.length === 1 ? (
                <div style={{ fontSize: 12.5, color: "var(--text3,#7a7a92)" }}>
                  Vinculada ao único card: <strong style={{ color: "var(--text1,#eeeef5)" }}>{cards[0].title}</strong>
                </div>
              ) : (
                <>
                  <label style={{ fontSize: 12, color: "var(--text3,#7a7a92)" }}>Escolha o caso/card para vincular</label>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {cards.map((c) => (
                      <button key={c.id} type="button"
                        onClick={() => setTaskId(c.id)}
                        style={{ ...row, borderColor: taskId === c.id ? "rgba(59,130,246,0.6)" : "var(--border,#25253a)" }}>
                        <span style={{ fontWeight: 600 }}>{c.title}</span>
                        {c.situacao && <span style={{ fontSize: 11, color: "var(--text3,#7a7a92)" }}>· {c.situacao}</span>}
                      </button>
                    ))}
                    <button type="button" onClick={() => setTaskId(null)}
                      style={{ ...row, borderColor: taskId === null ? "rgba(59,130,246,0.6)" : "var(--border,#25253a)" }}>
                      <span style={{ color: "var(--text3,#7a7a92)" }}>Salvar sem vínculo a card</span>
                    </button>
                  </div>
                </>
              )}

              {erro && <div style={{ fontSize: 12, color: "#F87171" }}>{erro}</div>}

              <button type="button" onClick={salvar} disabled={salvando || cards === null}
                style={{ ...primaryBtn, alignSelf: "flex-start", opacity: salvando || cards === null ? 0.6 : 1 }}>
                {salvando ? "Salvando..." : "Salvar minuta"}
              </button>
            </>
          )}

          {erro && !cliente && <div style={{ fontSize: 12, color: "#F87171" }}>{erro}</div>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
