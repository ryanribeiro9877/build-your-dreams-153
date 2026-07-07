import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useMyWorkspace } from "@/hooks/useMyWorkspace";
import { toast } from "sonner";
import { HexagonLoader } from "@/components/HexagonLoader";
import {
  type ClientListRow, CLIENT_LIST_COLUMNS, ALLOWED_ROLES, RestrictedAccess,
  StatusBadge, EmptyState, formatDateBR,
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
    <div className="cli-root">
      <div className="cli-wrap">
        {/* top bar */}
        <div className="cli-top">
          <button className="cli-back" onClick={() => navigate("/sistema")}>← Voltar</button>
          <span className="cli-title">Gestão de Clientes</span>
          <span className="cli-count">{clients.length} total</span>
          <span className="cli-spacer" />
          <button className="cli-btn" onClick={() => navigate("/clientes/novo")}>+ Novo Cliente</button>
        </div>

        {/* search + filters */}
        <div className="cli-toolbar">
          <input
            className="cli-input"
            style={{ maxWidth: 360, flex: "1 1 240px" }}
            placeholder="Buscar por nome, cidade ou CPF exato…"
            value={search} onChange={e => setSearch(e.target.value)}
          />
          <select className="cli-select" style={{ maxWidth: 190 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="todos">Todos os status</option>
            {Object.entries(statusCounts).map(([s, c]) => (
              <option key={s} value={s}>{s} ({c})</option>
            ))}
          </select>
          <select className="cli-select" style={{ maxWidth: 130 }} value={stateFilter} onChange={e => setStateFilter(e.target.value)}>
            <option value="todos">Todos UF</option>
            {uniqueStates.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <span style={{ fontSize: 12, color: "var(--cli-muted-light)", fontWeight: 600 }}>
            {filtered.length} resultado{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* list */}
        {loading ? <HexagonLoader variant="inline" /> : filtered.length === 0 ? (
          <EmptyState icon="⌕" title="Nenhum cliente encontrado" hint="Ajuste a busca ou os filtros, ou cadastre um novo cliente." />
        ) : (
          <div className="cli-table">
            <div className="cli-thead">
              <div>Nome</div><div>Cidade/UF</div><div>Cadastro</div><div>Status</div>
            </div>
            {paginated.map(client => (
              <div key={client.id} className="cli-trow" onClick={() => navigate(`/clientes/${client.id}`)}>
                <div className="name">
                  {client.full_name}
                  {client.tipo_pessoa === "juridica" && <span className="pj">PJ</span>}
                </div>
                <div className="muted">{client.city ? `${client.city}${client.state ? "/" + client.state : ""}` : "—"}</div>
                <div className="muted">{formatDateBR(client.created_at)}</div>
                <div><StatusBadge status={client.status} /></div>
              </div>
            ))}
          </div>
        )}

        {/* pagination */}
        {totalPages > 1 && (
          <div className="cli-pager">
            <button className="cli-pg" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>← Anterior</button>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              let pageNum: number;
              if (totalPages <= 7) pageNum = i + 1;
              else if (page <= 4) pageNum = i + 1;
              else if (page >= totalPages - 3) pageNum = totalPages - 6 + i;
              else pageNum = page - 3 + i;
              return (
                <button key={pageNum} className={`cli-pg${pageNum === page ? " active" : ""}`} onClick={() => setPage(pageNum)}>
                  {pageNum}
                </button>
              );
            })}
            <button className="cli-pg" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Próxima →</button>
            <span className="cli-pageinfo">Pág. {page}/{totalPages}</span>
          </div>
        )}
      </div>
    </div>
  );
}
