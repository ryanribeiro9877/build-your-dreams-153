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
const PRIORITIES = ["critical", "high", "medium", "low"] as const;

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "7px 10px", borderRadius: 6,
  background: "var(--bg4)", border: "1px solid var(--border)", color: "var(--text1)",
  fontSize: 11, fontFamily: "var(--font-body)", outline: "none", boxSizing: "border-box",
};
const selectStyle: React.CSSProperties = { ...inputStyle, appearance: "auto" as any };

export default function TaskQueuesPanel() {
  const { user } = useAuth();
  const { canEdit } = usePermissions();
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchText, setSearchText] = useState("");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [filterAgent, setFilterAgent] = useState("");

  // Create task form
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newClient, setNewClient] = useState("");
  const [newPriority, setNewPriority] = useState<string>("medium");
  const [newCategory, setNewCategory] = useState("confeccao");
  const [creating, setCreating] = useState(false);

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

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  // Realtime subscription
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("agent_tasks_realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "agent_tasks", filter: `user_id=eq.${user.id}` }, (payload) => {
        if (payload.eventType === "INSERT") {
          const newTask = payload.new as TaskItem;
          setTasks(prev => [newTask, ...prev]);
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
    const newCat = destination.droppableId;
    setTasks(prev => prev.map(t => t.id === draggableId ? { ...t, task_category: newCat } : t));
    const { error } = await supabase.from("agent_tasks").update({ task_category: newCat }).eq("id", draggableId);
    if (error) { toast.error("Erro ao mover tarefa"); fetchTasks(); }
    else {
      const qLabel = QUEUE_CONFIG.find(q => q.id === newCat)?.label || newCat;
      toast.success(`Tarefa movida para ${qLabel}`);
    }
  };

  const handleCreateTask = async () => {
    if (!user || !newTitle.trim()) return;
    setCreating(true);
    // Get first agent for assignment
    const { data: agentData } = await supabase.from("agents").select("id").limit(1);
    const agentId = agentData?.[0]?.id;
    if (!agentId) { toast.error("Nenhum agente disponível"); setCreating(false); return; }

    const { error } = await supabase.from("agent_tasks").insert({
      user_id: user.id,
      agent_id: agentId,
      title: newTitle.trim(),
      client_name: newClient.trim() || null,
      priority: newPriority as any,
      task_category: newCategory,
      status: "pending",
      task_type: "general",
    });
    setCreating(false);
    if (error) toast.error("Erro: " + error.message);
    else {
      toast.success("Tarefa criada!");
      setNewTitle(""); setNewClient(""); setNewPriority("medium"); setNewCategory("confeccao");
      setShowCreate(false);
      fetchTasks();
    }
  };

  // Apply filters
  const filteredTasks = tasks.filter(t => {
    if (filterPriority !== "all" && t.priority !== filterPriority) return false;
    if (filterAgent && !t.agent_name?.toLowerCase().includes(filterAgent.toLowerCase())) return false;
    if (searchText) {
      const s = searchText.toLowerCase();
      if (!t.title.toLowerCase().includes(s) && !t.client_name?.toLowerCase().includes(s) && !t.agent_name?.toLowerCase().includes(s)) return false;
    }
    return true;
  });

  const tasksByCategory = (catId: string) => filteredTasks.filter(t => t.task_category === catId);

  if (loading) return <div style={{ fontSize: 11, color: "var(--text3)", padding: 12 }}>Carregando filas...</div>;

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      {/* Header with count */}
      <div style={{ fontSize: 10, color: "var(--text3)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
        {filteredTasks.length} tarefas {filteredTasks.length !== tasks.length && `(de ${tasks.length})`}
        {!canEdit && <span style={{ color: "#f59e0b" }}> · 🔒 Leitura</span>}
      </div>

      {/* Search & Filters */}
      <div style={{ marginBottom: 10 }}>
        <input
          placeholder="🔍 Buscar tarefa, cliente, agente..."
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          style={{ ...inputStyle, marginBottom: 6 }}
        />
        <div style={{ display: "flex", gap: 4 }}>
          <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} style={{ ...selectStyle, flex: 1 }}>
            <option value="all">Todas prioridades</option>
            {PRIORITIES.map(p => <option key={p} value={p}>{prioLabels[p]}</option>)}
          </select>
          <input
            placeholder="Filtrar agente..."
            value={filterAgent}
            onChange={e => setFilterAgent(e.target.value)}
            style={{ ...inputStyle, flex: 1 }}
          />
        </div>
      </div>

      {/* Create Task Button */}
      {canEdit && (
        <div style={{ marginBottom: 10 }}>
          {!showCreate ? (
            <button
              onClick={() => setShowCreate(true)}
              style={{
                width: "100%", padding: "8px 0", borderRadius: 8, border: "1px dashed var(--border2)",
                background: "transparent", color: "var(--gold)", cursor: "pointer",
                fontSize: 11, fontFamily: "var(--font-body)",
                transition: "all 0.2s",
              }}
            >
              + Nova Tarefa
            </button>
          ) : (
            <div style={{
              padding: 12, borderRadius: 10, background: "var(--bg3)",
              border: "1px solid var(--border)", marginBottom: 4,
            }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: "var(--gold)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                Nova Tarefa
              </div>
              <input placeholder="Título da tarefa *" value={newTitle} onChange={e => setNewTitle(e.target.value)} style={{ ...inputStyle, marginBottom: 6 }} />
              <input placeholder="Nome do cliente" value={newClient} onChange={e => setNewClient(e.target.value)} style={{ ...inputStyle, marginBottom: 6 }} />
              <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
                <select value={newPriority} onChange={e => setNewPriority(e.target.value)} style={{ ...selectStyle, flex: 1 }}>
                  {PRIORITIES.map(p => <option key={p} value={p}>{prioLabels[p]}</option>)}
                </select>
                <select value={newCategory} onChange={e => setNewCategory(e.target.value)} style={{ ...selectStyle, flex: 1 }}>
                  {QUEUE_CONFIG.map(q => <option key={q.id} value={q.id}>{q.label}</option>)}
                </select>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  onClick={handleCreateTask}
                  disabled={creating || !newTitle.trim()}
                  style={{
                    flex: 1, padding: "7px 0", borderRadius: 6, border: "none",
                    background: "var(--gold)", color: "#0a0a12", cursor: "pointer",
                    fontSize: 11, fontWeight: 600, fontFamily: "var(--font-body)",
                    opacity: creating || !newTitle.trim() ? 0.5 : 1,
                  }}
                >
                  {creating ? "Criando..." : "Criar"}
                </button>
                <button
                  onClick={() => setShowCreate(false)}
                  style={{
                    padding: "7px 12px", borderRadius: 6, border: "1px solid var(--border)",
                    background: "transparent", color: "var(--text3)", cursor: "pointer",
                    fontSize: 11, fontFamily: "var(--font-body)",
                  }}
                >
                  ✕
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Task Queues with DnD */}
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
                    minHeight: 36, borderRadius: 8, padding: snapshot.isDraggingOver ? 4 : 0,
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
                            transition: dragSnapshot.isDragging ? "none" : "background-color 0.2s",
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
                            }}>{prioLabels[item.priority]}</span>
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
                    <div style={{ fontSize: 10, color: "var(--text3)", textAlign: "center", padding: "10px 0", fontStyle: "italic" }}>
                      Nenhuma tarefa
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
