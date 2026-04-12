import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { toast } from "sonner";

interface TaskItem {
  id: string;
  title: string;
  client_name: string | null;
  agent_name: string | null;
  priority: "critical" | "high" | "medium" | "low";
  status: string;
  task_category: string;
}

const QUEUE_CONFIG = [
  { id: "confeccao", label: "📝 Confecção de Peças", color: "#8b5cf6" },
  { id: "protocolar", label: "📋 A Protocolar", color: "#6366f1" },
  { id: "revisao", label: "🔍 Em Revisão", color: "#f59e0b" },
  { id: "comunicacao", label: "💬 Comunicação ao Cliente", color: "#06b6d4" },
  { id: "audiencias_fila", label: "🏛️ Preparação de Audiências", color: "#14b8a6" },
  { id: "monitoramento_fila", label: "🔍 Monitoramento de Resultados", color: "#f97316" },
];

const prioColors: Record<string, string> = { critical: "#ef4444", high: "#f59e0b", medium: "#3b82f6", low: "#6b7280" };
const prioLabels: Record<string, string> = { critical: "CRÍTICO", high: "ALTA", medium: "MÉDIA", low: "BAIXA" };

export default function TaskQueuesPanel() {
  const { user } = useAuth();
  const { canEdit } = usePermissions();
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTasks = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("agent_tasks")
      .select("id, title, client_name, agent_name, priority, status, task_category")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (!error && data) {
      setTasks(data as TaskItem[]);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // Realtime subscription
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("agent_tasks_realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "agent_tasks", filter: `user_id=eq.${user.id}` }, (payload) => {
        if (payload.eventType === "INSERT") {
          const newTask = payload.new as TaskItem;
          setTasks(prev => [newTask, ...prev]);
          toast.info(`Nova tarefa: ${newTask.title}`);
        } else if (payload.eventType === "UPDATE") {
          const updated = payload.new as TaskItem;
          setTasks(prev => prev.map(t => t.id === updated.id ? updated : t));
        } else if (payload.eventType === "DELETE") {
          const deleted = payload.old as { id: string };
          setTasks(prev => prev.filter(t => t.id !== deleted.id));
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const handleDragEnd = async (result: DropResult) => {
    if (!result.destination || !canEdit) return;
    const { draggableId, destination } = result;
    const newCategory = destination.droppableId;

    // Optimistic update
    setTasks(prev => prev.map(t => t.id === draggableId ? { ...t, task_category: newCategory } : t));

    const { error } = await supabase
      .from("agent_tasks")
      .update({ task_category: newCategory })
      .eq("id", draggableId);

    if (error) {
      toast.error("Erro ao mover tarefa");
      fetchTasks(); // revert
    } else {
      const task = tasks.find(t => t.id === draggableId);
      const queueLabel = QUEUE_CONFIG.find(q => q.id === newCategory)?.label || newCategory;
      toast.success(`"${task?.title?.slice(0, 30)}..." movida para ${queueLabel}`);
    }
  };

  const tasksByCategory = (catId: string) => tasks.filter(t => t.task_category === catId);
  const totalTasks = tasks.length;

  if (loading) {
    return <div style={{ fontSize: 11, color: "var(--text3)", padding: 12 }}>Carregando filas...</div>;
  }

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div style={{ fontSize: 10, color: "var(--text3)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>
        {totalTasks} tarefas em fila {!canEdit && <span style={{ color: "#f59e0b" }}>· 🔒 Leitura</span>}
      </div>
      {QUEUE_CONFIG.map(queue => {
        const items = tasksByCategory(queue.id);
        return (
          <div key={queue.id} style={{ marginBottom: 14 }}>
            <div style={{
              fontSize: 11, fontWeight: 600, color: queue.color, marginBottom: 6,
              display: "flex", alignItems: "center", justifyContent: "space-between"
            }}>
              <span>{queue.label}</span>
              <span style={{
                fontSize: 9, padding: "2px 8px", borderRadius: 10,
                background: `${queue.color}18`, color: queue.color,
                border: `1px solid ${queue.color}30`, fontFamily: "var(--font-mono)"
              }}>{items.length}</span>
            </div>
            <Droppable droppableId={queue.id} isDropDisabled={!canEdit}>
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  style={{
                    minHeight: 40,
                    borderRadius: 8,
                    padding: snapshot.isDraggingOver ? 4 : 0,
                    background: snapshot.isDraggingOver ? `${queue.color}08` : "transparent",
                    border: snapshot.isDraggingOver ? `1px dashed ${queue.color}40` : "1px dashed transparent",
                    transition: "all 0.2s",
                  }}
                >
                  {items.map((item, index) => (
                    <Draggable key={item.id} draggableId={item.id} index={index} isDragDisabled={!canEdit}>
                      {(dragProvided, dragSnapshot) => (
                        <div
                          ref={dragProvided.innerRef}
                          {...dragProvided.draggableProps}
                          {...dragProvided.dragHandleProps}
                          style={{
                            ...dragProvided.draggableProps.style,
                            background: dragSnapshot.isDragging ? "var(--bg4)" : "var(--bg3)",
                            border: `1px solid ${dragSnapshot.isDragging ? queue.color + "60" : "var(--border)"}`,
                            borderLeft: `3px solid ${prioColors[item.priority]}`,
                            borderRadius: "0 8px 8px 0", padding: "10px 12px", marginBottom: 6,
                            cursor: canEdit ? "grab" : "default",
                            opacity: dragSnapshot.isDragging ? 0.9 : 1,
                            boxShadow: dragSnapshot.isDragging ? "0 8px 24px rgba(0,0,0,0.3)" : "none",
                            transition: dragSnapshot.isDragging ? "none" : "background-color 0.2s, border-color 0.2s",
                          }}
                        >
                          <div style={{ fontSize: 11, fontWeight: 500, color: "var(--text1)", marginBottom: 4, lineHeight: 1.3 }}>
                            {item.title}
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                            <span style={{ fontSize: 9, color: "var(--text3)" }}>👤 {item.client_name || "—"}</span>
                            <span style={{
                              fontSize: 7, padding: "1px 5px", borderRadius: 3,
                              background: `${prioColors[item.priority]}18`, color: prioColors[item.priority],
                              fontWeight: 600, textTransform: "uppercase", fontFamily: "var(--font-mono)"
                            }}>
                              {prioLabels[item.priority]}
                            </span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <span style={{ fontSize: 8, color: "var(--text3)" }}>🤖 {item.agent_name || "—"}</span>
                            <span style={{
                              fontSize: 8, padding: "2px 6px", borderRadius: 4,
                              background: item.status === "completed" ? "rgba(45,212,160,0.15)" : item.status === "in_progress" ? "rgba(59,130,246,0.15)" : "var(--badge-bg)",
                              color: item.status === "completed" ? "var(--teal)" : item.status === "in_progress" ? "#3b82f6" : "var(--text3)",
                              fontFamily: "var(--font-mono)"
                            }}>{item.status}</span>
                          </div>
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                  {items.length === 0 && (
                    <div style={{
                      fontSize: 10, color: "var(--text3)", textAlign: "center",
                      padding: "12px 0", fontStyle: "italic"
                    }}>
                      Nenhuma tarefa nesta fila
                    </div>
                  )}
                </div>
              )}
            </Droppable>
          </div>
        );
      })}
    </DragDropContext>
  );
}
