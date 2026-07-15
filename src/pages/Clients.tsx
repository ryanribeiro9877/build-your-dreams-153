import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useMyWorkspace } from "@/hooks/useMyWorkspace";
import { toast } from "sonner";
import { HexagonLoader } from "@/components/HexagonLoader";
import {
  type SearchClientRow, RestrictedAccess,
  StatusBadge, EmptyState, formatDateBR,
} from "@/components/clients/shared";
import { usePermissions } from "@/hooks/usePermissions";
import {
  ClientFiltersPanel, type ClientFilters, EMPTY_FILTERS, buildFiltros,
} from "@/components/clients/ClientFiltersPanel";
import { useClientSavedFilters } from "@/hooks/useClientSavedFilters";

const PAGE_SIZE = 20;

export default function Clients() {
  const { workspace } = useMyWorkspace();
  const { canAccessClients } = usePermissions();
  const navigate = useNavigate();

  const [clients, setClients] = useState<SearchClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [errored, setErrored] = useState(false);
  const [filters, setFilters] = useState<ClientFilters>(EMPTY_FILTERS);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [page, setPage] = useState(1);

  const { savedFilters, available: savedAvailable, save, remove } = useClientSavedFilters();

  async function handleSaveFilter() {
    const name = window.prompt("Nome do filtro salvo:");
    if (!name || !name.trim()) return;
    try { await save(name.trim(), filters); toast.success("Filtro salvo"); }
    catch { toast.error("Não foi possível salvar o filtro"); }
  }

  function applySaved(id: string) {
    const sf = savedFilters.find(s => s.id === id);
    if (!sf) return;
    setFilters({ ...EMPTY_FILTERS, ...sf.filter });
  }

  async function handleRemoveSaved(id: string) {
    try { await remove(id); toast.success("Filtro removido"); }
    catch { toast.error("Não foi possível remover o filtro"); }
  }

  // debounce dos filtros → 1 chamada de RPC. A guarda `cancelled` garante que
  // só o resultado da busca mais recente atualize o estado (uma resposta antiga,
  // atrasada na rede, não sobrescreve a atual — nem exibe dados fora dos filtros).
  useEffect(() => {
    let cancelled = false;
    const h = setTimeout(() => {
      void (async () => {
        setLoading(true);
        const { data, error } = await (supabase as unknown as {
          rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: SearchClientRow[] | null; error: { code?: string } | null }>;
        }).rpc("search_clients", { p_filtros: buildFiltros(filters) });
        if (cancelled) return;
        if (error) {
          setClients([]);
          if (error.code === "42501") { setDenied(true); setErrored(false); }
          else { setDenied(false); setErrored(true); toast.error("Não foi possível buscar clientes"); }
        } else {
          setDenied(false);
          setErrored(false);
          setClients((data as SearchClientRow[]) ?? []);
        }
        setLoading(false);
      })();
    }, 300);
    return () => { cancelled = true; clearTimeout(h); };
  }, [filters]);

  useEffect(() => { setPage(1); }, [filters]);

  const patch = (p: Partial<ClientFilters>) => setFilters(prev => ({ ...prev, ...p }));

  const totalPages = Math.ceil(clients.length / PAGE_SIZE);
  const paginated = useMemo(() => clients.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [clients, page]);

  // DEF-2: guard de rota usa a MESMA fonte de verdade do menu (canAccessClients =
  // userRole "receptionist"). Clientes é EXCLUSIVO da recepção — sem isenção de
  // sócio/admin/diretor por URL direta.
  if (workspace && !canAccessClients) return <RestrictedAccess />;

  return (
    <div className="cli-root">
      <div className="cli-wrap">
        <div className="cli-top">
          <button className="cli-back" onClick={() => navigate("/sistema")}>← Voltar</button>
          <span className="cli-title">Gestão de Clientes</span>
          <span className="cli-count">{clients.length} resultado{clients.length !== 1 ? "s" : ""}</span>
          <span className="cli-spacer" />
          <button className="cli-btn ghost sm" onClick={() => setShowAdvanced(s => !s)}>
            {showAdvanced ? "Ocultar filtros" : "Filtros avançados"}
          </button>
          <button className="cli-btn" onClick={() => navigate("/clientes/novo")}>+ Novo Cliente</button>
        </div>

        {/* filtros básicos sempre visíveis */}
        <div className="cli-toolbar">
          <input className="cli-input" style={{ maxWidth: 320, flex: "1 1 220px" }}
            placeholder="Buscar por nome…" value={filters.nome}
            onChange={e => patch({ nome: e.target.value })} />
          <button className="cli-btn ghost sm" onClick={() => setFilters(EMPTY_FILTERS)}>Limpar filtros</button>
        </div>

        {savedAvailable && (
          <div className="cli-toolbar" style={{ gap: 8 }}>
            <select className="cli-select" style={{ maxWidth: 240 }} defaultValue=""
              onChange={e => { if (e.target.value) { applySaved(e.target.value); e.target.value = ""; } }}>
              <option value="">Filtros salvos…</option>
              {savedFilters.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <button className="cli-btn ghost sm" onClick={() => void handleSaveFilter()}>Salvar filtro atual</button>
            {savedFilters.length > 0 && (
              <select className="cli-select" style={{ maxWidth: 200 }} defaultValue=""
                onChange={e => { if (e.target.value) { void handleRemoveSaved(e.target.value); e.target.value = ""; } }}>
                <option value="">Excluir salvo…</option>
                {savedFilters.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
          </div>
        )}

        {showAdvanced && <ClientFiltersPanel filters={filters} onChange={patch} />}

        {denied ? (
          <EmptyState icon="🔒" title="Acesso restrito" hint="Apenas recepção ou sócio podem buscar clientes." />
        ) : errored ? (
          <EmptyState icon="⚠" title="Não foi possível buscar clientes" hint="Ocorreu um erro ao consultar a base. Tente novamente em instantes." />
        ) : loading ? <HexagonLoader variant="inline" /> : clients.length === 0 ? (
          <EmptyState icon="⌕" title="Nenhum cliente encontrado" hint="Ajuste a busca ou os filtros, ou cadastre um novo cliente." />
        ) : (
          <div className="cli-table">
            <div className="cli-thead">
              <div>Nome</div><div>Cidade/UF</div><div>Cadastro</div><div>Status</div>
            </div>
            {paginated.map(client => (
              <div key={client.id} className="cli-trow" onClick={() => navigate(`/clientes/${client.id}`)}>
                <div className="name">{client.full_name}</div>
                <div className="muted">{client.city ? `${client.city}${client.state ? "/" + client.state : ""}` : "—"}</div>
                <div className="muted">{formatDateBR(client.created_at)}</div>
                <div><StatusBadge status={client.status} /></div>
              </div>
            ))}
          </div>
        )}

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
