import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { HexagonLoader } from "@/components/HexagonLoader";
import { useMyInbox, updateUserTaskStatus } from "@/hooks/useUserTasks";
import { toast } from "sonner";
import type { UserTaskStatus, TaskPriority } from "@/types/jurisai";

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  critical: "#ef4444",
  high: "#f59e0b",
  medium: "#3b82f6",
  low: "#6b7280",
};

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  critical: "Crítica",
  high: "Alta",
  medium: "Média",
  low: "Baixa",
};

const STATUS_LABELS: Record<UserTaskStatus, string> = {
  draft: "Rascunho",
  assigned: "Atribuída",
  in_progress: "Em andamento",
  awaiting_external: "Aguardando externo",
  awaiting_validation: "Aguardando validação",
  blocked: "Bloqueada",
  completed: "Concluída",
  cancelled: "Cancelada",
};

const NEXT_STATUS: Record<UserTaskStatus, UserTaskStatus | null> = {
  draft: "assigned",
  assigned: "in_progress",
  in_progress: "completed",
  awaiting_external: "completed",
  awaiting_validation: "completed",
  blocked: "in_progress",
  completed: null,
  cancelled: null,
};

function formatDeadline(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export default function MyInbox() {
  const navigate = useNavigate();
  const [includeCompleted, setIncludeCompleted] = useState(false);
  const { tasks, loading, error, refresh } = useMyInbox(includeCompleted);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const advance = async (taskId: string, current: UserTaskStatus) => {
    const next = NEXT_STATUS[current];
    if (!next) return;
    setUpdatingId(taskId);
    try {
      await updateUserTaskStatus(taskId, next);
      toast.success(`Tarefa movida para "${STATUS_LABELS[next]}"`);
      void refresh();
    } catch (e) {
      toast.error(`Erro: ${(e as Error).message}`);
    } finally {
      setUpdatingId(null);
    }
  };

  if (loading) return <HexagonLoader variant="fullscreen" label="Carregando" />;

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
      <div style={{ maxWidth: 1000, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
          <button
            onClick={() => navigate("/sistema")}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: "1px solid #25253a",
              background: "#11111a",
              color: "#c4c4d4",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            ← Voltar
          </button>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "#eab308", margin: 0 }}>Minhas Tarefas</h1>
          <div style={{ marginLeft: "auto" }}>
            <label style={{ fontSize: 13, color: "#c4c4d4", display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={includeCompleted}
                onChange={(e) => setIncludeCompleted(e.target.checked)}
              />
              Mostrar concluídas
            </label>
          </div>
        </div>

        {error && (
          <div style={{
            padding: 16, borderRadius: 12, marginBottom: 16,
            background: "rgba(239, 68, 68, 0.1)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            color: "#fca5a5",
          }}>
            {error}
          </div>
        )}

        {tasks.length === 0 ? (
          <div style={{
            padding: 32, borderRadius: 12, textAlign: "center",
            background: "#11111a", border: "1px solid #25253a", color: "#7a7a92",
          }}>
            Nenhuma tarefa {includeCompleted ? "" : "aberta"} para você no momento.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {tasks.map((task) => {
              const isCompleted = task.status === "completed" || task.status === "cancelled";
              const next = NEXT_STATUS[task.status];
              return (
                <div
                  key={task.id}
                  style={{
                    background: "#11111a",
                    border: `1px solid ${task.is_overdue ? "rgba(239, 68, 68, 0.4)" : "#25253a"}`,
                    borderRadius: 12,
                    padding: 16,
                    opacity: isCompleted ? 0.65 : 1,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 8 }}>
                    <div style={{
                      width: 4, height: 40, borderRadius: 2, flexShrink: 0,
                      background: PRIORITY_COLORS[task.priority],
                    }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, color: "#7a7a92", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 4 }}>
                        {task.task_type_label}
                      </div>
                      <div style={{ fontSize: 16, fontWeight: 600, color: "#eeeef5", marginBottom: 4 }}>
                        {task.title}
                      </div>
                      {task.description && (
                        <div style={{ fontSize: 13, color: "#c4c4d4", marginBottom: 8, lineHeight: 1.5 }}>
                          {task.description}
                        </div>
                      )}
                      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 12, color: "#7a7a92" }}>
                        <span>📌 De: {task.assigner_name}</span>
                        <span style={{ color: task.is_overdue ? "#ef4444" : "#7a7a92" }}>
                          ⏰ Prazo: {formatDeadline(task.deadline_at)}
                          {task.is_overdue ? " (atrasado)" : ""}
                        </span>
                        <span>
                          ⚡ {PRIORITY_LABELS[task.priority]}
                        </span>
                        <span style={{
                          padding: "2px 8px",
                          borderRadius: 4,
                          background: "rgba(234, 179, 8, 0.1)",
                          color: "#facc15",
                          fontSize: 11,
                        }}>
                          {STATUS_LABELS[task.status]}
                        </span>
                      </div>
                    </div>
                    {next && !isCompleted && (
                      <button
                        onClick={() => advance(task.id, task.status)}
                        disabled={updatingId === task.id}
                        style={{
                          padding: "8px 14px",
                          borderRadius: 8,
                          border: "1px solid #eab308",
                          background: "linear-gradient(145deg, rgba(234,179,8,0.2), rgba(250,204,21,0.1))",
                          color: "#facc15",
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: "pointer",
                          whiteSpace: "nowrap",
                          opacity: updatingId === task.id ? 0.5 : 1,
                        }}
                      >
                        {updatingId === task.id ? "..." : `→ ${STATUS_LABELS[next]}`}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
