import { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { HexagonLoader } from "@/components/HexagonLoader";
import { toast } from "sonner";
import type { LegalArea, TaskPriority } from "@/types/jurisai";

interface ValidationTask {
  id: string;
  title: string;
  description: string | null;
  task_type_code: string;
  task_type_label: string;
  priority: TaskPriority;
  deadline_at: string | null;
  area: LegalArea | null;
  assignee_user_id: string;
  assignee_name: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  is_overdue: boolean;
}

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  critical: "#ef4444", high: "#f59e0b", medium: "#3b82f6", low: "#6b7280",
};
const PRIORITY_LABELS: Record<TaskPriority, string> = {
  critical: "Crítica", high: "Alta", medium: "Média", low: "Baixa",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export default function ValidationQueue() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [tasks, setTasks] = useState<ValidationTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectNotes, setRejectNotes] = useState("");

  const fetchQueue = useCallback(async () => {
    setLoading(true);
    const { data, error: rpcErr } = await supabase.rpc("get_my_validation_queue" as never);
    if (rpcErr) {
      setError(rpcErr.message);
      setTasks([]);
    } else {
      setTasks((data as unknown as ValidationTask[]) || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchQueue();
  }, [fetchQueue]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`validation-queue-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "user_tasks" }, () => {
        void fetchQueue();
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [user, fetchQueue]);

  const handleAction = async (taskId: string, approve: boolean, notes?: string) => {
    setProcessingId(taskId);
    try {
      const { error: rpcErr } = await supabase.rpc("validate_user_task" as never, {
        p_task_id: taskId,
        p_approve: approve,
        p_notes: notes ?? null,
      } as never);
      if (rpcErr) throw rpcErr;
      toast.success(approve ? "Tarefa aprovada!" : "Tarefa rejeitada — voltou pro funcionário corrigir");
      setRejectId(null);
      setRejectNotes("");
      void fetchQueue();
    } catch (e) {
      toast.error(`Erro: ${(e as Error).message}`);
    } finally {
      setProcessingId(null);
    }
  };

  if (loading) return <HexagonLoader variant="fullscreen" label="Carregando" />;

  return (
    <div style={{
      minHeight: "100vh", background: "#09090f", color: "#eeeef5",
      fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", padding: 24,
    }}>
      <div style={{ maxWidth: 1000, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <button
            onClick={() => navigate("/sistema")}
            style={{
              padding: "8px 16px", borderRadius: 8, border: "1px solid #25253a",
              background: "#11111a", color: "#c4c4d4", cursor: "pointer", fontSize: 13,
            }}
          >
            ← Voltar
          </button>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "#eab308", margin: 0 }}>
            Fila de Validação
          </h1>
          <span style={{
            marginLeft: "auto",
            padding: "4px 10px", borderRadius: 14,
            background: tasks.length > 0 ? "rgba(168, 85, 247, 0.15)" : "#16161f",
            border: `1px solid ${tasks.length > 0 ? "rgba(168, 85, 247, 0.4)" : "#25253a"}`,
            fontSize: 12, color: tasks.length > 0 ? "#c4b5fd" : "#7a7a92",
          }}>
            {tasks.length} tarefa{tasks.length !== 1 ? "s" : ""} aguardando
          </span>
        </div>

        <p style={{ fontSize: 13, color: "#7a7a92", marginBottom: 20, marginTop: 0 }}>
          Cadastros e tarefas que precisam da sua revisão antes de serem concluídas.
        </p>

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
            padding: 32, textAlign: "center",
            background: "#11111a", border: "1px solid #25253a",
            borderRadius: 12, color: "#7a7a92",
          }}>
            Nenhuma tarefa aguardando validação no momento. ✓
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {tasks.map(task => {
              const isRejecting = rejectId === task.id;
              return (
                <div key={task.id} style={{
                  background: "#11111a",
                  border: `1px solid ${task.is_overdue ? "rgba(239, 68, 68, 0.4)" : "rgba(168, 85, 247, 0.3)"}`,
                  borderRadius: 12, padding: 16,
                }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                    <div style={{
                      width: 4, alignSelf: "stretch", minHeight: 40,
                      borderRadius: 2, flexShrink: 0,
                      background: PRIORITY_COLORS[task.priority],
                    }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 11, color: "#7a7a92",
                        letterSpacing: "0.06em", textTransform: "uppercase",
                        marginBottom: 4,
                      }}>
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
                      <div style={{
                        display: "flex", gap: 12, flexWrap: "wrap",
                        fontSize: 12, color: "#7a7a92", marginBottom: 12,
                      }}>
                        <span>👤 Por: {task.assignee_name}</span>
                        <span style={{ color: task.is_overdue ? "#ef4444" : "#7a7a92" }}>
                          ⏰ {formatDate(task.deadline_at)}
                          {task.is_overdue ? " (atrasado)" : ""}
                        </span>
                        <span>⚡ {PRIORITY_LABELS[task.priority]}</span>
                      </div>

                      {task.notes && (
                        <div style={{
                          fontSize: 12, color: "#c4c4d4",
                          padding: 10, marginBottom: 12,
                          background: "#16161f", borderRadius: 6,
                          borderLeft: "3px solid #7a7a92",
                          whiteSpace: "pre-line",
                        }}>
                          <div style={{ fontSize: 10, color: "#7a7a92", marginBottom: 4 }}>Notas:</div>
                          {task.notes}
                        </div>
                      )}

                      {isRejecting ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          <textarea
                            placeholder="Explique o motivo da rejeição (opcional)..."
                            value={rejectNotes}
                            onChange={(e) => setRejectNotes(e.target.value)}
                            rows={3}
                            style={{
                              width: "100%",
                              padding: 10, borderRadius: 6,
                              background: "#16161f", border: "1px solid #25253a",
                              color: "#eeeef5", fontSize: 13,
                              outline: "none", fontFamily: "inherit", resize: "vertical",
                            }}
                          />
                          <div style={{ display: "flex", gap: 8 }}>
                            <button
                              onClick={() => handleAction(task.id, false, rejectNotes.trim() || undefined)}
                              disabled={processingId === task.id}
                              style={{
                                padding: "8px 14px", borderRadius: 6,
                                border: "1px solid #ef4444",
                                background: "rgba(239, 68, 68, 0.15)",
                                color: "#fca5a5", fontSize: 12, fontWeight: 600,
                                cursor: "pointer",
                              }}
                            >
                              {processingId === task.id ? "..." : "Confirmar rejeição"}
                            </button>
                            <button
                              onClick={() => { setRejectId(null); setRejectNotes(""); }}
                              disabled={processingId === task.id}
                              style={{
                                padding: "8px 14px", borderRadius: 6,
                                border: "1px solid #25253a", background: "#16161f",
                                color: "#c4c4d4", fontSize: 12, cursor: "pointer",
                              }}
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            onClick={() => handleAction(task.id, true)}
                            disabled={processingId === task.id}
                            style={{
                              padding: "8px 16px", borderRadius: 8, border: "1px solid #22c55e",
                              background: "rgba(34, 197, 94, 0.15)",
                              color: "#86efac", fontSize: 13, fontWeight: 600, cursor: "pointer",
                            }}
                          >
                            ✓ Aprovar
                          </button>
                          <button
                            onClick={() => setRejectId(task.id)}
                            disabled={processingId === task.id}
                            style={{
                              padding: "8px 16px", borderRadius: 8, border: "1px solid #ef4444",
                              background: "rgba(239, 68, 68, 0.1)",
                              color: "#fca5a5", fontSize: 13, fontWeight: 600, cursor: "pointer",
                            }}
                          >
                            ✗ Rejeitar
                          </button>
                        </div>
                      )}
                    </div>
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
