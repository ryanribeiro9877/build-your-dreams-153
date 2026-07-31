import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { EmptyState, TabLoading, formatDateBR } from "@/components/clients/shared";
import { DILIGENCIA_STATUS_META, DILIGENCIA_TIPO_LABELS } from "@/lib/p2";
import CumprirDiligenciaModal from "@/components/diligencias/CumprirDiligenciaModal";
import NovaDiligenciaCard from "@/components/diligencias/NovaDiligenciaCard";
import { carregarDiligencias, varasConhecidas } from "@/components/diligencias/diligenciasApi";
import {
  DILIGENCIAS_LIMITE, FILTROS_VAZIOS, SEM_VARA, STATUS_FILTRO_OPTIONS,
  agruparPorVara, aplicarFiltros, clienteLabel, estaVencida, filtrosAtivos, fold,
  hojeISO, linhagem, prazoMeta, processoLabel, responsavelLabel,
  type DiligenciaRow, type FiltrosDiligencia,
} from "@/components/diligencias/diligenciasLogic";

/* ============================================================
   Card 11 — Diligências
   ============================================================
   Rota guardada por JuridicoRoute (sócio + adv_* + admin). A recepção fica FORA
   por decisão do escritório (item 4.4), e isso casa com a policy de SELECT da
   tabela e com o gate das três RPCs: recepção levaria 42501 de qualquer forma.

   Leitura direto de `diligencias` (+ embed de `processes`); escrita só por
   `registrar_diligencia` / `cumprir_diligencia` — as MESMAS do chat. O porquê de
   não usar `consultar_diligencias` na grade está em diligenciasLogic.ts.

   AGRUPADOR POR VARA porque é assim que o escritório trabalha hoje: a planilha
   tem uma aba por vara, e a diligência é feita “varrendo” uma vara por vez.
============================================================ */

const GRID = "1.35fr 1.1fr .8fr 1.85fr .85fr 1fr .95fr .9fr";

export default function Diligencias() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<DiligenciaRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [f, setF] = useState<FiltrosDiligencia>({ ...FILTROS_VAZIOS });
  const [recolhidos, setRecolhidos] = useState<Set<string>>(new Set());
  const [cumprindo, setCumprindo] = useState<DiligenciaRow | null>(null);
  const [formAberto, setFormAberto] = useState(false);
  const [retorno, setRetorno] = useState<{ titulo: string; avisos: string[] } | null>(null);
  const [destaque, setDestaque] = useState<string | null>(null);

  // “Hoje” é fixado na montagem: se recalculasse a cada render, uma lista aberta
  // na virada do dia mudaria de cor no meio de um clique.
  const hoje = useMemo(() => hojeISO(), []);

  const load = useCallback(async () => {
    setRows(null); setErro(null);
    const { rows: r, total: t, error } = await carregarDiligencias();
    if (error) {
      // 42501 nunca vira lista vazia: lista vazia mentiria dizendo “não há nada”.
      setErro(error.code === "42501"
        ? "Você não tem acesso às diligências — esta tela é de advogado/sócio (e admin)."
        : `Não foi possível carregar as diligências: ${error.message ?? "erro"}`);
      setRows([]);
      return;
    }
    setRows(r); setTotal(t);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const porId = useMemo(() => new Map((rows ?? []).map(d => [d.id, d])), [rows]);
  const filtradas = useMemo(() => aplicarFiltros(rows ?? [], f), [rows, f]);
  const grupos = useMemo(() => agruparPorVara(filtradas, hoje), [filtradas, hoje]);
  const varas = useMemo(() => varasConhecidas(rows ?? []), [rows]);

  const vencidas = filtradas.filter(d => estaVencida(d, hoje)).length;
  const pendentes = filtradas.filter(d => d.status === "pendente").length;
  const truncado = total > (rows?.length ?? 0);
  const ativos = filtrosAtivos(f);

  /** Pula para a diligência ORIGINAL de uma rediligência. Se ela não passa no
   *  filtro corrente, o filtro é limpo — em vez de rolar para um lugar vazio. */
  function irParaOriginal(id: string) {
    const alvo = porId.get(id);
    if (!alvo) return;
    if (!filtradas.some(d => d.id === id)) {
      setF({ ...FILTROS_VAZIOS, status: "todas" });
      toast.info("Filtros limpos: a diligência original não aparecia no recorte atual.");
    }
    const chave = alvo.vara?.trim() ? fold(alvo.vara.trim()) : SEM_VARA;
    setRecolhidos(prev => { const n = new Set(prev); n.delete(chave); return n; });
    setDestaque(id);
  }

  useEffect(() => {
    if (!destaque) return;
    const el = document.getElementById(`dil-${destaque}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    const h = setTimeout(() => setDestaque(null), 4000);
    return () => clearTimeout(h);
  }, [destaque, grupos]);

  function aposEscrita(titulo: string, avisos: string[]) {
    setRetorno({ titulo, avisos });
    setCumprindo(null);
    void load();
  }

  const setFiltro = (k: keyof FiltrosDiligencia) => (e: { target: { value: string } }) =>
    setF(prev => ({ ...prev, [k]: e.target.value }));

  return (
    <div className="cli-root">
      <div className="cli-wrap">
        <div className="cli-top">
          <button className="cli-back" onClick={() => navigate("/sistema")}>← Voltar</button>
          <span className="cli-title">Diligências</span>
          <span className="cli-spacer" />
          <button className="cli-btn ghost sm" onClick={() => void load()}>Recarregar</button>
        </div>

        <div style={{ display: "grid", gap: 14 }}>
          {/* Retorno da última escrita: todo aviso que a RPC devolveu fica FIXO na
              tela (toast desaparece; aviso de comprovação não pode desaparecer). */}
          {retorno && (
            <div className="cli-card" style={{ borderLeft: "10px solid var(--cli-amber)" }}>
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800, fontSize: 14 }}>{retorno.titulo}</div>
                  {retorno.avisos.length > 0 ? (
                    <ul style={{ margin: "8px 0 0 18px", fontSize: 13, fontWeight: 600, display: "grid", gap: 4 }}>
                      {retorno.avisos.map((a, i) => <li key={i}>{a}</li>)}
                    </ul>
                  ) : (
                    <div style={{ fontSize: 12.5, color: "var(--cli-muted)", fontWeight: 600, marginTop: 4 }}>
                      O banco não devolveu nenhum aviso.
                    </div>
                  )}
                </div>
                <button className="cli-btn sm ghost" onClick={() => setRetorno(null)}>Dispensar</button>
              </div>
            </div>
          )}

          <NovaDiligenciaCard varas={varas} aberto={formAberto}
            onToggle={() => setFormAberto(a => !a)} onCriada={aposEscrita} />

          {/* Filtros */}
          <div className="cli-card">
            <div className="cli-sec-title" style={{ margin: "0 0 12px" }}>Filtros</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
              <div style={{ flex: "0 1 160px" }}>
                <label className="cli-label" htmlFor="fd-status">Status</label>
                <select id="fd-status" className="cli-select" value={f.status} onChange={setFiltro("status")}>
                  {STATUS_FILTRO_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div style={{ flex: "1 1 190px" }}>
                <label className="cli-label" htmlFor="fd-vara">Vara</label>
                <input id="fd-vara" className="cli-input" list="fd-varas" value={f.vara}
                  onChange={setFiltro("vara")} placeholder="parte do nome" />
                <datalist id="fd-varas">{varas.map(v => <option key={v} value={v} />)}</datalist>
              </div>
              <div style={{ flex: "1 1 190px" }}>
                <label className="cli-label" htmlFor="fd-proc">Processo</label>
                <input id="fd-proc" className="cli-input" value={f.processo}
                  onChange={setFiltro("processo")} placeholder="parte do número" />
              </div>
              <div style={{ flex: "0 1 180px" }}>
                <label className="cli-label" htmlFor="fd-venc">Vencendo até</label>
                <input id="fd-venc" className="cli-input" type="date" value={f.vencendoAte}
                  onChange={setFiltro("vencendoAte")} />
              </div>
              <button className="cli-btn sm ghost" onClick={() => setF({ ...FILTROS_VAZIOS })}>Limpar</button>
            </div>
            {f.vencendoAte && (
              <div style={{ fontSize: 12, color: "var(--cli-muted)", fontWeight: 700, marginTop: 8 }}>
                Com “vencendo até” preenchido, diligência SEM prazo sai da lista (é a mesma regra do banco).
              </div>
            )}
          </div>

          {/* Resumo do recorte */}
          {rows !== null && !erro && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <span className="cli-chip n">{filtradas.length} no recorte</span>
              {pendentes > 0 && <span className="cli-chip p">{pendentes} pendente(s)</span>}
              {vencidas > 0 && <span className="cli-chip d">{vencidas} vencida(s)</span>}
              {ativos.length > 0 && (
                <span style={{ fontSize: 12, color: "var(--cli-muted-light)", fontWeight: 600 }}>
                  de {rows.length} carregada(s) · filtro: {ativos.join(" · ")}
                </span>
              )}
              {truncado && (
                <span style={{ fontSize: 12, color: "var(--cli-red)", fontWeight: 700 }}>
                  mostrando as {DILIGENCIAS_LIMITE} primeiras de {total} — filtros e agrupamento valem só para essas
                </span>
              )}
            </div>
          )}

          {/* Grade agrupada por vara */}
          {erro ? (
            <EmptyState icon="⚠" title="Lista indisponível" hint={erro} />
          ) : rows === null ? (
            <TabLoading />
          ) : rows.length === 0 ? (
            <EmptyState icon="✎" title="Nenhuma diligência registrada"
              hint="A base está vazia — nada foi importado da planilha ainda. Clique em “Nova diligência”, informe o número do processo e o que precisa ser feito; ou peça pelo chat: “registrar diligência de balcão virtual no processo … com prazo …”. Com prazo, nasce também a pendência no Kanban." />
          ) : filtradas.length === 0 ? (
            <EmptyState icon="∅" title="Nenhuma diligência com estes filtros"
              hint={`${rows.length} carregada(s), nenhuma passa em: ${ativos.join(" · ")}. Use “Limpar” para ver todas.`} />
          ) : (
            grupos.map(g => {
              const recolhido = recolhidos.has(g.chave);
              return (
                <div key={g.chave}>
                  <button type="button" className="cli-btn ghost" aria-expanded={!recolhido}
                    onClick={() => setRecolhidos(prev => {
                      const n = new Set(prev);
                      if (n.has(g.chave)) n.delete(g.chave); else n.add(g.chave);
                      return n;
                    })}
                    style={{ width: "100%", justifyContent: "flex-start", textAlign: "left", flexWrap: "wrap" }}>
                    <span style={{ fontSize: 15, width: 14 }}>{recolhido ? "▸" : "▾"}</span>
                    <span style={{ flex: 1, minWidth: 120, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {g.vara ?? "Sem vara informada"}
                    </span>
                    <span className="cli-chip n">{g.rows.length}</span>
                    {g.pendentes > 0 && <span className="cli-chip p">{g.pendentes} pendente(s)</span>}
                    {g.vencidas > 0 && <span className="cli-chip d">{g.vencidas} vencida(s)</span>}
                    {g.grafias.length > 1 && (
                      <span className="cli-chip n" title={g.grafias.join(" · ")}>
                        {g.grafias.length} grafias
                      </span>
                    )}
                  </button>

                  {!recolhido && (
                    <div className="cli-table" style={{ marginTop: 8 }}>
                      <div className="cli-thead" style={{ gridTemplateColumns: GRID }}>
                        <div>Processo</div><div>Cliente</div><div>Tipo</div><div>Descrição</div>
                        <div>Prazo</div><div>Situação</div><div>Protocolo</div><div>Responsável</div>
                      </div>
                      {g.rows.map(d => {
                        const proc = processoLabel(d);
                        const cliente = clienteLabel(d);
                        const resp = responsavelLabel(d);
                        const pm = prazoMeta(d, hoje);
                        const st = DILIGENCIA_STATUS_META[d.status] ?? { label: d.status, cls: "n" };
                        const lin = linhagem(d, porId);
                        const marcado = destaque === d.id;
                        return (
                          <div key={d.id} id={`dil-${d.id}`} className="cli-trow"
                            style={{
                              gridTemplateColumns: GRID, cursor: "default", alignItems: "start",
                              // VERMELHO = vencida (pendente com prazo passado).
                              background: pm.vencida ? "#F58B7B1F" : undefined,
                              boxShadow: pm.vencida ? "inset 5px 0 0 var(--cli-red)" : undefined,
                              outline: marcado ? "3px solid var(--cli-amber)" : undefined,
                            }}>
                            <div className="name" style={{ fontSize: 13.5, whiteSpace: "normal" }}
                              title={proc.texto}>
                              {proc.texto}
                              {!proc.vinculado && (
                                <span className="cli-chip p" style={{ marginLeft: 6, fontSize: 9.5 }}
                                  title="A diligência foi guardada só pelo número: nenhum processo cadastrado casou com ele (ou casou mais de um).">
                                  não vinculado
                                </span>
                              )}
                            </div>
                            <div className="muted" title={cliente ?? ""}
                              style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                              {cliente ?? "—"}
                            </div>
                            <div>
                              <span className="cli-chip n" style={{ fontSize: 10 }}>
                                {DILIGENCIA_TIPO_LABELS[d.tipo] ?? d.tipo}
                              </span>
                            </div>
                            <div className="muted" title={d.descricao}>{d.descricao}</div>
                            <div className="muted" style={{ color: pm.vencida ? "var(--cli-red)" : undefined }}>
                              {pm.texto}
                              {pm.detalhe && (
                                <div style={{ fontSize: 11, fontWeight: 700 }}>{pm.detalhe}</div>
                              )}
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
                              <span className={`cli-chip ${st.cls}`}>{st.label}</span>
                              {pm.vencida && <span className="cli-chip d">VENCIDA</span>}
                              {d.cumprida_em && (
                                <span style={{ fontSize: 11, color: "var(--cli-muted-light)", fontWeight: 600 }}>
                                  em {formatDateBR(d.cumprida_em)}
                                </span>
                              )}
                            </div>
                            <div className="muted" title={d.protocolo ?? ""}
                              style={{ fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis" }}>
                              {d.protocolo?.trim() || "—"}
                            </div>
                            <div className="muted" title={resp ?? ""}
                              style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                              {resp ?? "—"}
                            </div>

                            {/* Linha de apoio: linhagem, resultado, observações e a ação. */}
                            <div style={{
                              gridColumn: "1 / -1", display: "flex", gap: 10, flexWrap: "wrap",
                              alignItems: "center", marginTop: 6,
                            }}>
                              {lin && (lin.alvoId
                                ? (
                                  <button type="button" className="cli-chip n" title={lin.titulo}
                                    onClick={() => irParaOriginal(lin.alvoId as string)}
                                    style={{ cursor: "pointer", fontFamily: "inherit" }}>
                                    ↩ {lin.texto}
                                  </button>
                                )
                                : <span className="cli-chip n" title={lin.titulo}>↩ {lin.texto}</span>
                              )}
                              {d.is_test && <span className="cli-chip d" title="Registro de teste">teste</span>}
                              {d.resultado?.trim() && (
                                <span style={{ fontSize: 12, color: "var(--cli-muted-light)", fontWeight: 600 }}>
                                  Resultado: {d.resultado}
                                </span>
                              )}
                              {d.notes?.trim() && (
                                <span style={{ fontSize: 12, color: "var(--cli-muted-light)", fontWeight: 600 }}>
                                  Obs.: {d.notes}
                                </span>
                              )}
                              <span style={{ flex: 1 }} />
                              {d.status === "pendente" && (
                                <button className="cli-btn sm" onClick={() => setCumprindo(d)}>Cumprir</button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}

          {rows !== null && rows.length > 0 && (
            <div style={{ fontSize: 12, color: "var(--cli-muted)", fontWeight: 600 }}>
              Vencida = pendente com prazo anterior a hoje ({formatDateBR(hoje)}), a mesma conta que o
              banco faz. Diligência cumprida ou prejudicada não conta como vencida.
            </div>
          )}
        </div>
      </div>

      {cumprindo && (
        <CumprirDiligenciaModal d={cumprindo} onFechar={() => setCumprindo(null)} onCumprida={aposEscrita} />
      )}
    </div>
  );
}
