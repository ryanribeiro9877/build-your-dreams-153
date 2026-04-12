import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

const CATEGORY_LABELS: Record<string, string> = {
  confeccao: "Confecção de Peças",
  protocolar: "A Protocolar",
  revisao: "Em Revisão",
  comunicacao: "Comunicação ao Cliente",
  audiencias_fila: "Prep. Audiências",
  monitoramento_fila: "Monitoramento",
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: "#ef4444",
  high: "#f59e0b",
  medium: "#3b82f6",
  low: "#6b7280",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "#6b7280",
  in_progress: "#3b82f6",
  review: "#f59e0b",
  approved: "#22c55e",
  completed: "#14b8a6",
  rejected: "#ef4444",
  cancelled: "#9ca3af",
};

const CATEGORY_COLORS = ["#8b5cf6", "#6366f1", "#f59e0b", "#06b6d4", "#14b8a6", "#f97316"];

interface TaskRow {
  task_category: string;
  priority: string;
  status: string;
}

export default function Dashboard() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTasks = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("agent_tasks")
      .select("task_category, priority, status")
      .eq("user_id", user.id);
    if (data) setTasks(data);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  // Realtime
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel("dashboard_realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "agent_tasks", filter: `user_id=eq.${user.id}` }, () => fetchTasks())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, fetchTasks]);

  const byCategory = Object.entries(CATEGORY_LABELS).map(([key, label]) => ({
    name: label,
    count: tasks.filter(t => t.task_category === key).length,
  }));

  const byPriority = (["critical", "high", "medium", "low"] as const).map(p => ({
    name: p === "critical" ? "Crítico" : p === "high" ? "Alta" : p === "medium" ? "Média" : "Baixa",
    count: tasks.filter(t => t.priority === p).length,
    fill: PRIORITY_COLORS[p],
  }));

  const byStatus = Object.entries(STATUS_COLORS)
    .map(([key, color]) => ({
      name: key === "pending" ? "Pendente" : key === "in_progress" ? "Em andamento" : key === "review" ? "Revisão" : key === "approved" ? "Aprovado" : key === "completed" ? "Concluído" : key === "rejected" ? "Rejeitado" : "Cancelado",
      count: tasks.filter(t => t.status === key).length,
      fill: color,
    }))
    .filter(s => s.count > 0);

  const cardStyle: React.CSSProperties = {
    background: "var(--bg3, #13131f)",
    border: "1px solid var(--border, #1e1e2e)",
    borderRadius: 12,
    padding: 20,
  };

  const titleStyle: React.CSSProperties = {
    fontSize: 13, fontWeight: 600, color: "var(--gold, #c9a84c)",
    marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.08em",
  };

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "var(--bg1, #09090f)", color: "var(--gold, #c9a84c)" }}>
        Carregando dashboard...
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg1, #09090f)", padding: "24px 32px" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--gold, #c9a84c)", margin: 0 }}>
          📊 Dashboard de Tarefas
        </h1>
        <p style={{ fontSize: 12, color: "var(--text3, #888)", marginTop: 4 }}>
          Visão geral das tarefas em tempo real · {tasks.length} tarefas total
        </p>
      </div>

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Total", value: tasks.length, color: "#c9a84c" },
          { label: "Críticas", value: tasks.filter(t => t.priority === "critical").length, color: "#ef4444" },
          { label: "Em andamento", value: tasks.filter(t => t.status === "in_progress").length, color: "#3b82f6" },
          { label: "Concluídas", value: tasks.filter(t => t.status === "completed").length, color: "#14b8a6" },
        ].map(kpi => (
          <div key={kpi.label} style={{
            ...cardStyle, padding: "16px 20px", display: "flex", flexDirection: "column", alignItems: "center",
          }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: kpi.color, fontFamily: "var(--font-mono, monospace)" }}>
              {kpi.value}
            </div>
            <div style={{ fontSize: 10, color: "var(--text3, #888)", textTransform: "uppercase", letterSpacing: "0.1em", marginTop: 4 }}>
              {kpi.label}
            </div>
          </div>
        ))}
      </div>

      {/* Charts Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* By Category - Bar Chart */}
        <div style={cardStyle}>
          <div style={titleStyle}>Por Categoria</div>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={byCategory} margin={{ left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border, #1e1e2e)" />
              <XAxis dataKey="name" tick={{ fontSize: 9, fill: "var(--text3, #888)" }} angle={-20} textAnchor="end" height={60} />
              <YAxis tick={{ fontSize: 10, fill: "var(--text3, #888)" }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: "var(--bg2, #0f0f1a)", border: "1px solid var(--border, #1e1e2e)", borderRadius: 8, fontSize: 11 }}
                labelStyle={{ color: "var(--gold, #c9a84c)" }}
              />
              <Bar dataKey="count" name="Tarefas" radius={[4, 4, 0, 0]}>
                {byCategory.map((_, i) => (
                  <Cell key={i} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* By Priority - Pie Chart */}
        <div style={cardStyle}>
          <div style={titleStyle}>Por Prioridade</div>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={byPriority} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, count }) => count > 0 ? `${name}: ${count}` : ""}>
                {byPriority.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ background: "var(--bg2, #0f0f1a)", border: "1px solid var(--border, #1e1e2e)", borderRadius: 8, fontSize: 11 }} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* By Status - Bar Chart */}
        <div style={{ ...cardStyle, gridColumn: "1 / -1" }}>
          <div style={titleStyle}>Por Status</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={byStatus} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border, #1e1e2e)" />
              <XAxis type="number" tick={{ fontSize: 10, fill: "var(--text3, #888)" }} allowDecimals={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "var(--text3, #888)" }} width={100} />
              <Tooltip contentStyle={{ background: "var(--bg2, #0f0f1a)", border: "1px solid var(--border, #1e1e2e)", borderRadius: 8, fontSize: 11 }} />
              <Bar dataKey="count" name="Tarefas" radius={[0, 4, 4, 0]}>
                {byStatus.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
