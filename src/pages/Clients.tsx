import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useMyWorkspace } from "@/hooks/useMyWorkspace";
import { toast } from "sonner";
import { HexagonLoader } from "@/components/HexagonLoader";
import {
  type ClientListRow, CLIENT_LIST_COLUMNS, ALLOWED_ROLES, RestrictedAccess,
  statusBadgeStyle, goldButtonStyle, ghostButtonStyle, inputStyle, selectStyle,
  pageStyle, formatDateBR,
} from "@/components/clients/shared";

const PAGE_SIZE = 20;

export default function Clients() {
  const { workspace } = useMyWorkspace();
  const navigate = useNavigate();
  const hasAccess = ALLOWED_ROLES.includes(workspace?.role_template?.code ?? "");

  const [clients, setClients] = useState<ClientListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  // R-2: quando a busca é um CPF, resolvemos por índice cego via RPC
  // (igualdade EXATA). null = a busca não é CPF (usa texto por nome/cidade).
  const [cpfMatchIds, setCpfMatchIds] = useState<string[] | null>(null);
  const [statusFilter, setStatusFilter] = useState("todos");
  const [stateFilter, setStateFilter] = useState("todos");
  const [page, setPage] = useState(1);

  useEffect(() => { void fetchClients(); }, []);

  async function fetchClients() {
    setLoading(true);
    // R-2: view decifrada, projeção mínima (sem PII financeira/filiação/documento
    // no payload da lista). (cast: a view não está nos tipos gerados.)
    const { data, error } = await (supabase as unknown as {
      from: (t: string) => {
        select: (c: string) => { order: (col: string, o: { ascending: boolean }) => Promise<{ data: ClientListRow[] | null; error: unknown }> };
      };
    }).from("clients_decrypted").select(CLIENT_LIST_COLUMNS).order("created_at", { ascending: false });
    if (error) toast.error("Erro ao carregar clientes");
    else setClients((data as ClientListRow[]) ?? []);
    setLoading(false);
  }

  // Detecta CPF (11+ dígitos, só caracteres de CPF) → busca exata via RPC.
  useEffect(() => {
    const raw = search.trim();
    const digits = raw.replace(/\D/g, "");
    const isCpf = digits.length >= 11 && /^[\d.\-/\s]+$/.test(raw);
    if (!isCpf) { setCpfMatchIds(null); return; }
    let cancelled = false;
    (async () => {
      const { data, error } = await (supabase as unknown as {
        rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: { id: string }[] | null; error: unknown }>;
      }).rpc("search_clients_by_cpf", { cpf_input: raw });
      if (cancelled) return;
      setCpfMatchIds(error ? [] : ((data as { id: string }[] | null) ?? []).map(r => r.id));
    })();
    return () => { cancelled = true; };
  }, [search]);

  useEffect(() => { setPage(1); }, [search, statusFilter, stateFilter]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    clients.forEach(c => { counts[c.status] = (counts[c.status] || 0) + 1; });
    return counts;
  }, [clients]);

  const uniqueStates = useMemo(() => {
    const states = new Set(clients.map(c => c.state).filter(Boolean) as string[]);
    return Array.from(states).sort();
  }, [clients]);

  const filtered = useMemo(() => {
    let result = clients;
    if (cpfMatchIds !== null) {
      const ids = new Set(cpfMatchIds);
      result = result.filter(c => ids.has(c.id));
    } else if (search) {
      const s = search.toLowerCase();
      result = result.filter(c =>
        c.full_name.toLowerCase().includes(s) ||
        (c.city && c.city.toLowerCase().includes(s))
      );
    }
    if (statusFilter !== "todos") result = result.filter(c => c.status === statusFilter);
    if (stateFilter !== "todos") result = result.filter(c => c.state === stateFilter);
    return result;
  }, [clients, search, cpfMatchIds, statusFilter, stateFilter]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (workspace && !hasAccess) return <RestrictedAccess />;

  return (
    <div style={pageStyle}>
      <style>{`
        .client-row { transition: background 0.15s ease, border-color 0.15s ease; }
        .client-row:hover { background: rgba(201,168,76,0.08) !important; border-color: rgba(201,168,76,0.4) !important; }
      `}</style>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <button className="btn-voltar" onClick={() => navigate("/sistema")} style={ghostButtonStyle}>← Voltar</button>
        <h1 style={{ fontFamily: "'Roboto', sans-serif", fontSize: 24, fontWeight: 600, color: "var(--gold, #c9a84c)", margin: 0 }}>
          Gestão de Clientes
        </h1>
        <span style={{ fontSize: 12, color: "var(--text3)", background: "var(--bg2)", padding: "4px 10px", borderRadius: 6 }}>
          {clients.length} total
        </span>
        <div style={{ flex: 1 }} />
        <button onClick={() => navigate("/clientes/novo")} style={goldButtonStyle}>+ Novo Cliente</button>
      </div>

      {/* Search + Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <input
          style={{ ...inputStyle, maxWidth: 340, flex: "1 1 220px" }}
          placeholder="Buscar por nome, cidade ou CPF exato…"
          value={search} onChange={e => setSearch(e.target.value)}
        />
        <select style={{ ...selectStyle, maxWidth: 180 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="todos">Todos os status</option>
          {Object.entries(statusCounts).map(([s, c]) => (
            <option key={s} value={s}>{s} ({c})</option>
          ))}
        </select>
        <select style={{ ...selectStyle, maxWidth: 120 }} value={stateFilter} onChange={e => setStateFilter(e.target.value)}>
          <option value="todos">Todos UF</option>
          {uniqueStates.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <span style={{ fontSize: 11, color: "var(--text3)" }}>
          {filtered.length} resultado{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* List */}
      {loading ? <HexagonLoader variant="inline" /> : filtered.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--text3)", fontSize: 13 }}>
          Nenhum cliente encontrado.
        </div>
      ) : (
        <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
          {/* Column header */}
          <div style={{
            display: "grid", gridTemplateColumns: "2fr 1fr 1fr 0.8fr", gap: 12, padding: "10px 16px",
            fontSize: 10, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.08em",
            fontWeight: 700, borderBottom: "1px solid var(--border)",
          }}>
            <div>Nome</div><div>Cidade/UF</div><div>Cadastro</div><div>Status</div>
          </div>
          {paginated.map(client => (
            <div
              key={client.id}
              className="client-row"
              onClick={() => navigate(`/clientes/${client.id}`)}
              style={{
                display: "grid", gridTemplateColumns: "2fr 1fr 1fr 0.8fr", gap: 12,
                padding: "12px 16px", cursor: "pointer", alignItems: "center",
                borderBottom: "1px solid var(--border)", borderLeft: "2px solid transparent",
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {client.full_name}
                {client.tipo_pessoa === "juridica" && (
                  <span style={{ fontSize: 9, color: "var(--text3)", marginLeft: 6, fontWeight: 500 }}>PJ</span>
                )}
              </div>
              <div style={{ fontSize: 12, color: "var(--text2)" }}>
                {client.city ? `${client.city}${client.state ? "/" + client.state : ""}` : "—"}
              </div>
              <div style={{ fontSize: 12, color: "var(--text3)" }}>{formatDateBR(client.created_at)}</div>
              <div><span style={statusBadgeStyle(client.status)}>{client.status}</span></div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{
            ...ghostButtonStyle, opacity: page === 1 ? 0.5 : 1, cursor: page === 1 ? "default" : "pointer",
          }}>← Anterior</button>
          {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
            let pageNum: number;
            if (totalPages <= 7) pageNum = i + 1;
            else if (page <= 4) pageNum = i + 1;
            else if (page >= totalPages - 3) pageNum = totalPages - 6 + i;
            else pageNum = page - 3 + i;
            return (
              <button key={pageNum} onClick={() => setPage(pageNum)} style={{
                padding: "6px 12px", borderRadius: 6, fontSize: 12,
                border: pageNum === page ? "1px solid rgba(201,168,76,0.5)" : "1px solid var(--border)",
                background: pageNum === page ? "rgba(201,168,76,0.15)" : "var(--bg2)",
                color: pageNum === page ? "#c9a84c" : "var(--text2)",
                cursor: "pointer", fontWeight: pageNum === page ? 700 : 400, fontFamily: "'DM Sans', sans-serif",
              }}>{pageNum}</button>
            );
          })}
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={{
            ...ghostButtonStyle, opacity: page === totalPages ? 0.5 : 1, cursor: page === totalPages ? "default" : "pointer",
          }}>Próxima →</button>
          <span style={{ fontSize: 11, color: "var(--text3)", marginLeft: 8 }}>Pág. {page}/{totalPages}</span>
        </div>
      )}
    </div>
  );
}
