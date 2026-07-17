import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area,
} from "recharts";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { HexagonLoader } from "@/components/HexagonLoader";
import { useTarefasMetrics } from "@/hooks/useTarefasMetrics";

// Dashboard de Tarefas — lê user_tasks (RPC dashboard_tarefas_metrics), o modelo
// vivo do kanban. Antes lia a tabela morta agent_tasks (0 linhas) e ficava zerado.
// Números excluem dados de teste (is_test) por padrão.

const AREA_LABELS: Record<string, string> = {
  bancario: "Bancário", familia: "Família", plano_saude: "Plano de Saúde",
  consumidor: "Consumidor", civil: "Cível", previdenciario: "Previdenciário",
  tributario: "Tributário", _none: "Sem área",
};
const PRIORITY_LABELS: Record<string, string> = { critical: "Crítico", high: "Alta", medium: "Média", low: "Baixa" };
const PRIORITY_COLORS: Record<string, string> = { critical: "#ef4444", high: "#f59e0b", medium: "#3b82f6", low: "#6b7280" };
const STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho", assigned: "Atribuída", in_progress: "Em andamento",
  awaiting_external: "Aguard. externo", awaiting_validation: "Aguard. validação",
  blocked: "Bloqueada", completed: "Concluída", cancelled: "Cancelada",
};
const STATUS_COLORS: Record<string, string> = {
  draft: "#6b7280", assigned: "#6366f1", in_progress: "#3b82f6", awaiting_external: "#a855f7",
  awaiting_validation: "#f59e0b", blocked: "#ef4444", completed: "#14b8a6", cancelled: "#9ca3af",
};
const CATEGORY_COLORS = ["#8b5cf6", "#6366f1", "#f59e0b", "#06b6d4", "#14b8a6", "#f97316", "#ef4444"];

const cardStyle: React.CSSProperties = {
  background: "var(--bg3, #13131f)", border: "1px solid var(--border, #1e1e2e)", borderRadius: 12, padding: 20,
};
const titleStyle: React.CSSProperties = {
  fontSize: 13, fontWeight: 600, color: "var(--gold, #c9a84c)", marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.08em",
};
const tooltipStyle = { background: "var(--bg2, #0f0f1a)", border: "1px solid var(--border, #1e1e2e)", borderRadius: 8, fontSize: 11, color: "#e5e7eb" };

const fmtWhen = (iso?: string) => {
  if (!iso) return "";
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
};

export default function Dashboard() {
  const navigate = useNavigate();
  const { data, loading, error } = useTarefasMetrics();

  const trendData = useMemo(
    () => (data?.trend_daily ?? []).map((d) => ({
      label: format(parseISO(d.date), "dd/MM", { locale: ptBR }), count: d.n,
    })),
    [data],
  );
  const byCategory = useMemo(
    () => (data?.by_area ?? []).map((a) => ({ name: AREA_LABELS[a.key] ?? a.key, count: a.n })),
    [data],
  );
  const byPriority = useMemo(
    () => (["critical", "high", "medium", "low"] as const).map((p) => ({
      name: PRIORITY_LABELS[p], count: data?.by_priority.find((x) => x.key === p)?.n ?? 0, fill: PRIORITY_COLORS[p],
    })),
    [data],
  );
  const byStatus = useMemo(
    () => (data?.by_status ?? []).map((s) => ({
      name: STATUS_LABELS[s.key] ?? s.key, count: s.n, fill: STATUS_COLORS[s.key] ?? "#6b7280",
    })),
    [data],
  );

  if (loading) {
    return <HexagonLoader variant="fullscreen" label="Carregando dashboard..." />;
  }

  if (error === "acesso_negado" || !data) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg1, #09090f)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 24, textAlign: "center" }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: "var(--gold, #c9a84c)" }}>Dashboard de Tarefas</h1>
        <p style={{ opacity: 0.7, maxWidth: 420, color: "var(--text3, #888)" }}>
          {error === "acesso_negado" ? "Você não tem acesso a este painel." : "Não foi possível carregar as tarefas agora. Tente recarregar a página."}
        </p>
        <button onClick={() => navigate("/sistema")} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid var(--border, #1e1e2e)", background: "transparent", color: "var(--gold, #c9a84c)", cursor: "pointer", fontSize: 12 }}>← Voltar</button>
      </div>
    );
  }

  const k = data.kpis;
  const kpis = [
    { label: "Total", value: k.total, color: "#c9a84c" },
    { label: "Pendentes", value: k.pending, color: "#f59e0b" },
    { label: "Em andamento", value: k.in_progress, color: "#3b82f6" },
    { label: "Vencidas", value: k.overdue, color: k.overdue > 0 ? "#ef4444" : "#14b8a6" },
    { label: "Críticas", value: k.critical, color: k.critical > 0 ? "#ef4444" : "#14b8a6" },
    { label: "Concluídas", value: k.completed, color: "#14b8a6" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg1, #09090f)", padding: "24px 32px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--gold, #c9a84c)", margin: 0 }}>
            Dashboard de Tarefas
          </h1>
          <p style={{ fontSize: 12, color: "var(--text3, #888)", marginTop: 4 }}>
            {data.scope === "global" ? "Visão global" : "Suas tarefas"} · {k.total} tarefa{k.total === 1 ? "" : "s"} · atualizado {fmtWhen(data.generated_at)}
          </p>
        </div>
        <button className="btn-voltar" onClick={() => navigate("/sistema")} style={{
          padding: "8px 16px", borderRadius: 8, border: "1px solid var(--border, #1e1e2e)",
          background: "transparent", color: "var(--gold, #c9a84c)", cursor: "pointer",
          fontSize: 12, fontFamily: "'DM Sans', sans-serif",
        }}>← Voltar</button>
      </div>

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 24 }}>
        {kpis.map((kpi) => (
          <div key={kpi.label} style={{ ...cardStyle, padding: "16px 20px", display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: kpi.color, fontFamily: "var(--font-mono, monospace)" }}>{kpi.value}</div>
            <div style={{ fontSize: 10, color: "var(--text3, #888)", textTransform: "uppercase", letterSpacing: "0.1em", marginTop: 4 }}>{kpi.label}</div>
          </div>
        ))}
      </div>

      {data.scope === "pessoal" && (
        <div style={{ ...cardStyle, padding: "10px 16px", marginBottom: 16, fontSize: 12, color: "var(--text3, #888)", borderLeft: "3px solid #3b82f6" }}>
          Você está vendo as tarefas atribuídas a você. A visão global é exclusiva de gestão.
        </div>
      )}

      {k.total === 0 ? (
        <div style={{ ...cardStyle, textAlign: "center", color: "var(--text3, #888)", padding: "48px 20px" }}>
          Nenhuma tarefa {data.scope === "pessoal" ? "atribuída a você " : ""}na base ainda.
        </div>
      ) : (
        <>
          {/* Tendência - full width */}
          <div style={{ ...cardStyle, marginBottom: 16 }}>
            <div style={titleStyle}>Tendência — Tarefas Criadas (últimos 14 dias)</div>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={trendData}>
                <defs>
                  <linearGradient id="goldGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#c9a84c" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#c9a84c" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border, #1e1e2e)" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--text3, #888)" }} interval="preserveStartEnd" minTickGap={20} />
                <YAxis tick={{ fontSize: 10, fill: "var(--text3, #888)" }} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: "#e5e7eb" }} labelStyle={{ color: "#c9a84c" }} />
                <Area type="monotone" dataKey="count" name="Tarefas" stroke="#c9a84c" fillOpacity={1} fill="url(#goldGrad)" strokeWidth={2} dot={{ r: 3, fill: "#c9a84c" }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Charts Grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div style={cardStyle}>
              <div style={titleStyle}>Por Área</div>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={byCategory} margin={{ left: -10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border, #1e1e2e)" />
                  <XAxis dataKey="name" tick={{ fontSize: 9, fill: "var(--text3, #888)" }} angle={-20} textAnchor="end" height={60} />
                  <YAxis tick={{ fontSize: 10, fill: "var(--text3, #888)" }} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: "#e5e7eb" }} labelStyle={{ color: "#c9a84c" }} />
                  <Bar dataKey="count" name="Tarefas" radius={[4, 4, 0, 0]}>
                    {byCategory.map((_, i) => <Cell key={i} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div style={cardStyle}>
              <div style={titleStyle}>Por Prioridade</div>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={byPriority.filter((p) => p.count > 0)} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, count }) => `${name}: ${count}`}>
                    {byPriority.filter((p) => p.count > 0).map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: "#e5e7eb" }} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div style={{ ...cardStyle, gridColumn: "1 / -1" }}>
              <div style={titleStyle}>Por Status</div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={byStatus} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border, #1e1e2e)" />
                  <XAxis type="number" tick={{ fontSize: 10, fill: "var(--text3, #888)" }} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "var(--text3, #888)" }} width={110} />
                  <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: "#e5e7eb" }} />
                  <Bar dataKey="count" name="Tarefas" radius={[0, 4, 4, 0]}>
                    {byStatus.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
