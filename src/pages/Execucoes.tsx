import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { EmptyState, formatDateBR } from "@/components/clients/shared";
import {
  EXECUCAO_FASES, EXECUCAO_FASE_LABELS, EXECUCAO_FASE_CLS, EXECUCAO_FASE_OPTIONS,
  REU_TIPO_LABELS, REU_TIPO_OPTIONS,
} from "@/lib/motores23";

/* ============================================================
   Card 8 — Execuções (pipeline)
   ============================================================
   Leitura direto de `execucoes` + `processes` (a RLS resolve: advogado + sócio +
   admin; a recepção leva 42501 e por isso a rota é guardada e o link escondido).
   ESCRITA só por RPC — as mesmas do chat: iniciar_execucao,
   atualizar_fase_execucao, remarcar_revisao_execucao.

   `responsavel_nome` é TEXTO LIVRE de propósito: Daiane e Robson ainda não têm
   usuário no sistema (Card 2). O filtro por responsável — requisito do card, para
   separar sindicatos/Daiane de outros/Rodrigo — é feito sobre esse texto.
============================================================ */

interface ExecucaoRow {
  id: string;
  process_id: string;
  fase: string;
  reu_nome: string | null;
  reu_tipo: string | null;
  responsavel_nome: string | null;
  valor_execucao: number | null;
  proxima_revisao: string | null;
  notes: string | null;
  updated_at: string;
  processes: { process_number: string | null; client_name: string | null } | null;
}

interface EventoRow {
  id: string;
  fase_de: string | null;
  fase_para: string;
  observacao: string | null;
  created_at: string;
}

type RpcRes = { ok?: boolean; motivo?: string; mensagem?: string; pendencia_alvara_criada?: boolean; proxima_revisao?: string };

function rpc(fn: string, args: Record<string, unknown>) {
  // Cast: RPCs dos Motores 2/3 fora dos tipos gerados. Chamada ACOPLADA.
  return (supabase as unknown as {
    rpc: (f: string, a: Record<string, unknown>) => Promise<{ data: RpcRes | null; error: { code?: string; message?: string } | null }>;
  }).rpc(fn, args);
}

/** Traduz a falha sempre dizendo o que NÃO foi feito. */
function falha(data: RpcRes | null, error: { code?: string; message?: string } | null, oQue: string): string | null {
  if (error) {
    if (error.code === "42501") return `${oQue}: acompanhamento de execução é restrito a advogado/sócio.`;
    return `${oQue}: ${error.message ?? "erro na chamada"}`;
  }
  if (!data) return `${oQue}: a chamada não retornou resultado.`;
  if (data.ok) return null;
  const motivos: Record<string, string> = {
    processo_nao_encontrado_ou_ambiguo: "não localizei um único processo com esse número",
    execucao_ja_existe: "esse processo já tem execução em acompanhamento",
    sem_execucao: "esse processo não tem execução em acompanhamento",
    execucao_nao_encontrada: "execução não encontrada",
    fase_invalida: data.mensagem ?? "fase inválida",
    dias_invalido: data.mensagem ?? "informe de 1 a 90 dias",
  };
  return `${oQue}: ${motivos[data.motivo ?? ""] ?? data.mensagem ?? data.motivo ?? "erro"}`;
}

const brl = (v: number | null) =>
  v === null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/* ---------- Trilha de fases ---------- */

function Pipeline({ fase }: { fase: string }) {
  const idx = EXECUCAO_FASES.indexOf(fase as typeof EXECUCAO_FASES[number]);
  return (
    <div style={{ display: "flex", gap: 3, alignItems: "center", flexWrap: "wrap" }}>
      {EXECUCAO_FASES.map((f, i) => {
        const passou = idx >= 0 && i <= idx;
        const atual = i === idx;
        return (
          <span key={f} title={EXECUCAO_FASE_LABELS[f]}
            style={{
              width: atual ? 22 : 12, height: 6, borderRadius: 3,
              background: atual ? "var(--cli-ink)" : passou ? "var(--cli-muted)" : "var(--cli-line, rgba(0,0,0,.12))",
              flexShrink: 0,
            }} />
        );
      })}
      <span className={`cli-chip ${EXECUCAO_FASE_CLS[fase] ?? "n"}`} style={{ marginLeft: 6 }}>
        {EXECUCAO_FASE_LABELS[fase] ?? fase}
      </span>
    </div>
  );
}

/* ---------- Nova execução ---------- */

const NOVA_VAZIA = {
  processo_numero: "", reu_nome: "", reu_tipo: "", responsavel_nome: "",
  valor: "", fase: "ajuizada", observacao: "",
};

function NovaExecucaoCard({ onCriada }: { onCriada: () => void }) {
  const [aberto, setAberto] = useState(false);
  const [f, setF] = useState({ ...NOVA_VAZIA });
  const [salvando, setSalvando] = useState(false);
  const set = (k: keyof typeof NOVA_VAZIA) => (e: { target: { value: string } }) =>
    setF(prev => ({ ...prev, [k]: e.target.value }));

  async function salvar() {
    if (!f.processo_numero.trim()) { toast.error("Informe o número do processo."); return; }
    setSalvando(true);
    const { data, error } = await rpc("iniciar_execucao", {
      p_process_id: null,
      p_processo_numero: f.processo_numero.trim(),
      p_reu_nome: f.reu_nome.trim() || null,
      p_reu_tipo: f.reu_tipo || null,
      p_responsavel_nome: f.responsavel_nome.trim() || null,
      p_valor: f.valor.trim() ? Number(f.valor.replace(/\./g, "").replace(",", ".")) : null,
      p_fase: f.fase || null,
      p_observacao: f.observacao.trim() || null,
    });
    const err = falha(data, error, "Execução NÃO iniciada");
    setSalvando(false);
    if (err) { toast.error(err); return; }
    toast.success("Execução em acompanhamento.");
    setF({ ...NOVA_VAZIA });
    setAberto(false);
    onCriada();
  }

  if (!aberto) {
    return (
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button className="cli-btn sm" onClick={() => setAberto(true)}>+ Nova execução</button>
      </div>
    );
  }
  return (
    <div className="cli-card lift" style={{ padding: 18 }}>
      <div className="cli-sec-title" style={{ padding: "2px 4px 10px" }}>Nova execução</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
        <div style={{ flex: "1 1 230px" }}>
          <label className="cli-label">Número do processo</label>
          <input className="cli-input" value={f.processo_numero} onChange={set("processo_numero")}
            placeholder="0801234-56.2025.8.05.0001" />
        </div>
        <div style={{ flex: "1 1 190px" }}>
          <label className="cli-label">Réu / parte contrária</label>
          <input className="cli-input" value={f.reu_nome} onChange={set("reu_nome")} />
        </div>
        <div style={{ flex: "0 1 160px" }}>
          <label className="cli-label">Tipo do réu</label>
          <select className="cli-select" value={f.reu_tipo} onChange={set("reu_tipo")}>
            <option value="">—</option>
            {REU_TIPO_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div style={{ flex: "0 1 160px" }}>
          <label className="cli-label">Responsável</label>
          <input className="cli-input" value={f.responsavel_nome} onChange={set("responsavel_nome")}
            placeholder="Ex.: Daiane" />
        </div>
        <div style={{ flex: "0 1 140px" }}>
          <label className="cli-label">Valor (R$)</label>
          <input className="cli-input" inputMode="decimal" value={f.valor} onChange={set("valor")} placeholder="12000" />
        </div>
        <div style={{ flex: "0 1 180px" }}>
          <label className="cli-label">Fase inicial</label>
          <select className="cli-select" value={f.fase} onChange={set("fase")}>
            {EXECUCAO_FASE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div style={{ flex: "1 1 200px" }}>
          <label className="cli-label">Observação</label>
          <input className="cli-input" value={f.observacao} onChange={set("observacao")} placeholder="opcional" />
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center" }}>
        <div style={{ fontSize: 12, color: "var(--cli-muted)", fontWeight: 500, flex: 1 }}>
          Um processo tem no máximo uma execução. O responsável é texto livre.
        </div>
        <button className="cli-btn sm" disabled={salvando} onClick={() => void salvar()}>
          {salvando ? "Iniciando…" : "Iniciar"}
        </button>
        <button className="cli-btn sm ghost" disabled={salvando}
          onClick={() => { setF({ ...NOVA_VAZIA }); setAberto(false); }}>Cancelar</button>
      </div>
    </div>
  );
}

/* ---------- Drawer: linha do tempo + ações ---------- */

function ExecucaoDrawer({ exec, onFechar, onMudou }: {
  exec: ExecucaoRow; onFechar: () => void; onMudou: () => void;
}) {
  const [eventos, setEventos] = useState<EventoRow[] | null>(null);
  const [novaFase, setNovaFase] = useState(exec.fase);
  const [obsFase, setObsFase] = useState("");
  const [dias, setDias] = useState("");
  const [recorrente, setRecorrente] = useState("");
  const [busy, setBusy] = useState(false);

  const numero = exec.processes?.process_number ?? "";

  const loadEventos = useCallback(async () => {
    const sb = supabase as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (k: string, v: string) => {
            order: (c: string, o: { ascending: boolean }) => Promise<{ data: EventoRow[] | null; error: { message?: string } | null }>;
          };
        };
      };
    };
    const { data, error } = await sb.from("execucao_eventos")
      .select("id, fase_de, fase_para, observacao, created_at")
      .eq("execucao_id", exec.id)
      .order("created_at", { ascending: false });
    setEventos(error ? [] : (data ?? []));
  }, [exec.id]);

  useEffect(() => { void loadEventos(); }, [loadEventos]);
  useEffect(() => { setNovaFase(exec.fase); }, [exec.fase]);

  async function mudarFase() {
    if (novaFase === exec.fase) { toast.error("Escolha uma fase diferente da atual."); return; }
    setBusy(true);
    const { data, error } = await rpc("atualizar_fase_execucao", {
      p_fase: novaFase,
      p_process_id: exec.process_id,
      p_processo_numero: null,
      p_observacao: obsFase.trim() || null,
    });
    const err = falha(data, error, "Fase NÃO alterada");
    setBusy(false);
    if (err) { toast.error(err); return; }
    toast.success(data?.pendencia_alvara_criada
      ? "Fase atualizada — pendência do alvará criada."
      : "Fase atualizada.");
    setObsFase("");
    await loadEventos();
    onMudou();
  }

  async function remarcar() {
    const n = Number(dias);
    if (!Number.isFinite(n) || n < 1 || n > 90) { toast.error("Informe de 1 a 90 dias."); return; }
    const rec = recorrente.trim() ? Number(recorrente) : null;
    if (rec !== null && (!Number.isFinite(rec) || rec < 1 || rec > 90)) {
      toast.error("A recorrência também precisa ficar entre 1 e 90 dias."); return;
    }
    setBusy(true);
    const { data, error } = await rpc("remarcar_revisao_execucao", {
      p_dias: Math.trunc(n),
      p_process_id: exec.process_id,
      p_processo_numero: null,
      p_intervalo_recorrente: rec !== null ? Math.trunc(rec) : null,
    });
    const err = falha(data, error, "Revisão NÃO remarcada");
    setBusy(false);
    if (err) { toast.error(err); return; }
    toast.success(`Próxima revisão em ${formatDateBR(data?.proxima_revisao ?? null)}.`);
    setDias(""); setRecorrente("");
    onMudou();
  }

  return (
    <div className="cli-card lift" style={{ padding: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <div className="cli-sec-title" style={{ padding: 0 }}>
          {numero || "(processo sem número)"}
        </div>
        <span style={{ fontSize: 13, color: "var(--cli-muted)", fontWeight: 600 }}>
          {exec.processes?.client_name ?? "—"}
        </span>
        <span style={{ flex: 1 }} />
        <button className="cli-btn sm ghost" onClick={onFechar}>Fechar</button>
      </div>

      <div style={{ marginBottom: 14 }}><Pipeline fase={exec.fase} /></div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 18, marginBottom: 14, fontSize: 13 }}>
        <div><span className="cli-label">Réu</span><div style={{ fontWeight: 700 }}>
          {exec.reu_nome ?? "—"}{exec.reu_tipo ? ` (${REU_TIPO_LABELS[exec.reu_tipo] ?? exec.reu_tipo})` : ""}
        </div></div>
        <div><span className="cli-label">Responsável</span><div style={{ fontWeight: 700 }}>{exec.responsavel_nome ?? "—"}</div></div>
        <div><span className="cli-label">Valor</span><div style={{ fontWeight: 700 }}>{brl(exec.valor_execucao)}</div></div>
        <div><span className="cli-label">Próxima revisão</span><div style={{ fontWeight: 700 }}>{formatDateBR(exec.proxima_revisao)}</div></div>
      </div>

      {/* Ações */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end", paddingTop: 12, borderTop: "1px solid var(--cli-line, rgba(0,0,0,.06))" }}>
        <div style={{ flex: "0 1 200px" }}>
          <label className="cli-label">Mover para a fase</label>
          <select className="cli-select" value={novaFase} onChange={e => setNovaFase(e.target.value)}>
            {EXECUCAO_FASE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div style={{ flex: "1 1 200px" }}>
          <label className="cli-label">O que aconteceu</label>
          <input className="cli-input" value={obsFase} onChange={e => setObsFase(e.target.value)}
            placeholder="vai para a linha do tempo" />
        </div>
        <button className="cli-btn sm" disabled={busy} onClick={() => void mudarFase()}>Mudar fase</button>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end", marginTop: 10 }}>
        <div style={{ flex: "0 1 140px" }}>
          <label className="cli-label">Revisar em (dias)</label>
          <input className="cli-input" inputMode="numeric" value={dias}
            onChange={e => setDias(e.target.value.replace(/\D/g, "").slice(0, 2))} placeholder="10" />
        </div>
        <div style={{ flex: "0 1 170px" }}>
          <label className="cli-label">Repetir a cada (dias)</label>
          <input className="cli-input" inputMode="numeric" value={recorrente}
            onChange={e => setRecorrente(e.target.value.replace(/\D/g, "").slice(0, 2))} placeholder="opcional" />
        </div>
        <button className="cli-btn sm" disabled={busy} onClick={() => void remarcar()}>Remarcar revisão</button>
        <div style={{ flexBasis: "100%", fontSize: 12, color: "var(--cli-muted)", fontWeight: 500 }}>
          Remarcar FECHA a pendência de revisão aberta e agenda a próxima. De 1 a 90 dias.
        </div>
      </div>

      {/* Linha do tempo */}
      <div style={{ marginTop: 16 }}>
        <div className="cli-sec-title" style={{ padding: "2px 4px 8px" }}>Linha do tempo</div>
        {eventos === null ? <div className="cli-loading">Carregando…</div>
          : eventos.length === 0 ? (
            <EmptyState icon="⋯" title="Nenhum evento registrado"
              hint="Cada mudança de fase — pela tela ou pelo chat — entra aqui." />
          ) : eventos.map(ev => (
            <div key={ev.id} className="cli-row">
              <div className="dot">▸</div>
              <div className="body">
                <div className="t">
                  {ev.fase_de
                    ? `${EXECUCAO_FASE_LABELS[ev.fase_de] ?? ev.fase_de} → ${EXECUCAO_FASE_LABELS[ev.fase_para] ?? ev.fase_para}`
                    : `Início: ${EXECUCAO_FASE_LABELS[ev.fase_para] ?? ev.fase_para}`}
                </div>
                <div className="s">
                  {formatDateBR(ev.created_at)}
                  {ev.observacao ? ` · ${ev.observacao}` : ""}
                </div>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

/* ---------- Página ---------- */

export default function Execucoes() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<ExecucaoRow[] | null>(null);
  const [negado, setNegado] = useState(false);
  const [fFase, setFFase] = useState("");
  const [fResp, setFResp] = useState("");
  const [aberta, setAberta] = useState<string | null>(null);

  const load = useCallback(async () => {
    const sb = supabase as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          order: (c: string, o: { ascending: boolean }) => Promise<{ data: ExecucaoRow[] | null; error: { code?: string; message?: string } | null }>;
        };
      };
    };
    const { data, error } = await sb.from("execucoes")
      .select("id, process_id, fase, reu_nome, reu_tipo, responsavel_nome, valor_execucao, proxima_revisao, notes, updated_at, processes(process_number, client_name)")
      .order("updated_at", { ascending: false });
    if (error) {
      // 42501 aqui significa papel sem acesso; a rota já barra, mas se alguém
      // chegar por URL o texto tem de ser honesto (não "nenhuma execução").
      if (error.code === "42501") { setNegado(true); setRows([]); return; }
      toast.error(`Erro ao carregar execuções: ${error.message ?? ""}`);
      setRows([]); return;
    }
    setNegado(false);
    setRows(data ?? []);
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Responsáveis existentes, para o filtro virar dropdown em vez de digitação
  // (separar sindicatos/Daiane de outros/Rodrigo é o uso pedido no card).
  const responsaveis = useMemo(() => {
    const set = new Set<string>();
    for (const r of (rows ?? [])) {
      const v = (r.responsavel_nome ?? "").trim();
      if (v) set.add(v);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [rows]);

  const filtradas = useMemo(() => (rows ?? []).filter(r =>
    (!fFase || r.fase === fFase)
    && (!fResp || (r.responsavel_nome ?? "").trim() === fResp)
  ), [rows, fFase, fResp]);

  const execAberta = (rows ?? []).find(r => r.id === aberta) ?? null;
  const semResponsavel = (rows ?? []).filter(r => !(r.responsavel_nome ?? "").trim()).length;

  return (
    <div className="cli-root">
      <div className="cli-wrap">
        <div className="cli-top">
          <button className="cli-back" onClick={() => navigate("/sistema")}>← Voltar</button>
          <span className="cli-title">Execuções</span>
          {rows !== null && <span className="cli-count">{filtradas.length} de {rows.length}</span>}
          <span className="cli-spacer" />
        </div>

        {negado ? (
          <EmptyState icon="🔒" title="Acesso restrito"
            hint="O acompanhamento de execuções é do jurídico (advogado ou sócio)." />
        ) : rows === null ? (
          <div className="cli-card lift" style={{ padding: 18 }}><div className="cli-loading">Carregando…</div></div>
        ) : (
          <div style={{ display: "grid", gap: 14 }}>
            <NovaExecucaoCard onCriada={() => void load()} />

            {/* Filtros */}
            <div className="cli-card lift" style={{ padding: 14, display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
              <div style={{ flex: "0 1 200px" }}>
                <label className="cli-label">Fase</label>
                <select className="cli-select" value={fFase} onChange={e => setFFase(e.target.value)}>
                  <option value="">Todas</option>
                  {EXECUCAO_FASE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div style={{ flex: "0 1 200px" }}>
                <label className="cli-label">Responsável</label>
                <select className="cli-select" value={fResp} onChange={e => setFResp(e.target.value)}>
                  <option value="">Todos</option>
                  {responsaveis.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              {(fFase || fResp) && (
                <button className="cli-btn ghost sm" onClick={() => { setFFase(""); setFResp(""); }}>Limpar</button>
              )}
              {semResponsavel > 0 && (
                <div style={{ fontSize: 12, color: "var(--cli-muted)", fontWeight: 600, marginLeft: "auto" }}>
                  {semResponsavel} execução(ões) sem responsável definido
                </div>
              )}
            </div>

            {execAberta && (
              <ExecucaoDrawer exec={execAberta} onFechar={() => setAberta(null)} onMudou={() => void load()} />
            )}

            <div className="cli-card lift" style={{ padding: 18 }}>
              <div className="cli-sec-title" style={{ padding: "2px 4px 10px" }}>
                Em acompanhamento{rows.length > 0 ? ` · ${rows.length}` : ""}
              </div>
              {filtradas.length === 0 ? (
                <EmptyState icon="⚙" title={rows.length === 0 ? "Nenhuma execução em acompanhamento" : "Nada com esses filtros"}
                  hint={rows.length === 0
                    ? "Inicie pelo botão acima, ou pelo chat: “execução ajuizada no processo X”."
                    : "Ajuste a fase ou o responsável."} />
              ) : filtradas.map(r => (
                <div key={r.id} className="cli-row" style={{ cursor: "pointer" }}
                  onClick={() => setAberta(r.id === aberta ? null : r.id)}>
                  <div className="dot">⚙</div>
                  <div className="body">
                    <div className="t">
                      {r.processes?.process_number ?? "(sem número)"}
                      <span style={{ color: "var(--cli-muted)", fontWeight: 600 }}>
                        {r.processes?.client_name ? ` — ${r.processes.client_name}` : ""}
                      </span>
                    </div>
                    <div className="s">
                      {r.reu_nome ? `réu ${r.reu_nome}` : "réu não informado"}
                      {r.reu_tipo ? ` (${REU_TIPO_LABELS[r.reu_tipo] ?? r.reu_tipo})` : ""}
                      {` · ${r.responsavel_nome?.trim() || "sem responsável"}`}
                      {r.valor_execucao !== null ? ` · ${brl(r.valor_execucao)}` : ""}
                      {r.proxima_revisao ? ` · revisar ${formatDateBR(r.proxima_revisao)}` : ""}
                      {` · movida ${formatDateBR(r.updated_at)}`}
                    </div>
                    <div style={{ marginTop: 6 }}><Pipeline fase={r.fase} /></div>
                  </div>
                  <span style={{ marginLeft: "auto", flexShrink: 0 }}>
                    <button className="go" title="Abrir linha do tempo">{r.id === aberta ? "▾" : "›"}</button>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
