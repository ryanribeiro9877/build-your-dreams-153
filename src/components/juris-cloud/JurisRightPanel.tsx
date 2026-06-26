import React from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle, AlertCircle, CheckCircle, Info,
  Zap, BarChart3, Circle, ListTodo, FileText,
} from "lucide-react";
import { HexagonLoader } from "@/components/HexagonLoader";
import { useMyInbox, type InboxTask } from "@/hooks/useUserTasks";
import { useMyProcesses } from "@/hooks/useMyProcesses";
import { USER_TASK_STATUS_LABELS, OPEN_QUEUE_STATUSES } from "@/lib/userTaskLabels";
import type { TaskPriority } from "@/types/jurisai";
import type { Agent } from "./types";
import {
  ROLE_ICONS,
  getAgentLoad, getTotalCapacity, getInitials, roleLabelsMap,
} from "./constants";

/* ── Alert Icon helper ── */
function AlertIcon({ type }: { type: string }) {
  const size = 14;
  if (type === "fatal") return <AlertTriangle size={size} style={{ color: "#FACC15" }} />;
  if (type === "warning") return <AlertCircle size={size} style={{ color: "#EAB308" }} />;
  if (type === "success") return <CheckCircle size={size} style={{ color: "#FEF9C3" }} />;
  return <Info size={size} style={{ color: "#FDE047" }} />;
}

/* ── Cores/labels de prioridade ── */
const PRIO_COLORS: Record<TaskPriority, string> = {
  critical: "#ef4444", high: "#f59e0b", medium: "#3b82f6", low: "#6b7280",
};
const PRIO_LABELS: Record<TaskPriority, string> = {
  critical: "CRÍTICO", high: "ALTA", medium: "MÉDIA", low: "BAIXA",
};

function formatDeadline(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

/* ── Card de tarefa (usado em Filas e Alertas) ── */
function TaskCard({ task, onOpen }: { task: InboxTask; onOpen: () => void }) {
  return (
    <div
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter") onOpen(); }}
      style={{
        background: "var(--bg3)",
        border: "1px solid var(--border)",
        borderLeft: `3px solid ${PRIO_COLORS[task.priority]}`,
        borderRadius: "0 8px 8px 0", padding: "10px 12px", marginBottom: 6,
        cursor: "pointer", transition: "background-color 0.2s",
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 500, color: "var(--text1)", marginBottom: 4, lineHeight: 1.3 }}>
        {task.title}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 9, color: "var(--text3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
          {task.task_type_label}
        </span>
        <span style={{
          fontSize: 7, padding: "1px 5px", borderRadius: 3,
          background: `${PRIO_COLORS[task.priority]}18`, color: PRIO_COLORS[task.priority],
          fontWeight: 600, textTransform: "uppercase", fontFamily: "var(--font-mono)", flexShrink: 0,
        }}>{PRIO_LABELS[task.priority]}</span>
      </div>
    </div>
  );
}

export interface JurisRightPanelProps {
  rightPanelOpen: boolean;
  setRightPanelOpen: (open: boolean) => void;
  rightCollapsed: boolean;
  setRightCollapsed: (v: boolean) => void;
  rightTab: string;
  setRightTab: (tab: string) => void;
  allAgents: Agent[];
  visibleAgents: Agent[];
  visibility: { showCapacityPanel: boolean };
  hasRole: (role: string) => boolean;
}

export default function JurisRightPanel({
  rightPanelOpen,
  setRightPanelOpen,
  rightCollapsed,
  setRightCollapsed,
  rightTab,
  setRightTab,
  allAgents,
  visibleAgents,
  visibility,
  hasRole,
}: JurisRightPanelProps) {
  const navigate = useNavigate();
  const { tasks, loading: tasksLoading } = useMyInbox(false);
  const { processes, loading: procLoading } = useMyProcesses();

  const openKanban = () => navigate("/sistema/kanban");

  // Alertas: tarefas vencidas ou de prioridade crítica (vencidas primeiro).
  const alertTasks = tasks
    .filter(t => t.is_overdue || t.priority === "critical")
    .sort((a, b) => Number(b.is_overdue) - Number(a.is_overdue));

  return (
    <>
      <aside
        id="jc-right-panel"
        className={`jc-right-panel ${rightPanelOpen ? "mobile-visible" : ""} ${rightCollapsed ? "collapsed" : ""}`}
        aria-label="Central de operações"
      >
        <div className="jc-right-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>Central de Operações</span>
        </div>
        <div className="jc-right-tabs">
          {[
            { id: "filas", label: "Filas", icon: ListTodo },
            { id: "processos", label: "Processos", icon: FileText },
            { id: "alertas", label: "Alertas", icon: AlertTriangle },
            ...(hasRole("tech") ? [{ id: "agentes", label: "Agentes", icon: Zap }] : []),
          ].map(tab => (
            <div key={tab.id} className={`jc-right-tab ${rightTab === tab.id ? "active" : ""}`} onClick={() => setRightTab(tab.id)}>
              <tab.icon size={12} /> {tab.label}
            </div>
          ))}
        </div>
        <div className="jc-right-body">
          {/* ── FILAS: minhas tarefas abertas, agrupadas por status ── */}
          {rightTab === "filas" && (
            tasksLoading ? <HexagonLoader variant="compact" label="Carregando tarefas..." /> : (
              <>
                <div style={{ fontSize: 10, color: "var(--text3)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>
                  {tasks.length} {tasks.length === 1 ? "tarefa atribuída" : "tarefas atribuídas"}
                </div>
                {OPEN_QUEUE_STATUSES.map(status => {
                  const items = tasks.filter(t => t.status === status);
                  if (!items.length) return null;
                  return (
                    <div key={status} style={{ marginBottom: 14 }}>
                      <div style={{
                        fontSize: 11, fontWeight: 600, color: "var(--text1)", marginBottom: 6,
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                      }}>
                        <span>{USER_TASK_STATUS_LABELS[status]}</span>
                        <span style={{
                          fontSize: 9, padding: "2px 8px", borderRadius: 10,
                          background: "rgba(234,179,8,0.10)", color: "var(--gold)",
                          border: "1px solid rgba(234,179,8,0.28)", fontFamily: "var(--font-mono)",
                        }}>{items.length}</span>
                      </div>
                      {items.map(task => (
                        <TaskCard key={task.id} task={task} onOpen={openKanban} />
                      ))}
                    </div>
                  );
                })}
                {tasks.length === 0 && (
                  <div style={{ fontSize: 10, color: "var(--text3)", textAlign: "center", padding: "16px 0", fontStyle: "italic" }}>
                    Nenhuma tarefa atribuída
                  </div>
                )}
              </>
            )
          )}

          {/* ── PROCESSOS: casos do usuário (tabela processes) ── */}
          {rightTab === "processos" && (
            procLoading ? <HexagonLoader variant="compact" label="Carregando processos..." /> : (
              <>
                <div style={{ fontSize: 10, color: "var(--text3)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>
                  {processes.length} {processes.length === 1 ? "processo" : "processos"}
                </div>
                {processes.map(p => {
                  const hearingPast = p.next_hearing_date ? new Date(p.next_hearing_date) < new Date() : false;
                  return (
                    <div className="jc-case-card" key={p.id}>
                      <div className="jc-case-num">Proc. {p.process_number}</div>
                      <div className="jc-case-name">{p.client_name}</div>
                      <div className="jc-case-row">
                        <span className="jc-process-badge">{p.status}</span>
                        {p.responsible_lawyer && (
                          <span style={{ fontSize: 10, color: "var(--text3)" }}>{p.responsible_lawyer}</span>
                        )}
                      </div>
                      {p.next_hearing_date && (
                        <div className="jc-case-prazo-row">
                          <span style={{ color: hearingPast ? "#FACC15" : "var(--text3)", display: "flex", alignItems: "center", gap: 3 }}>
                            <AlertTriangle size={10} /> Audiência: {new Date(p.next_hearing_date).toLocaleDateString("pt-BR")}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
                {processes.length === 0 && (
                  <div style={{ fontSize: 10, color: "var(--text3)", textAlign: "center", padding: "16px 0", fontStyle: "italic" }}>
                    Nenhum processo cadastrado
                  </div>
                )}
              </>
            )
          )}

          {/* ── ALERTAS: tarefas vencidas ou críticas ── */}
          {rightTab === "alertas" && (
            tasksLoading ? <HexagonLoader variant="compact" label="Carregando alertas..." /> : (
              <>
                <div style={{ fontSize: 10, color: "var(--text3)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>
                  {alertTasks.length} {alertTasks.length === 1 ? "alerta" : "alertas"}
                </div>
                {alertTasks.map(t => {
                  const type = t.is_overdue ? "fatal" : "warning";
                  return (
                    <div
                      key={t.id}
                      className={`jc-alert-item ${type}`}
                      onClick={openKanban}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === "Enter") openKanban(); }}
                      style={{ cursor: "pointer" }}
                    >
                      <AlertIcon type={type} />
                      <div className="jc-alert-text">
                        {t.title}
                        <span style={{ display: "block", fontSize: 9, color: "var(--text3)", marginTop: 2 }}>
                          {t.is_overdue ? "Prazo vencido" : "Prioridade crítica"} · {USER_TASK_STATUS_LABELS[t.status]}
                        </span>
                      </div>
                      <div className="jc-alert-time">{formatDeadline(t.deadline_at)}</div>
                    </div>
                  );
                })}
                {alertTasks.length === 0 && (
                  <div style={{ fontSize: 10, color: "var(--text3)", textAlign: "center", padding: "16px 0", fontStyle: "italic" }}>
                    Nenhum alerta
                  </div>
                )}
              </>
            )
          )}

          {rightTab === "agentes" && (() => {
            const capacity = getTotalCapacity(allAgents);
            return (
              <>
                {visibility.showCapacityPanel && (
                  <div style={{ fontSize: 10, color: "var(--text2)", marginBottom: 8, padding: 8, background: "var(--bg4)", borderRadius: 6, border: "1px solid var(--border)" }}>
                    <div style={{ marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
                      <BarChart3 size={12} /> Capacidade: {capacity.used}/{capacity.total} ({capacity.percentage}%)
                    </div>
                    <div style={{ background: "var(--bg)", borderRadius: 4, height: 6, overflow: "hidden" }}>
                      <div style={{ width: `${capacity.percentage}%`, height: "100%", borderRadius: 4, background: capacity.percentage > 80 ? "#CA8A04" : capacity.percentage > 50 ? "#EAB308" : "#FACC15", transition: "width 0.55s var(--panel-ease)" }} />
                    </div>
                  </div>
                )}
                <div style={{ fontSize: 10, color: "var(--gold)", marginBottom: 8 }}>
                  {visibleAgents.length} agentes visíveis
                </div>
                {visibleAgents.map(agent => {
                  const load = getAgentLoad(agent);
                  const RoleIcon = ROLE_ICONS[agent.role] || Zap;
                  return (
                    <div key={agent.id} className="jc-agent-card-rp">
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                        <div style={{
                          width: 36, height: 36, borderRadius: 9,
                          background: `${agent.color}18`, color: agent.color,
                          border: `1px solid ${agent.color}25`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 11, fontWeight: 700, fontFamily: "var(--font-body)", flexShrink: 0
                        }}>{getInitials(agent.name)}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text1)", marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{agent.name}</div>
                          <div style={{ fontSize: 9, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.08em", display: "flex", alignItems: "center", gap: 4 }}>
                            <RoleIcon size={10} /> {roleLabelsMap[agent.role] || agent.role}
                          </div>
                        </div>
                        <Circle size={8}
                          fill={agent.status === "active" ? "#EAB308" : agent.status === "alert" ? "#FACC15" : "rgba(255,255,255,0.28)"}
                          style={{ color: agent.status === "active" ? "#EAB308" : agent.status === "alert" ? "#FACC15" : "rgba(255,255,255,0.28)" }} />
                      </div>
                      <div style={{ background: "var(--bg)", borderRadius: 4, height: 4, marginBottom: 6, overflow: "hidden" }}>
                        <div style={{ width: `${load}%`, height: "100%", borderRadius: 4, background: load > 80 ? "#CA8A04" : load > 50 ? "#EAB308" : "#FACC15", transition: "width 0.55s var(--panel-ease)" }} />
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 9, color: "var(--text3)" }}>Carga: {load}% · {agent.currentTasks}/{agent.maxConcurrentTasks}</span>
                      </div>
                    </div>
                  );
                })}
              </>
            );
          })()}
        </div>
      </aside>

      {/* Mobile overlay for right panel */}
      {rightPanelOpen && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 45, background: "rgba(0,0,0,0.4)" }}
          onClick={() => {
            setRightPanelOpen(false);
            setRightCollapsed(true);
          }}
          aria-hidden="true"
        />
      )}
    </>
  );
}
