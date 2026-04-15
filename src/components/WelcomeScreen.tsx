import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  ClipboardList, Clock, Loader, AlertTriangle, MessageSquare, ListTodo,
  Users, BarChart3, User, Rocket, CircleAlert, Timer,
} from "lucide-react";

interface TaskSummary {
  total: number; critical: number; pending: number;
  inProgress: number; overdue: number; dueSoon: number;
}

export default function WelcomeScreen({ onDismiss }: { onDismiss: () => void }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [summary, setSummary] = useState<TaskSummary>({ total: 0, critical: 0, pending: 0, inProgress: 0, overdue: 0, dueSoon: 0 });
  const [recentClients, setRecentClients] = useState<{ full_name: string; created_at: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState("");

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data: profile } = await supabase.from("profiles").select("display_name").eq("user_id", user.id).maybeSingle();
      setDisplayName(profile?.display_name || user.email?.split("@")[0] || "Usuário");
      const { data: tasks } = await supabase.from("agent_tasks").select("priority, status, due_date").eq("user_id", user.id);
      const now = new Date();
      const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);
      if (tasks) {
        setSummary({
          total: tasks.length,
          critical: tasks.filter(t => t.priority === "critical").length,
          pending: tasks.filter(t => t.status === "pending").length,
          inProgress: tasks.filter(t => t.status === "in_progress").length,
          overdue: tasks.filter(t => t.due_date && new Date(t.due_date) < now && t.status !== "completed" && t.status !== "cancelled").length,
          dueSoon: tasks.filter(t => t.due_date && new Date(t.due_date) >= now && new Date(t.due_date) <= in48h && t.status !== "completed").length,
        });
      }
      const { data: clients } = await supabase.from("clients").select("full_name, created_at").order("created_at", { ascending: false }).limit(3);
      setRecentClients(clients || []);
      setLoading(false);
    };
    load();
  }, [user]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";

  const shortcuts = [
    { icon: MessageSquare, label: "Chat IA", action: onDismiss },
    { icon: ListTodo, label: "Filas de Tarefas", action: onDismiss },
    { icon: Users, label: "Clientes", action: () => navigate("/clientes") },
    { icon: BarChart3, label: "Dashboard", action: () => navigate("/dashboard") },
    { icon: User, label: "Meu Perfil", action: () => navigate("/perfil") },
  ];

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#c9a84c" }}>
        <div style={{ textAlign: "center" }}>
          <Loader size={40} style={{ marginBottom: 12, animation: "pulse 2s infinite" }} />
          <p>Carregando seu briefing...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "24px", maxWidth: 900, margin: "0 auto", overflowY: "auto", height: "100%" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "#c9a84c", margin: 0 }}>
          {greeting}, {displayName}!
        </h1>
        <p style={{ color: "#94a3b8", marginTop: 4, fontSize: 14 }}>
          Aqui está o resumo do seu dia — seus agentes estão trabalhando por você.
        </p>
      </div>

      {(summary.overdue > 0 || summary.critical > 0) && (
        <div style={{
          background: "linear-gradient(135deg, rgba(239,68,68,0.15), rgba(245,158,11,0.1))",
          border: "1px solid rgba(239,68,68,0.3)", borderRadius: 12, padding: 16, marginBottom: 20
        }}>
          <p style={{ fontWeight: 600, color: "#ef4444", margin: 0, fontSize: 15, display: "flex", alignItems: "center", gap: 6 }}>
            <AlertTriangle size={16} /> Atenção Necessária
          </p>
          <div style={{ display: "flex", gap: 20, marginTop: 8 }}>
            {summary.overdue > 0 && (
              <span style={{ color: "#fca5a5", fontSize: 13, display: "flex", alignItems: "center", gap: 4 }}>
                <CircleAlert size={14} /> {summary.overdue} tarefa(s) atrasada(s)
              </span>
            )}
            {summary.critical > 0 && (
              <span style={{ color: "#fbbf24", fontSize: 13, display: "flex", alignItems: "center", gap: 4 }}>
                <AlertTriangle size={14} /> {summary.critical} tarefa(s) crítica(s)
              </span>
            )}
            {summary.dueSoon > 0 && (
              <span style={{ color: "#93c5fd", fontSize: 13, display: "flex", alignItems: "center", gap: 4 }}>
                <Timer size={14} /> {summary.dueSoon} prazo(s) próximo(s)
              </span>
            )}
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Total de Tarefas", value: summary.total, icon: ClipboardList, color: "#c9a84c" },
          { label: "Pendentes", value: summary.pending, icon: Clock, color: "#f59e0b" },
          { label: "Em Andamento", value: summary.inProgress, icon: Loader, color: "#3b82f6" },
          { label: "Críticas", value: summary.critical, icon: AlertTriangle, color: "#ef4444" },
        ].map((kpi) => (
          <div key={kpi.label} style={{
            background: "rgba(255,255,255,0.03)", border: "1px solid rgba(201,168,76,0.15)",
            borderRadius: 12, padding: 16, textAlign: "center"
          }}>
            <kpi.icon size={24} style={{ color: kpi.color, marginBottom: 4 }} />
            <div style={{ fontSize: 28, fontWeight: 700, color: kpi.color }}>{kpi.value}</div>
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{kpi.label}</div>
          </div>
        ))}
      </div>

      <div style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: "#c9a84c", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
          <Rocket size={14} /> Atalhos Rápidos
        </h3>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {shortcuts.map((s) => (
            <button key={s.label} onClick={s.action}
              style={{
                background: "rgba(201,168,76,0.08)", border: "1px solid rgba(201,168,76,0.2)",
                borderRadius: 10, padding: "10px 18px", color: "#e2d5a0", cursor: "pointer",
                fontSize: 13, fontWeight: 500, transition: "all 0.2s",
                display: "flex", alignItems: "center", gap: 6,
              }}
              onMouseOver={(e) => { e.currentTarget.style.background = "rgba(201,168,76,0.18)"; }}
              onMouseOut={(e) => { e.currentTarget.style.background = "rgba(201,168,76,0.08)"; }}>
              <s.icon size={14} /> {s.label}
            </button>
          ))}
        </div>
      </div>

      {recentClients.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: "#c9a84c", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
            <Users size={14} /> Últimos Clientes
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {recentClients.map((c, i) => (
              <div key={i} style={{
                background: "rgba(255,255,255,0.02)", border: "1px solid rgba(201,168,76,0.1)",
                borderRadius: 8, padding: "10px 14px",
                display: "flex", justifyContent: "space-between", alignItems: "center"
              }}>
                <span style={{ color: "#e2d5a0", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
                  <User size={12} /> {c.full_name}
                </span>
                <span style={{ color: "#64748b", fontSize: 11 }}>
                  {new Date(c.created_at).toLocaleDateString("pt-BR")}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ textAlign: "center", marginTop: 8 }}>
        <button onClick={onDismiss} style={{
          background: "linear-gradient(135deg, #c9a84c, #b8942e)", color: "#09090f",
          border: "none", borderRadius: 12, padding: "14px 40px",
          fontSize: 15, fontWeight: 700, cursor: "pointer",
          boxShadow: "0 4px 20px rgba(201,168,76,0.3)",
          display: "inline-flex", alignItems: "center", gap: 8,
        }}>
          <Rocket size={16} /> Começar a Trabalhar
        </button>
      </div>
    </div>
  );
}
