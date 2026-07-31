import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { EmptyState, STATUS_OPTIONS, STATES, formatDateBR } from "@/components/clients/shared";
import { useBancosConhecidos } from "@/hooks/useBancosConhecidos";
import {
  CAMPANHA_OBJETIVO_LABELS, CAMPANHA_OBJETIVO_OPTIONS, CAMPANHA_STATUS_META,
  CAMPANHA_ITEM_STATUS_META, LIGACAO_RESULTADO_META, LIGACAO_RESULTADO_OPTIONS,
} from "@/lib/motor1";
import { FILA_GOV_ESTADOS, STATUS_ACESSO_META, STATUS_ACESSO_OPTIONS } from "@/lib/motores23";
import { PainelRenovacao } from "@/components/procuracoes/PainelRenovacao";

/* ============================================================
   Card 4 — Campanhas de ligação + KPI
   ============================================================
   Três blocos: KPI do período, criação de campanha (com PRÉ-VOO da contagem) e
   a lista de campanhas, que abre a FILA para registrar ligação.

   Escrita só por RPC (criar_campanha, registrar_ligacao). As tabelas não têm
   policy de INSERT/UPDATE — é a mesma via que o chat usa, então tela e chat
   produzem exatamente o mesmo registro.

   PRÉ-VOO: o filtro é contado com `search_clients` ANTES de criar, com o MESMO
   jsonb que `criar_campanha` vai aplicar. Isso existe porque a RPC IGNORA chave
   de filtro desconhecida em silêncio — sem a contagem à vista, um filtro errado
   viraria "campanha para a base inteira" sem ninguém perceber.
============================================================ */

const PAGE_SIZE = 50;

interface CampanhaRow {
  id: string; nome: string; objetivo: string; status: string;
  filtro: Record<string, unknown> | null; created_at: string;
}

interface ItemRow {
  id: string; campanha_id: string; client_id: string; status: string;
  tentativas: number; ultima_tentativa: string | null; observacao: string | null;
}

interface KpiOperador {
  operador: string; total: number; atendeu: number;
  nao_atendeu: number; retornar: number; numero_errado: number;
}
interface KpiCampanha { campanha: string; total: number; pendentes: number; concluidos: number; }
interface KpiPayload { de: string; ate: string; por_operador: KpiOperador[]; campanhas_ativas: KpiCampanha[]; }

/* ---------- acesso ---------- */

type RpcRes<T> = Promise<{ data: T | null; error: { code?: string; message?: string } | null }>;

// Cast: as RPCs/tabelas do Motor 1 ainda não estão nos tipos gerados. Chamadas
// sempre ACOPLADAS ao client (desacoplar `rpc` quebra em `this.rest`).
function rpc<T>(fn: string, args: Record<string, unknown>): RpcRes<T> {
  return (supabase as unknown as { rpc: (f: string, a: Record<string, unknown>) => RpcRes<T> }).rpc(fn, args);
}

type Query = {
  select: (c: string, o?: { count?: "exact"; head?: boolean }) => Query;
  eq: (k: string, v: unknown) => Query;
  in: (k: string, v: unknown[]) => Query;
  not: (k: string, op: string, v: unknown) => Query;
  order: (c: string, o: { ascending: boolean }) => Query;
  range: (a: number, b: number) => Query;
  limit: (n: number) => Query;
  then: <R>(f: (r: { data: unknown; error: { message?: string } | null; count: number | null }) => R) => Promise<R>;
};
function from(table: string): Query {
  return (supabase as unknown as { from: (t: string) => Query }).from(table);
}

const hoje = () => new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD local

/* ---------- KPI ---------- */

function KpiPanel() {
  const [de, setDe] = useState(hoje());
  const [ate, setAte] = useState(hoje());
  const [kpi, setKpi] = useState<KpiPayload | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setKpi(null); setErro(null);
      // `p_ate` omitido faria a RPC usar `coalesce(p_ate, p_de)`; passo os dois
      // porque a tela sempre tem os dois preenchidos.
      const { data, error } = await rpc<KpiPayload>("kpi_ligacoes", { p_de: de, p_ate: ate });
      if (cancelled) return;
      if (error) { setErro(error.code === "42501" ? "Sem permissão para ver o KPI de ligações." : (error.message ?? "erro")); return; }
      setKpi(data);
    })();
    return () => { cancelled = true; };
  }, [de, ate]);

  const totalGeral = (kpi?.por_operador ?? []).reduce((s, o) => s + o.total, 0);
  const atendeuGeral = (kpi?.por_operador ?? []).reduce((s, o) => s + o.atendeu, 0);

  return (
    <div className="cli-card lift" style={{ padding: 18 }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <div className="cli-sec-title" style={{ padding: "2px 4px 0", flex: 1 }}>Ligações no período</div>
        <div>
          <label className="cli-label">De</label>
          <input className="cli-input" type="date" value={de} max={ate}
            onChange={e => setDe(e.target.value || hoje())} />
        </div>
        <div>
          <label className="cli-label">até</label>
          <input className="cli-input" type="date" value={ate} min={de}
            onChange={e => setAte(e.target.value || hoje())} />
        </div>
      </div>

      {erro ? (
        <EmptyState icon="⚠" title="KPI indisponível" hint={erro} />
      ) : kpi === null ? (
        <div className="cli-loading">Carregando…</div>
      ) : kpi.por_operador.length === 0 ? (
        <EmptyState icon="☏" title="Nenhuma ligação registrada no período"
          hint="Cada ligação registrada — pela fila abaixo ou pelo chat — entra neste painel." />
      ) : (
        <>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
            <span className="cli-chip n">{totalGeral} ligação{totalGeral !== 1 ? "ões" : ""}</span>
            <span className="cli-chip ok">{atendeuGeral} atendida{atendeuGeral !== 1 ? "s" : ""}</span>
            <span className="cli-chip p">
              {totalGeral > 0 ? `${Math.round((atendeuGeral / totalGeral) * 100)}% de contato` : "—"}
            </span>
          </div>
          <div className="cli-table">
            <div className="cli-thead" style={{ gridTemplateColumns: "1.6fr repeat(5, .7fr)" }}>
              <div>Operador</div><div>Total</div><div>Atendeu</div>
              <div>Não atendeu</div><div>Retornar</div><div>Nº errado</div>
            </div>
            {kpi.por_operador.map(o => (
              <div key={o.operador} className="cli-trow" style={{ gridTemplateColumns: "1.6fr repeat(5, .7fr)", cursor: "default" }}>
                <div className="name">{o.operador}</div>
                <div>{o.total}</div><div>{o.atendeu}</div>
                <div className="muted">{o.nao_atendeu}</div>
                <div className="muted">{o.retornar}</div>
                <div className="muted">{o.numero_errado}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ---------- Criar campanha ---------- */

const FILTRO_VAZIO = {
  recebe_em: "", tem_consignado_com: "", tem_extrato_de: "",
  cidade: "", uf: "", status: "",
};

function NovaCampanhaCard({ onCriada }: { onCriada: () => void }) {
  const bancos = useBancosConhecidos();
  const [nome, setNome] = useState("");
  const [objetivo, setObjetivo] = useState(CAMPANHA_OBJETIVO_OPTIONS[0].value);
  const [f, setF] = useState({ ...FILTRO_VAZIO });
  const [contagem, setContagem] = useState<number | null>(null);
  const [contando, setContando] = useState(false);
  const [criando, setCriando] = useState(false);

  // O jsonb enviado à RPC. Só chave conhecida por search_clients entra; banco e
  // UF sobem para MAIÚSCULAS (é como a base grava).
  const filtro = useMemo(() => {
    const p: Record<string, unknown> = {};
    const up = new Set(["recebe_em", "tem_consignado_com", "tem_extrato_de", "uf"]);
    for (const [k, v] of Object.entries(f)) {
      const s = v.trim();
      if (s) p[k] = up.has(k) ? s.toUpperCase() : s;
    }
    return p;
  }, [f]);

  // Contagem sempre que o filtro muda: é o número de clientes que ENTRARIA na
  // fila. Zerada a cada alteração para nunca exibir contagem de outro filtro.
  useEffect(() => {
    let cancelled = false;
    setContagem(null);
    const h = setTimeout(() => {
      void (async () => {
        setContando(true);
        const { data, error } = await rpc<{ id: string }[]>("search_clients", { p_filtros: filtro });
        if (cancelled) return;
        setContando(false);
        if (error) { toast.error(error.code === "42501" ? "Sem permissão para contar clientes." : "Não foi possível contar a fila."); return; }
        setContagem((data ?? []).length);
      })();
    }, 350);
    return () => { cancelled = true; clearTimeout(h); };
  }, [filtro]);

  const set = (k: keyof typeof FILTRO_VAZIO) => (e: { target: { value: string } }) =>
    setF(prev => ({ ...prev, [k]: e.target.value }));

  const semFiltro = Object.keys(filtro).length === 0;

  async function criar() {
    if (!nome.trim()) { toast.error("Dê um nome à campanha."); return; }
    setCriando(true);
    const { data, error } = await rpc<{ campanha_id: string; nome: string; clientes: number }>(
      "criar_campanha", { p_nome: nome.trim(), p_objetivo: objetivo, p_filtro: filtro },
    );
    setCriando(false);
    if (error) {
      toast.error(error.code === "42501"
        ? "Sem permissão para criar campanha."
        : `Campanha NÃO criada: ${error.message ?? "erro"}`);
      return;
    }
    toast.success(`Campanha "${data?.nome}" criada com ${data?.clientes ?? 0} cliente(s) na fila.`);
    setNome(""); setF({ ...FILTRO_VAZIO });
    onCriada();
  }

  return (
    <div className="cli-card lift" style={{ padding: 18 }}>
      <div className="cli-sec-title" style={{ padding: "2px 4px 10px" }}>Nova campanha</div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
        <div style={{ flex: "1 1 220px" }}>
          <label className="cli-label">Nome</label>
          <input className="cli-input" value={nome} onChange={e => setNome(e.target.value)}
            placeholder="Ex.: Consignados AGIBANK — extrato" />
        </div>
        <div style={{ flex: "1 1 200px" }}>
          <label className="cli-label">Objetivo</label>
          <select className="cli-select" value={objetivo} onChange={e => setObjetivo(e.target.value)}>
            {CAMPANHA_OBJETIVO_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end", marginTop: 10 }}>
        <div style={{ flex: "1 1 170px" }}>
          <label className="cli-label">Recebe em</label>
          <input className="cli-input" list="camp-bancos" value={f.recebe_em} onChange={set("recebe_em")} placeholder="banco do benefício" />
        </div>
        <div style={{ flex: "1 1 170px" }}>
          <label className="cli-label">Tem consignado com</label>
          <input className="cli-input" list="camp-bancos" value={f.tem_consignado_com} onChange={set("tem_consignado_com")} placeholder="banco" />
        </div>
        <div style={{ flex: "1 1 170px" }}>
          <label className="cli-label">Extrato em posse, do banco</label>
          <input className="cli-input" list="camp-bancos" value={f.tem_extrato_de} onChange={set("tem_extrato_de")} placeholder="banco" />
        </div>
        <datalist id="camp-bancos">{bancos.map(b => <option key={b} value={b} />)}</datalist>
        <div style={{ flex: "1 1 140px" }}>
          <label className="cli-label">Cidade</label>
          <input className="cli-input" value={f.cidade} onChange={set("cidade")} />
        </div>
        <div style={{ flex: "0 1 100px" }}>
          <label className="cli-label">UF</label>
          <select className="cli-select" value={f.uf} onChange={set("uf")}>
            <option value="">Todas</option>
            {STATES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div style={{ flex: "0 1 150px" }}>
          <label className="cli-label">Status do cliente</label>
          <select className="cli-select" value={f.status} onChange={set("status")}>
            <option value="">Todos</option>
            {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 14 }}>
        <span className={`cli-chip ${semFiltro ? "d" : "n"}`}>
          {contando || contagem === null
            ? "contando a fila…"
            : `${contagem} cliente${contagem !== 1 ? "s" : ""} na fila`}
        </span>
        {semFiltro && (
          <span style={{ fontSize: 12, color: "var(--cli-muted)", fontWeight: 600 }}>
            sem nenhum filtro a campanha pega a BASE TODA
          </span>
        )}
        <span style={{ flex: 1 }} />
        <button className="cli-btn" disabled={criando || !nome.trim()} onClick={() => void criar()}>
          {criando ? "Criando…" : "Criar campanha"}
        </button>
      </div>
    </div>
  );
}

/* ---------- Fila da campanha ---------- */

interface FilaItem extends ItemRow {
  nome: string | null;
  telefone: string | null;
}

function RegistrarLigacao({ item, campanhaId, onFeito }: {
  item: FilaItem; campanhaId: string; onFeito: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [resultado, setResultado] = useState(LIGACAO_RESULTADO_OPTIONS[0].value);
  const [obs, setObs] = useState("");
  const [retornarEm, setRetornarEm] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    setSalvando(true);
    const { data, error } = await rpc<{ ok?: boolean; motivo?: string; follow_up_criado?: boolean }>(
      "registrar_ligacao", {
        p_resultado: resultado,
        p_client_id: item.client_id,
        p_campanha_id: campanhaId,
        p_observacao: obs.trim() || null,
        // `retornar` + data → a RPC cria a pendência de retorno. Sem data, o
        // resultado é gravado mas NENHUM follow-up nasce; o aviso abaixo diz isso.
        p_retornar_em: resultado === "retornar" && retornarEm ? new Date(retornarEm).toISOString() : null,
      },
    );
    setSalvando(false);
    if (error) { toast.error(`Ligação NÃO registrada: ${error.message ?? "erro"}`); return; }
    if (!data?.ok) { toast.error(`Ligação NÃO registrada${data?.motivo ? ` (${data.motivo})` : "."}`); return; }
    toast.success(data.follow_up_criado
      ? "Ligação registrada e retorno agendado."
      : "Ligação registrada.");
    setAberto(false); setObs(""); setRetornarEm("");
    onFeito();
  }

  if (!aberto) {
    return <button className="cli-btn sm" onClick={() => setAberto(true)}>☏ Registrar ligação</button>;
  }
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end", width: "100%", marginTop: 8 }}>
      <div style={{ flex: "0 1 160px" }}>
        <label className="cli-label">Resultado</label>
        <select className="cli-select" value={resultado} onChange={e => setResultado(e.target.value)}>
          {LIGACAO_RESULTADO_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      {resultado === "retornar" && (
        <div style={{ flex: "0 1 210px" }}>
          <label className="cli-label">Retornar em</label>
          <input className="cli-input" type="datetime-local" value={retornarEm}
            onChange={e => setRetornarEm(e.target.value)} />
        </div>
      )}
      <div style={{ flex: "1 1 200px" }}>
        <label className="cli-label">Observação</label>
        <input className="cli-input" value={obs} onChange={e => setObs(e.target.value)} placeholder="opcional" />
      </div>
      <button className="cli-btn sm" disabled={salvando} onClick={() => void salvar()}>
        {salvando ? "Salvando…" : "Salvar"}
      </button>
      <button className="cli-btn sm ghost" disabled={salvando} onClick={() => setAberto(false)}>Cancelar</button>
      {resultado === "retornar" && !retornarEm && (
        <div style={{ flexBasis: "100%", fontSize: 12, color: "var(--cli-muted)", fontWeight: 600 }}>
          Sem data de retorno o resultado é gravado, mas nenhuma pendência de follow-up é criada.
        </div>
      )}
    </div>
  );
}

function FilaCampanha({ campanha, onFechar }: { campanha: CampanhaRow; onFechar: () => void }) {
  const [itens, setItens] = useState<FilaItem[] | null>(null);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [soPendentes, setSoPendentes] = useState(true);

  const load = useCallback(async () => {
    setItens(null);
    let q = from("campanha_itens")
      .select("id, campanha_id, client_id, status, tentativas, ultima_tentativa, observacao", { count: "exact" })
      .eq("campanha_id", campanha.id);
    if (soPendentes) q = q.in("status", ["pendente", "em_andamento"]);
    const res = await q.order("status", { ascending: true }).range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (res.error) { toast.error(`Erro ao carregar a fila: ${res.error.message ?? ""}`); setItens([]); return; }
    const rows = (res.data as ItemRow[] | null) ?? [];
    setTotal(res.count ?? rows.length);

    // Nome e telefone vêm de `clients` (RLS can_view_clients) — só os ids desta
    // página, para a URL do PostgREST não estourar.
    const ids = rows.map(r => r.client_id);
    let nomes = new Map<string, { nome: string | null; telefone: string | null }>();
    if (ids.length > 0) {
      const cRes = await from("clients").select("id, full_name, phone").in("id", ids);
      const cRows = (cRes.data as { id: string; full_name: string | null; phone: string | null }[] | null) ?? [];
      nomes = new Map(cRows.map(c => [c.id, { nome: c.full_name, telefone: c.phone }]));
    }
    setItens(rows.map(r => ({ ...r, nome: nomes.get(r.client_id)?.nome ?? null, telefone: nomes.get(r.client_id)?.telefone ?? null })));
  }, [campanha.id, page, soPendentes]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setPage(0); }, [soPendentes]);

  const semTelefone = (itens ?? []).filter(i => !i.telefone?.trim()).length;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="cli-card lift" style={{ padding: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <div className="cli-sec-title" style={{ padding: "2px 4px 0" }}>
          Fila · {campanha.nome}
        </div>
        <span className="cli-chip n">{CAMPANHA_OBJETIVO_LABELS[campanha.objetivo] ?? campanha.objetivo}</span>
        <span style={{ flex: 1 }} />
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600 }}>
          <input type="checkbox" checked={soPendentes} onChange={e => setSoPendentes(e.target.checked)} />
          só quem falta ligar
        </label>
        <button className="cli-btn sm ghost" onClick={onFechar}>Fechar</button>
      </div>

      {itens === null ? <div className="cli-loading">Carregando…</div>
        : itens.length === 0 ? (
          <EmptyState icon="☏" title={soPendentes ? "Nada pendente nesta campanha" : "Fila vazia"}
            hint={soPendentes ? "Todos os clientes da fila já foram tratados." : "O filtro da campanha não selecionou nenhum cliente."} />
        ) : (
          <>
            {semTelefone > 0 && (
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--cli-muted)", marginBottom: 10 }}>
                {semTelefone} de {itens.length} nesta página <strong>sem telefone cadastrado</strong> —
                não há como ligar antes de completar o cadastro.
              </div>
            )}
            {itens.map(it => {
              const meta = CAMPANHA_ITEM_STATUS_META[it.status] ?? { label: it.status, cls: "n" };
              return (
                <div key={it.id} style={{ borderBottom: "1px solid var(--cli-line, rgba(0,0,0,.06))", padding: "10px 4px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <div style={{ minWidth: 0, flex: "1 1 220px" }}>
                      <div style={{ fontWeight: 800, fontSize: 14, color: "var(--cli-ink)" }}>
                        {it.nome ?? "(cliente sem nome)"}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--cli-muted)", fontWeight: 600 }}>
                        {it.telefone?.trim() ? it.telefone : "sem telefone"}
                        {it.tentativas > 0 ? ` · ${it.tentativas} tentativa(s)` : ""}
                        {it.ultima_tentativa ? ` · última ${formatDateBR(it.ultima_tentativa)}` : ""}
                        {it.observacao ? ` · ${it.observacao}` : ""}
                      </div>
                    </div>
                    <span className={`cli-chip ${meta.cls}`}>{meta.label}</span>
                    <RegistrarLigacao item={it} campanhaId={campanha.id} onFeito={() => void load()} />
                  </div>
                </div>
              );
            })}
            {totalPages > 1 && (
              <div className="cli-pager">
                <button className="cli-pg" disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))}>← Anterior</button>
                <span className="cli-pageinfo">Pág. {page + 1}/{totalPages} · {total} na fila</span>
                <button className="cli-pg" disabled={page + 1 >= totalPages} onClick={() => setPage(p => p + 1)}>Próxima →</button>
              </div>
            )}
          </>
        )}
    </div>
  );
}

/* ---------- Lista de campanhas ---------- */

function ListaCampanhas({ recarregar, onAbrir }: { recarregar: number; onAbrir: (c: CampanhaRow) => void }) {
  const [rows, setRows] = useState<CampanhaRow[] | null>(null);
  const [contagens, setContagens] = useState<Map<string, { total: number; pendentes: number }>>(new Map());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setRows(null);
      const res = await from("campanhas")
        .select("id, nome, objetivo, status, filtro, created_at")
        .order("created_at", { ascending: false });
      if (cancelled) return;
      if (res.error) { toast.error(`Erro ao carregar campanhas: ${res.error.message ?? ""}`); setRows([]); return; }
      const camps = (res.data as CampanhaRow[] | null) ?? [];
      setRows(camps);

      // Contadores por campanha via COUNT no servidor (head:true não traz linha):
      // duas contagens por campanha em vez de baixar milhares de itens.
      const mapa = new Map<string, { total: number; pendentes: number }>();
      await Promise.all(camps.map(async c => {
        const [t, p] = await Promise.all([
          from("campanha_itens").select("id", { count: "exact", head: true }).eq("campanha_id", c.id),
          from("campanha_itens").select("id", { count: "exact", head: true }).eq("campanha_id", c.id).in("status", ["pendente", "em_andamento"]),
        ]);
        mapa.set(c.id, { total: t.count ?? 0, pendentes: p.count ?? 0 });
      }));
      if (!cancelled) setContagens(mapa);
    })();
    return () => { cancelled = true; };
  }, [recarregar]);

  if (rows === null) return <div className="cli-card lift" style={{ padding: 18 }}><div className="cli-loading">Carregando…</div></div>;
  if (rows.length === 0) {
    return (
      <div className="cli-card lift" style={{ padding: 18 }}>
        <div className="cli-sec-title" style={{ padding: "2px 4px 10px" }}>Campanhas</div>
        <EmptyState icon="◎" title="Nenhuma campanha criada"
          hint="Monte a primeira no formulário acima — ou peça pelo chat: “criar campanha para quem recebe no Bradesco”." />
      </div>
    );
  }

  return (
    <div className="cli-card lift" style={{ padding: 18 }}>
      <div className="cli-sec-title" style={{ padding: "2px 4px 10px" }}>Campanhas · {rows.length}</div>
      {rows.map(c => {
        const meta = CAMPANHA_STATUS_META[c.status] ?? { label: c.status, cls: "n" };
        const cont = contagens.get(c.id);
        const filtroTxt = Object.entries(c.filtro ?? {})
          .map(([k, v]) => `${k}: ${String(v)}`).join(" · ");
        return (
          <div key={c.id} className="cli-row" onClick={() => onAbrir(c)} style={{ cursor: "pointer" }}>
            <div className="dot">◎</div>
            <div className="body">
              <div className="t">{c.nome}</div>
              <div className="s">
                {CAMPANHA_OBJETIVO_LABELS[c.objetivo] ?? c.objetivo}
                {` · ${formatDateBR(c.created_at)}`}
                {filtroTxt ? ` · ${filtroTxt}` : " · sem filtro (base toda)"}
              </div>
            </div>
            <span style={{ display: "flex", gap: 8, alignItems: "center", marginLeft: "auto", flexShrink: 0, flexWrap: "wrap" }}>
              {cont && <span className="cli-chip n">{cont.pendentes} de {cont.total} a ligar</span>}
              <span className={`cli-chip ${meta.cls}`}>{meta.label}</span>
              <button className="go" title="Abrir fila">›</button>
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ============================================================
   Card 7 — Fila de trabalho das contas gov.br
   ============================================================
   Mora AQUI, e não na aba Gov.br da ficha, porque é uma fila ENTRE clientes: a
   aba da ficha é o cofre de UM cliente. E o gate desta tela
   (RecepcaoOuSocioRoute) é exatamente o da RPC `fila_credenciais_gov`
   (is_recepcao_or_socio OR admin), então nada de novo precisa ser guardado.

   SEGURANÇA: a RPC devolve `tem_senha` BOOLEANO e nunca a senha — não existe
   caminho aqui que traga senha para a tela. O cofre segue sendo o único lugar que
   revela senha, com log de auditoria (aba Gov.br da ficha).

   LIMITAÇÃO REAL: a fila devolve o NOME do cliente, não o id. As ações por linha
   mandam `cliente_nome`, e a própria RPC resolve — se o nome for ambíguo ela
   recusa e a tela diz isso, em vez de agir no cliente errado.
============================================================ */

interface FilaGovItem {
  cliente: string;
  nivel: string | null;
  tem_2fa: boolean | null;
  status_acesso: string | null;
  tem_senha: boolean | null;
}

function AcoesGov({ item, onFeito }: { item: FilaGovItem; onFeito: () => void }) {
  const [modo, setModo] = useState<"" | "status" | "conversao">("");
  const [status, setStatus] = useState(STATUS_ACESSO_OPTIONS[0].value);
  const [ate, setAte] = useState("");
  const [obs, setObs] = useState("");
  const [busy, setBusy] = useState(false);

  function traduzFalha(d: { ok?: boolean; motivo?: string; mensagem?: string } | null,
                       e: { message?: string } | null, oQue: string): string | null {
    if (e) return `${oQue}: ${e.message ?? "erro"}`;
    if (!d) return `${oQue}: sem resposta.`;
    if (d.ok) return null;
    if (d.motivo === "ambiguo") return `${oQue}: há mais de um cliente com o nome "${item.cliente}". Resolva pela ficha do cliente.`;
    if (d.motivo === "cliente_nao_encontrado") return `${oQue}: cliente não encontrado.`;
    return `${oQue}: ${d.mensagem ?? d.motivo ?? "erro"}`;
  }

  async function salvarStatus() {
    setBusy(true);
    const { data, error } = await rpc<{ ok?: boolean; motivo?: string; mensagem?: string }>(
      "atualizar_status_credencial_gov",
      { p_status: status, p_client_id: null, p_cliente_nome: item.cliente, p_observacao: obs.trim() || null },
    );
    const err = traduzFalha(data, error, "Situação NÃO alterada");
    setBusy(false);
    if (err) { toast.error(err); return; }
    toast.success(status === "invalido"
      ? "Marcado como inválido — pendência de recuperação criada."
      : "Situação atualizada.");
    setModo(""); setObs("");
    onFeito();
  }

  async function salvarConversao() {
    setBusy(true);
    const { data, error } = await rpc<{ ok?: boolean; motivo?: string; mensagem?: string }>(
      "agendar_conversao_gov",
      { p_client_id: null, p_cliente_nome: item.cliente, p_ate: ate || null, p_observacao: obs.trim() || null },
    );
    const err = traduzFalha(data, error, "Conversão NÃO agendada");
    setBusy(false);
    if (err) { toast.error(err); return; }
    toast.success("Pendência de conversão aberta. O atendimento presencial é marcado pelo agendamento normal.");
    setModo(""); setAte(""); setObs("");
    onFeito();
  }

  if (!modo) {
    return (
      <span style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        <button className="cli-btn sm" onClick={() => setModo("conversao")}>Agendar conversão</button>
        <button className="cli-btn sm ghost" onClick={() => setModo("status")}>Marcar situação</button>
      </span>
    );
  }
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end", width: "100%", marginTop: 8 }}>
      {modo === "status" ? (
        <div style={{ flex: "0 1 170px" }}>
          <label className="cli-label">Situação do acesso</label>
          <select className="cli-select" value={status} onChange={e => setStatus(e.target.value)}>
            {STATUS_ACESSO_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      ) : (
        <div style={{ flex: "0 1 170px" }}>
          <label className="cli-label">Converter até</label>
          <input className="cli-input" type="date" value={ate} onChange={e => setAte(e.target.value)} />
        </div>
      )}
      <div style={{ flex: "1 1 200px" }}>
        <label className="cli-label">Observação</label>
        <input className="cli-input" value={obs} onChange={e => setObs(e.target.value)} placeholder="opcional" />
      </div>
      <button className="cli-btn sm" disabled={busy}
        onClick={() => void (modo === "status" ? salvarStatus() : salvarConversao())}>
        {busy ? "Salvando…" : "Salvar"}
      </button>
      <button className="cli-btn sm ghost" disabled={busy} onClick={() => setModo("")}>Cancelar</button>
      {modo === "status" && status === "invalido" && (
        <div style={{ flexBasis: "100%", fontSize: 12, color: "var(--cli-muted)", fontWeight: 600 }}>
          Marcar como inválido abre a pendência de recuperação de senha no Kanban.
        </div>
      )}
    </div>
  );
}

function FilaGovCard() {
  const [estado, setEstado] = useState(FILA_GOV_ESTADOS[0].value);
  const [reload, setReload] = useState(0);
  const [payload, setPayload] = useState<{ total: number; clientes: FilaGovItem[] } | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setPayload(null); setErro(null);
      const { data, error } = await rpc<{ ok?: boolean; motivo?: string; mensagem?: string; total?: number; clientes?: FilaGovItem[] }>(
        "fila_credenciais_gov", { p_estado: estado });
      if (cancelled) return;
      if (error) {
        setErro(error.code === "42501"
          ? "A fila de contas gov.br é restrita a recepção/sócio."
          : (error.message ?? "erro"));
        return;
      }
      if (data?.ok === false) { setErro(data.mensagem ?? data.motivo ?? "erro"); return; }
      setPayload({ total: data?.total ?? 0, clientes: data?.clientes ?? [] });
    })();
    return () => { cancelled = true; };
  }, [estado, reload]);

  const hint = FILA_GOV_ESTADOS.find(e => e.value === estado)?.hint ?? "";

  return (
    <div className="cli-card lift" style={{ padding: 18 }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <div className="cli-sec-title" style={{ padding: "2px 4px 0", flex: 1 }}>Fila de contas gov.br</div>
        <div style={{ flex: "0 1 210px" }}>
          <label className="cli-label">Recorte</label>
          <select className="cli-select" value={estado} onChange={e => setEstado(e.target.value)}>
            {FILA_GOV_ESTADOS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        {payload && <span className="cli-chip n">{payload.total} cliente{payload.total !== 1 ? "s" : ""}</span>}
      </div>
      <div style={{ fontSize: 12, color: "var(--cli-muted)", fontWeight: 500, marginBottom: 10 }}>
        {hint} · Esta lista nunca mostra senha — só se o escritório tem uma guardada.
      </div>

      {erro ? <EmptyState icon="⚠" title="Fila indisponível" hint={erro} />
        : payload === null ? <div className="cli-loading">Carregando…</div>
        : payload.clientes.length === 0 ? (
          <EmptyState icon="◇" title="Ninguém neste recorte"
            hint="Troque o recorte acima — bronze, 2FA, senha inválida, sem credencial…" />
        ) : payload.clientes.map((c, i) => {
          const st = c.status_acesso ? (STATUS_ACESSO_META[c.status_acesso] ?? { label: c.status_acesso, cls: "n" }) : null;
          return (
            <div key={`${c.cliente}-${i}`} style={{ borderBottom: "1px solid var(--cli-line, rgba(0,0,0,.06))", padding: "10px 4px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <div style={{ minWidth: 0, flex: "1 1 220px" }}>
                  <div style={{ fontWeight: 800, fontSize: 14, color: "var(--cli-ink)" }}>{c.cliente}</div>
                  <div style={{ fontSize: 12, color: "var(--cli-muted)", fontWeight: 600 }}>
                    {c.nivel ? `conta ${c.nivel}` : "nível não informado"}
                    {c.tem_2fa ? " · 2FA" : ""}
                    {` · ${c.tem_senha ? "senha guardada" : "sem senha guardada"}`}
                  </div>
                </div>
                {st && <span className={`cli-chip ${st.cls}`}>{st.label}</span>}
                <AcoesGov item={c} onFeito={() => setReload(k => k + 1)} />
              </div>
            </div>
          );
        })}
    </div>
  );
}

/* ---------- Página ---------- */

export default function Campanhas() {
  const navigate = useNavigate();
  const [recarregar, setRecarregar] = useState(0);
  const [aberta, setAberta] = useState<CampanhaRow | null>(null);
  const [base, setBase] = useState<{ total: number; comTelefone: number } | null>(null);

  // Aviso honesto: uma fila de ligação só é acionável para quem tem telefone.
  // Em 29/07 a base tinha 562 clientes e 6 com telefone (a importação em massa
  // não trouxe telefone), o que tornaria qualquer campanha inoperante na prática
  // — melhor a tela dizer isso do que o operador descobrir na fila.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [t, c] = await Promise.all([
        from("clients").select("id", { count: "exact", head: true }),
        from("clients").select("id", { count: "exact", head: true }).not("phone", "is", null),
      ]);
      if (cancelled) return;
      setBase({ total: t.count ?? 0, comTelefone: c.count ?? 0 });
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="cli-root">
      <div className="cli-wrap">
        <div className="cli-top">
          <button className="cli-back" onClick={() => navigate("/sistema")}>← Voltar</button>
          <span className="cli-title">Campanhas de ligação</span>
          <span className="cli-spacer" />
          <button className="cli-btn ghost sm" onClick={() => navigate("/clientes")}>Clientes</button>
        </div>

        {base && base.comTelefone < base.total && (
          <div className="cli-card" style={{ padding: 14, marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--cli-ink)" }}>
              {base.comTelefone} de {base.total} clientes têm telefone cadastrado
            </div>
            <div style={{ fontSize: 12, color: "var(--cli-muted)", fontWeight: 600, marginTop: 4 }}>
              A fila entra na campanha pelo filtro, mas só é acionável para quem tem telefone.
              Os demais aparecem marcados como “sem telefone”.
            </div>
          </div>
        )}

        <div style={{ display: "grid", gap: 14 }}>
          <KpiPanel />
          {/* Card 15 · 5.2 — painel de renovação de procuração. Mora aqui pelo mesmo
              motivo da fila gov.br: é fila de trabalho ENTRE clientes, e o gate desta
              tela (recepção/sócio/admin) é o da RPC que gera a campanha. */}
          <PainelRenovacao />
          <FilaGovCard />
          <NovaCampanhaCard onCriada={() => setRecarregar(k => k + 1)} />
          {aberta
            ? <FilaCampanha campanha={aberta} onFechar={() => { setAberta(null); setRecarregar(k => k + 1); }} />
            : <ListaCampanhas recarregar={recarregar} onAbrir={setAberta} />}
        </div>
      </div>
    </div>
  );
}
