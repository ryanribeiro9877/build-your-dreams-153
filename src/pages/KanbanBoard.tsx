import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { HexagonLoader } from "@/components/HexagonLoader";
import { useAuth } from "@/hooks/useAuth";
import {
  useKanbanBoard, useTaskTypes, advanceUserTask, updateUserTaskStatus,
  parseChooseTaskTypeError, type KanbanCard,
} from "@/hooks/useUserTasks";
import type { OrgStage, LegalArea, TaskPriority, UserTaskStatus } from "@/types/jurisai";

// Ordem das colunas: fluxo operacional, depois faixas de apoio ao final.
const FLOW_STAGES: OrgStage[] = [
  "recepcao", "captacao_cooperativa", "atendimento", "confeccao", "revisao",
  "protocolo", "audiencia", "execucao", "execucao_sindicato", "recursos",
  "recursos_criticos", "alvara", "diligencia", "acompanhamento", "financeiro",
];
const SUPPORT_STAGES: OrgStage[] = [
  "admin_equipe", "kanban_pendencias", "gestao", "recepcao_supervisionada", "todas",
];
const ALL_STAGES: OrgStage[] = [...FLOW_STAGES, ...SUPPORT_STAGES];

const STAGE_LABELS: Record<OrgStage, string> = {
  recepcao: "Recepção", captacao_cooperativa: "Captação", atendimento: "Atendimento",
  confeccao: "Confecção", revisao: "Revisão", protocolo: "Protocolo", audiencia: "Audiência",
  execucao: "Execução", execucao_sindicato: "Execução (Sindicato)", recursos: "Recursos",
  recursos_criticos: "Recursos Críticos", alvara: "Alvará", diligencia: "Diligência",
  acompanhamento: "Acompanhamento", financeiro: "Financeiro", admin_equipe: "Admin. Equipe",
  kanban_pendencias: "Pendências", gestao: "Gestão", recepcao_supervisionada: "Recepção (Sup.)",
  todas: "Todas",
};

// Próxima fase no fluxo (espelha kanban_next_stage no backend, p/ rótulo/seleção).
const NEXT_STAGE: Partial<Record<OrgStage, OrgStage>> = {
  recepcao: "atendimento", captacao_cooperativa: "atendimento", atendimento: "confeccao",
  confeccao: "revisao", revisao: "protocolo", protocolo: "audiencia", audiencia: "execucao",
  execucao: "execucao_sindicato", execucao_sindicato: "recursos", recursos: "recursos_criticos",
  recursos_criticos: "alvara", alvara: "diligencia", diligencia: "acompanhamento",
  acompanhamento: "financeiro",
};

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  critical: "#ef4444", high: "#f59e0b", medium: "#3b82f6", low: "#6b7280",
};
const STATUS_LABELS: Record<UserTaskStatus, string> = {
  draft: "Rascunho", assigned: "Atribuída", in_progress: "Em andamento",
  awaiting_external: "Externo", awaiting_validation: "Em validação", blocked: "Bloqueada",
  completed: "Concluída", cancelled: "Cancelada",
};
const AREA_LABELS: Record<LegalArea, string> = {
  bancario: "Bancário", familia: "Família", plano_saude: "Plano de Saúde",
  consumidor: "Consumidor", civil: "Cível", previdenciario: "Previdenciário", tributario: "Tributário",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export default function KanbanBoard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { cards, loading, error, refresh } = useKanbanBoard();
  const { types } = useTaskTypes();

  const [areaFilter, setAreaFilter] = useState<string>("all");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");
  const [onlyMine, setOnlyMine] = useState(false);
  const [search, setSearch] = useState("");
  const [hideEmpty, setHideEmpty] = useState(true);
  const [advancing, setAdvancing] = useState<string | null>(null);
  // Seletor de task_type quando a próxima fase é ambígua.
  const [chooser, setChooser] = useState<{ taskId: string; stage: OrgStage } | null>(null);

  // Lista de responsáveis únicos (para o filtro por pessoa).
  const assignees = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of cards) {
      if (c.assignee_user_id) map.set(c.assignee_user_id, c.assignee_name);
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [cards]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cards.filter((c) => {
      if (areaFilter !== "all" && c.area !== areaFilter) return false;
      if (assigneeFilter !== "all" && c.assignee_user_id !== assigneeFilter) return false;
      if (onlyMine && c.assignee_user_id !== user?.id && c.assigner_user_id !== user?.id) return false;
      if (q && !c.title.toLowerCase().includes(q) && !c.task_type_label.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [cards, areaFilter, assigneeFilter, onlyMine, search, user?.id]);

  const byStage = useMemo(() => {
    const m: Record<string, KanbanCard[]> = {};
    for (const s of ALL_STAGES) m[s] = [];
    for (const c of filtered) (m[c.stage] ??= []).push(c);
    return m;
  }, [filtered]);

  const visibleStages = useMemo(
    () => ALL_STAGES.filter((s) => !hideEmpty || (byStage[s]?.length ?? 0) > 0),
    [byStage, hideEmpty],
  );

  async function doAdvance(taskId: string, nextTaskTypeId?: string | null) {
    setAdvancing(taskId);
    try {
      const res = await advanceUserTask(taskId, nextTaskTypeId);
      const where = STAGE_LABELS[res.next_stage] ?? res.next_stage;
      toast.success(
        res.awaiting_role
          ? `Avançado para ${where} — aguardando responsável.`
          : `Avançado para ${where}.`,
      );
      setChooser(null);
      refresh();
    } catch (e) {
      const stage = parseChooseTaskTypeError(e);
      if (stage) {
        // Próxima fase tem mais de um tipo: abrir seletor.
        setChooser({ taskId, stage });
      } else {
        toast.error((e as Error)?.message ?? "Falha ao avançar a tarefa.");
      }
    } finally {
      setAdvancing(null);
    }
  }

  async function quickStatus(taskId: string, status: UserTaskStatus) {
    try {
      await updateUserTaskStatus(taskId, status);
      toast.success("Status atualizado.");
      refresh();
    } catch (e) {
      toast.error((e as Error)?.message ?? "Falha ao atualizar status.");
    }
  }

  if (loading) return <HexagonLoader variant="fullscreen" label="Carregando o board" />;

  if (error) {
    const denied = /acesso restrito/i.test((error as Error)?.message ?? "");
    return (
      <div style={{ ...page, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", maxWidth: 420 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#eab308" }}>
            {denied ? "Sem acesso ao board" : "Erro ao carregar"}
          </h1>
          <p style={{ color: "#9898b0", marginTop: 8 }}>
            {denied
              ? "O board da operação é restrito a quem coordena/atribui tarefas (sócio, líder de recepção e administradores)."
              : (error as Error)?.message}
          </p>
          <button onClick={() => navigate("/sistema")} style={btnGhost}>← Voltar</button>
        </div>
      </div>
    );
  }

  const nextTypesForChooser = chooser
    ? types.filter((t) => t.stage === chooser.stage)
    : [];

  return (
    <div style={page}>
      {/* Cabeçalho + filtros */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <button className="btn-voltar" onClick={() => navigate("/sistema")} style={btnGhost}>← Voltar</button>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "#eab308", margin: 0 }}>Kanban da Operação</h1>
        <button onClick={() => navigate("/sistema/equipe/atribuir")} style={{ ...btnPrimary, marginLeft: "auto" }}>
          + Atribuir tarefa
        </button>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <input
          placeholder="Buscar por título…" value={search} onChange={(e) => setSearch(e.target.value)}
          style={{ ...input, minWidth: 200 }}
        />
        <select value={areaFilter} onChange={(e) => setAreaFilter(e.target.value)} style={input}>
          <option value="all">Todas as áreas</option>
          {(Object.keys(AREA_LABELS) as LegalArea[]).map((a) => (
            <option key={a} value={a}>{AREA_LABELS[a]}</option>
          ))}
        </select>
        <select value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)} style={input}>
          <option value="all">Todos os responsáveis</option>
          {assignees.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <label style={checkLabel}>
          <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} /> Meus cards
        </label>
        <label style={checkLabel}>
          <input type="checkbox" checked={hideEmpty} onChange={(e) => setHideEmpty(e.target.checked)} /> Ocultar colunas vazias
        </label>
        <span style={{ marginLeft: "auto", fontSize: 12, color: "#7a7a92" }}>{filtered.length} cards</span>
      </div>

      {/* Board */}
      <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 12 }}>
        {visibleStages.map((stage) => {
          const colCards = byStage[stage] ?? [];
          const isSupport = SUPPORT_STAGES.includes(stage);
          return (
            <div key={stage} style={{
              flex: "0 0 264px", background: "#11111a", border: "1px solid #25253a",
              borderRadius: 12, padding: 12, minHeight: 360, opacity: isSupport ? 0.85 : 1,
            }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 8, marginBottom: 12,
                paddingBottom: 8, borderBottom: `2px solid ${isSupport ? "#52525b" : "#eab308"}`,
              }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: isSupport ? "#9898b0" : "#facc15" }}>
                  {STAGE_LABELS[stage]}
                </span>
                <span style={{ marginLeft: "auto", fontSize: 11, color: "#7a7a92", background: "#16161f", padding: "2px 8px", borderRadius: 10 }}>
                  {colCards.length}
                </span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {colCards.length === 0 && (
                  <div style={{ padding: 16, textAlign: "center", color: "#7a7a92", fontSize: 12, fontStyle: "italic" }}>Vazia</div>
                )}
                {colCards.map((c) => {
                  const next = NEXT_STAGE[c.stage];
                  const awaiting = !!c.awaiting_role_code;
                  return (
                    <div key={c.id} style={{
                      background: "#16161f",
                      border: `1px solid ${c.is_overdue ? "rgba(239,68,68,0.4)" : "#25253a"}`,
                      borderRadius: 8, padding: 10, borderLeft: `3px solid ${PRIORITY_COLORS[c.priority]}`,
                    }}>
                      <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 3 }}>
                        <span style={{ fontSize: 10, color: "#7a7a92", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                          {c.task_type_label}
                        </span>
                        {c.area && (
                          <span style={{ marginLeft: "auto", fontSize: 9, color: "#c4c4d4", background: "#25253a", padding: "1px 6px", borderRadius: 8 }}>
                            {AREA_LABELS[c.area]}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#eeeef5", marginBottom: 6, lineHeight: 1.3 }}>
                        {c.title}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 11, color: "#c4c4d4" }}>
                        {awaiting ? (
                          <span style={{ color: "#f59e0b" }}>⏳ Aguardando responsável: {c.owner_role_label}</span>
                        ) : (
                          <span>👤 {c.assignee_name}</span>
                        )}
                        <span style={{ color: c.is_overdue ? "#ef4444" : "#7a7a92" }}>🕒 {formatDate(c.deadline_at)}</span>
                        <span style={{ fontSize: 10, color: "#7a7a92" }}>{STATUS_LABELS[c.status]}</span>
                      </div>

                      <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                        {c.status === "assigned" && (
                          <button onClick={() => quickStatus(c.id, "in_progress")} style={btnMini}>Iniciar</button>
                        )}
                        {(c.status === "assigned" || c.status === "in_progress") && (
                          <button onClick={() => quickStatus(c.id, "completed")} style={btnMini}>Concluir</button>
                        )}
                        {next && (
                          <button
                            onClick={() => doAdvance(c.id)}
                            disabled={advancing === c.id}
                            style={{ ...btnMiniGold, opacity: advancing === c.id ? 0.6 : 1 }}
                            title={`Concluir e criar a tarefa de ${STAGE_LABELS[next]}`}
                          >
                            {advancing === c.id ? "…" : `Avançar → ${STAGE_LABELS[next]}`}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Seletor de tipo de tarefa da próxima fase (quando ambíguo) */}
      {chooser && (
        <div style={overlay} onClick={() => setChooser(null)}>
          <div style={modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#eeeef5" }}>
              Escolha o tipo de tarefa em {STAGE_LABELS[chooser.stage]}
            </h3>
            <p style={{ fontSize: 12, color: "#9898b0", margin: "6px 0 12px" }}>
              Esta fase tem mais de um tipo de tarefa. Selecione para criar a sucessora.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 320, overflowY: "auto" }}>
              {nextTypesForChooser.map((t) => (
                <button key={t.id} onClick={() => doAdvance(chooser.taskId, t.id)} style={typeBtn}>
                  {t.display_name}{t.area ? ` · ${AREA_LABELS[t.area as LegalArea]}` : ""}
                </button>
              ))}
              {nextTypesForChooser.length === 0 && (
                <span style={{ fontSize: 12, color: "#7a7a92" }}>Nenhum tipo ativo nesta fase.</span>
              )}
            </div>
            <button onClick={() => setChooser(null)} style={{ ...btnGhost, marginTop: 12 }}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}

const page: React.CSSProperties = {
  minHeight: "100vh", background: "#09090f", color: "#eeeef5",
  fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", padding: 24,
};
const btnGhost: React.CSSProperties = {
  padding: "8px 16px", borderRadius: 8, border: "1px solid #25253a",
  background: "#11111a", color: "#c4c4d4", cursor: "pointer", fontSize: 13,
};
const btnPrimary: React.CSSProperties = {
  padding: "8px 14px", borderRadius: 8, border: "1px solid #eab308",
  background: "linear-gradient(145deg, #eab308 0%, #facc15 100%)",
  color: "#0a0a12", cursor: "pointer", fontSize: 13, fontWeight: 700,
};
const input: React.CSSProperties = {
  padding: "8px 12px", borderRadius: 8, border: "1px solid #25253a",
  background: "#11111a", color: "#eeeef5", fontSize: 13,
};
const checkLabel: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "#c4c4d4", cursor: "pointer",
};
const btnMini: React.CSSProperties = {
  padding: "4px 10px", borderRadius: 6, border: "1px solid #25253a",
  background: "#11111a", color: "#c4c4d4", cursor: "pointer", fontSize: 11, fontWeight: 600,
};
const btnMiniGold: React.CSSProperties = {
  padding: "4px 10px", borderRadius: 6, border: "1px solid #eab308",
  background: "rgba(234,179,8,0.12)", color: "#facc15", cursor: "pointer", fontSize: 11, fontWeight: 700,
};
const overlay: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
  display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50,
};
const modal: React.CSSProperties = {
  background: "#11111a", border: "1px solid #25253a", borderRadius: 12,
  padding: 20, width: "min(440px, 92vw)",
};
const typeBtn: React.CSSProperties = {
  textAlign: "left", padding: "10px 12px", borderRadius: 8, border: "1px solid #25253a",
  background: "#16161f", color: "#eeeef5", cursor: "pointer", fontSize: 13,
};
