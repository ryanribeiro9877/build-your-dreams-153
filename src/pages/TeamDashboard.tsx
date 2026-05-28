import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { HexagonLoader } from "@/components/HexagonLoader";
import { useMasterAdmin } from "@/hooks/useMasterAdmin";
import { useTeamTasks } from "@/hooks/useUserTasks";
import { useEmployeeRoster } from "@/hooks/useEmployeeRoster";
import { useTeamPresence } from "@/hooks/useTeamPresence";
import type { UserTaskStatus, TaskPriority } from "@/types/jurisai";

const COLUMN_CONFIG: Array<{ status: UserTaskStatus; label: string; color: string }> = [
  { status: "assigned",            label: "Atribuídas",          color: "#3b82f6" },
  { status: "in_progress",         label: "Em andamento",        color: "#eab308" },
  { status: "awaiting_validation", label: "Aguardando validação", color: "#a855f7" },
  { status: "awaiting_external",   label: "Externo",             color: "#7a7a92" },
  { status: "blocked",             label: "Bloqueadas",          color: "#ef4444" },
];

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  critical: "#ef4444",
  high: "#f59e0b",
  medium: "#3b82f6",
  low: "#6b7280",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export default function TeamDashboard() {
  const navigate = useNavigate();
  const { isMaster, checking } = useMasterAdmin();
  const { tasks, loading: tasksLoading } = useTeamTasks();
  const { members } = useEmployeeRoster();
  const { isOnline } = useTeamPresence();
  const [view, setView] = useState<"kanban" | "team">("kanban");

  if (checking) return <HexagonLoader variant="fullscreen" label="Carregando" />;
  if (!isMaster) {
    navigate("/sistema", { replace: true });
    return null;
  }

  const tasksByStatus: Record<string, typeof tasks> = {};
  for (const col of COLUMN_CONFIG) tasksByStatus[col.status] = [];
  for (const task of tasks) {
    if (tasksByStatus[task.status]) {
      tasksByStatus[task.status].push(task);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#09090f",
        color: "#eeeef5",
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
        padding: 24,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
        <button
          onClick={() => navigate("/sistema")}
          style={{
            padding: "8px 16px", borderRadius: 8,
            border: "1px solid #25253a", background: "#11111a",
            color: "#c4c4d4", cursor: "pointer", fontSize: 13,
          }}
        >
          ← Voltar
        </button>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "#eab308", margin: 0 }}>Equipe</h1>

        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button
            onClick={() => setView("kanban")}
            style={{
              padding: "8px 14px", borderRadius: 8,
              border: `1px solid ${view === "kanban" ? "#eab308" : "#25253a"}`,
              background: view === "kanban" ? "rgba(234, 179, 8, 0.15)" : "#11111a",
              color: view === "kanban" ? "#facc15" : "#c4c4d4",
              cursor: "pointer", fontSize: 13, fontWeight: 600,
            }}
          >
            Kanban
          </button>
          <button
            onClick={() => setView("team")}
            style={{
              padding: "8px 14px", borderRadius: 8,
              border: `1px solid ${view === "team" ? "#eab308" : "#25253a"}`,
              background: view === "team" ? "rgba(234, 179, 8, 0.15)" : "#11111a",
              color: view === "team" ? "#facc15" : "#c4c4d4",
              cursor: "pointer", fontSize: 13, fontWeight: 600,
            }}
          >
            Funcionários
          </button>
          <button
            onClick={() => navigate("/sistema/equipe/atribuir")}
            style={{
              padding: "8px 14px", borderRadius: 8,
              border: "1px solid #eab308",
              background: "linear-gradient(145deg, #eab308 0%, #facc15 100%)",
              color: "#0a0a12",
              cursor: "pointer", fontSize: 13, fontWeight: 700,
            }}
          >
            + Atribuir tarefa
          </button>
        </div>
      </div>

      {tasksLoading ? (
        <HexagonLoader variant="inline" label="Carregando tarefas" />
      ) : view === "kanban" ? (
        <div style={{
          display: "grid",
          gridTemplateColumns: `repeat(${COLUMN_CONFIG.length}, minmax(220px, 1fr))`,
          gap: 12, overflowX: "auto",
        }}>
          {COLUMN_CONFIG.map((col) => {
            const colTasks = tasksByStatus[col.status] || [];
            return (
              <div key={col.status} style={{
                background: "#11111a",
                border: "1px solid #25253a",
                borderRadius: 12,
                padding: 12,
                minHeight: 400,
              }}>
                <div style={{
                  display: "flex", alignItems: "center", gap: 8, marginBottom: 12,
                  paddingBottom: 8, borderBottom: `2px solid ${col.color}`,
                }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: col.color }}>
                    {col.label}
                  </span>
                  <span style={{
                    marginLeft: "auto",
                    fontSize: 11, color: "#7a7a92",
                    background: "#16161f",
                    padding: "2px 8px", borderRadius: 10,
                  }}>
                    {colTasks.length}
                  </span>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {colTasks.length === 0 && (
                    <div style={{
                      padding: 16, textAlign: "center", color: "#7a7a92",
                      fontSize: 12, fontStyle: "italic",
                    }}>
                      Vazia
                    </div>
                  )}
                  {colTasks.map((task) => (
                    <div key={task.id} style={{
                      background: "#16161f",
                      border: `1px solid ${task.is_overdue ? "rgba(239, 68, 68, 0.4)" : "#25253a"}`,
                      borderRadius: 8,
                      padding: 10,
                      borderLeft: `3px solid ${PRIORITY_COLORS[task.priority]}`,
                    }}>
                      <div style={{ fontSize: 10, color: "#7a7a92", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 3 }}>
                        {task.task_type_label}
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#eeeef5", marginBottom: 6, lineHeight: 1.3 }}>
                        {task.title}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 11, color: "#c4c4d4" }}>
                        <span>👤 {task.assignee_name}</span>
                        <span style={{ color: task.is_overdue ? "#ef4444" : "#7a7a92" }}>
                          {formatDate(task.deadline_at)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        // VIEW: Funcionários
        <div style={{
          background: "#11111a", border: "1px solid #25253a",
          borderRadius: 12, overflow: "hidden",
        }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "#16161f", borderBottom: "1px solid #25253a" }}>
                <th style={thStyle}>Nome</th>
                <th style={thStyle}>Função</th>
                <th style={{ ...thStyle, textAlign: "center" }}>Tarefas abertas</th>
                <th style={{ ...thStyle, width: 140 }}>Status</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const online = isOnline(m.user_id);
                const myTasks = tasks.filter(t => t.assignee_user_id === m.user_id);
                const overdueCount = myTasks.filter(t => t.is_overdue).length;
                return (
                  <tr key={m.user_id} style={{ borderBottom: "1px solid #25253a" }}>
                    <td style={{ padding: "14px 16px", color: "#eeeef5", fontWeight: 500 }}>{m.name}</td>
                    <td style={{ padding: "14px 16px", color: "#c4c4d4" }}>{m.roleLabel}</td>
                    <td style={{ padding: "14px 16px", textAlign: "center" }}>
                      <span style={{
                        fontSize: 13, fontWeight: 600,
                        color: overdueCount > 0 ? "#ef4444" : "#facc15",
                      }}>
                        {myTasks.length}
                        {overdueCount > 0 && (
                          <span style={{ fontSize: 11, marginLeft: 6, color: "#ef4444" }}>
                            ({overdueCount} atrasadas)
                          </span>
                        )}
                      </span>
                    </td>
                    <td style={{ padding: "14px 16px" }}>
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: 8,
                        fontSize: 13, color: online ? "#4ade80" : "#7a7a92",
                      }}>
                        <span style={{
                          width: 8, height: 8, borderRadius: "50%",
                          background: online ? "#22c55e" : "#52525b",
                        }} />
                        {online ? "Online" : "Offline"}
                      </span>
                    </td>
                    <td style={{ padding: "14px 16px", textAlign: "right" }}>
                      <button
                        onClick={() => navigate(`/sistema/equipe/atribuir?to=${m.user_id}`)}
                        style={{
                          padding: "6px 12px", borderRadius: 6,
                          border: "1px solid #eab308",
                          background: "rgba(234, 179, 8, 0.1)",
                          color: "#facc15",
                          cursor: "pointer", fontSize: 12, fontWeight: 600,
                        }}
                      >
                        Atribuir
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "12px 16px",
  fontSize: 11,
  fontWeight: 600,
  color: "#9898b0",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
};
