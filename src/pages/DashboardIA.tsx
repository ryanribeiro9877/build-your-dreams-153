import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area,
} from "recharts";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { HexagonLoader } from "@/components/HexagonLoader";
import { useIaMetrics } from "@/hooks/useIaMetrics";

// ── Rótulos e cores (mesma paleta do Dashboard de Tarefas) ────────────────────
const INTENT_LABELS: Record<string, string> = {
  ACAO_COM_TOOL: "Ação c/ ferramenta",
  NEGOCIO_COM_INSUMO: "Negócio c/ insumo",
  NEGOCIO_SEM_INSUMO: "Negócio s/ insumo",
  TRIVIAL: "Trivial",
  _none: "Sem classificação",
};
const INTENT_COLORS = ["#8b5cf6", "#6366f1", "#06b6d4", "#14b8a6", "#6b7280"];

const TURN_LABELS: Record<string, string> = { user: "Humano", assistant: "IA", system: "Sistema" };
const TURN_COLORS: Record<string, string> = { user: "#22c55e", assistant: "#c9a84c", system: "#6366f1" };

const STATUS_LABELS: Record<string, string> = { done: "Sucesso", failed: "Falha" };
const STATUS_COLORS: Record<string, string> = { done: "#22c55e", failed: "#ef4444" };

const LATENCY_ORDER = ["<5s", "5-15s", "15-60s", "1-5min", ">5min"];
const MODEL_COLORS = ["#c9a84c", "#8b5cf6", "#06b6d4", "#f59e0b", "#14b8a6", "#ef4444", "#6366f1"];

// ── Formatação (pt-BR) ────────────────────────────────────────────────────────
const fmtInt = (n: number) => (n ?? 0).toLocaleString("pt-BR");
const fmtTokens = (n: number) => {
  if (n >= 1e6) return (n / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + " M";
  if (n >= 1e3) return (n / 1e3).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " k";
  return String(n ?? 0);
};
const fmtMs = (ms: number) => {
  if (ms >= 60000) return (ms / 60000).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " min";
  if (ms >= 1000) return (ms / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " s";
  return (ms ?? 0) + " ms";
};
// "anthropic/claude-4.6-sonnet-20260217" → "claude-4.6-sonnet"
const shortModel = (m: string) =>
  m.replace(/^[^/]+\//, "").replace(/[-_](20[0-9]{6}|20[0-9]{2}-[0-9]{2}-[0-9]{2})$/, "");

// ── Estilos (idênticos ao Dashboard.tsx) ──────────────────────────────────────
const cardStyle: React.CSSProperties = {
  background: "var(--bg3, #13131f)", border: "1px solid var(--border, #1e1e2e)", borderRadius: 12, padding: 20,
};
const titleStyle: React.CSSProperties = {
  fontSize: 13, fontWeight: 600, color: "var(--gold, #c9a84c)", marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.08em",
};
const tooltipStyle = { background: "var(--bg2, #0f0f1a)", border: "1px solid var(--border, #1e1e2e)", borderRadius: 8, fontSize: 11, color: "#e5e7eb" };

export default function DashboardIA() {
  const navigate = useNavigate();
  const { data, loading, error } = useIaMetrics();

  const volumeData = useMemo(
    () =>
      (data?.volume_daily ?? []).map((d) => ({
        ...d,
        label: format(parseISO(d.date), "dd/MM", { locale: ptBR }),
      })),
    [data],
  );

  const statusData = useMemo(
    () => (data?.run_status ?? []).map((s) => ({ name: STATUS_LABELS[s.key] ?? s.key, value: s.n, fill: STATUS_COLORS[s.key] ?? "#6b7280" })),
    [data],
  );

  const intentData = useMemo(
    () => (data?.intents ?? []).map((i, idx) => ({ name: INTENT_LABELS[i.key] ?? i.key, count: i.n, fill: INTENT_COLORS[idx % INTENT_COLORS.length] })),
    [data],
  );

  const turnData = useMemo(() => {
    const order = ["user", "assistant", "system"];
    return order
      .map((k) => data?.turns.find((t) => t.key === k))
      .filter((t): t is { key: string; n: number } => !!t)
      .map((t) => ({ name: TURN_LABELS[t.key] ?? t.key, count: t.n, fill: TURN_COLORS[t.key] ?? "#6b7280" }));
  }, [data]);

  const modelData = useMemo(
    () => (data?.by_model ?? []).map((m, idx) => ({
      name: shortModel(m.model), messages: m.messages,
      tokIn: m.tokens_in, tokOut: m.tokens_out, fill: MODEL_COLORS[idx % MODEL_COLORS.length],
    })),
    [data],
  );

  const latencyData = useMemo(
    () => LATENCY_ORDER
      .map((k) => ({ name: k, count: data?.latency_buckets.find((b) => b.key === k)?.n ?? 0 }))
      .filter((b) => b.count > 0),
    [data],
  );

  if (loading) {
    return <HexagonLoader variant="fullscreen" label="Carregando métricas de IA..." />;
  }

  if (error === "acesso_negado" || !data) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg1, #09090f)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 24, textAlign: "center" }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: "var(--gold, #c9a84c)" }}>Dashboard IA</h1>
        <p style={{ opacity: 0.7, maxWidth: 420, color: "var(--text3, #888)" }}>
          {error === "acesso_negado"
            ? "Este painel é restrito a Tecnologia e Sócio."
            : "Não foi possível carregar as métricas agora. Tente recarregar a página."}
        </p>
        <button onClick={() => navigate("/sistema")} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid var(--border, #1e1e2e)", background: "transparent", color: "var(--gold, #c9a84c)", cursor: "pointer", fontSize: 12 }}>← Voltar</button>
      </div>
    );
  }

  const k = data.kpis;
  const janela = `${format(parseISO(data.window.first), "dd/MM", { locale: ptBR })} – ${format(parseISO(data.window.last), "dd/MM", { locale: ptBR })}`;

  const kpis: { label: string; value: string; color: string }[] = [
    { label: "Taxa de sucesso", value: `${k.success_rate}%`, color: "#22c55e" },
    { label: "Total de runs", value: fmtInt(k.total_runs), color: "#c9a84c" },
    { label: "Falhas", value: fmtInt(k.failed_runs), color: "#ef4444" },
    { label: "Sessões", value: fmtInt(k.sessions), color: "#8b5cf6" },
    { label: "Mensagens", value: fmtInt(k.messages_total), color: "#06b6d4" },
    { label: "Latência típica", value: fmtMs(k.run_latency_p50_ms), color: "#f59e0b" },
    { label: "Tokens (in+out)", value: fmtTokens(k.tokens_input + k.tokens_output), color: "#14b8a6" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg1, #09090f)", padding: "24px 32px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--gold, #c9a84c)", margin: 0 }}>
            Dashboard IA · Performance do Agente
          </h1>
          <p style={{ fontSize: 12, color: "var(--text3, #888)", marginTop: 4 }}>
            Uso orgânico · janela {janela} · {fmtInt(k.total_runs)} runs de orquestração
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
            <div style={{ fontSize: 26, fontWeight: 700, color: kpi.color, fontFamily: "var(--font-mono, monospace)" }}>{kpi.value}</div>
            <div style={{ fontSize: 10, color: "var(--text3, #888)", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 4, textAlign: "center" }}>{kpi.label}</div>
          </div>
        ))}
      </div>

      {/* Volume temporal - full width */}
      <div style={{ ...cardStyle, marginBottom: 16 }}>
        <div style={titleStyle}>Volume de atividade no tempo — runs & respostas da IA</div>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={volumeData}>
            <defs>
              <linearGradient id="iaGoldGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#c9a84c" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#c9a84c" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="iaGreenGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#22c55e" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border, #1e1e2e)" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--text3, #888)" }} interval="preserveStartEnd" minTickGap={20} />
            <YAxis tick={{ fontSize: 10, fill: "var(--text3, #888)" }} allowDecimals={false} />
            <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: "#e5e7eb" }} labelStyle={{ color: "#c9a84c" }} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            <Area type="monotone" dataKey="runs" name="Runs" stroke="#c9a84c" fillOpacity={1} fill="url(#iaGoldGrad)" strokeWidth={2} dot={false} />
            <Area type="monotone" dataKey="human" name="Turnos humanos" stroke="#22c55e" fillOpacity={1} fill="url(#iaGreenGrad)" strokeWidth={1.5} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Row: Sucesso × Falha  |  Latência */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <div style={cardStyle}>
          <div style={titleStyle}>Confiabilidade — sucesso × falha</div>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={2} label={({ name, value }) => `${name}: ${value}`}>
                {statusData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: "#e5e7eb" }} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div style={cardStyle}>
          <div style={titleStyle}>Latência dos runs (mediana {fmtMs(k.run_latency_p50_ms)})</div>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={latencyData} margin={{ left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border, #1e1e2e)" />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: "var(--text3, #888)" }} />
              <YAxis tick={{ fontSize: 10, fill: "var(--text3, #888)" }} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: "#e5e7eb" }} labelStyle={{ color: "#c9a84c" }} cursor={{ fill: "rgba(201,168,76,0.08)" }} />
              <Bar dataKey="count" name="Runs" radius={[4, 4, 0, 0]} fill="#f59e0b" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Row: Intents  |  Turnos Humano × IA */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <div style={cardStyle}>
          <div style={titleStyle}>Classificação de intenção (runs)</div>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={intentData} layout="vertical" margin={{ left: 30 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border, #1e1e2e)" />
              <XAxis type="number" tick={{ fontSize: 10, fill: "var(--text3, #888)" }} allowDecimals={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: "var(--text3, #888)" }} width={110} />
              <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: "#e5e7eb" }} cursor={{ fill: "rgba(201,168,76,0.08)" }} />
              <Bar dataKey="count" name="Runs" radius={[0, 4, 4, 0]}>
                {intentData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div style={cardStyle}>
          <div style={titleStyle}>Turnos — humano × IA × sistema</div>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={turnData} margin={{ left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border, #1e1e2e)" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--text3, #888)" }} />
              <YAxis tick={{ fontSize: 10, fill: "var(--text3, #888)" }} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: "#e5e7eb" }} cursor={{ fill: "rgba(201,168,76,0.08)" }} />
              <Bar dataKey="count" name="Mensagens" radius={[4, 4, 0, 0]}>
                {turnData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Row: Uso por modelo  |  Tokens por modelo */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <div style={cardStyle}>
          <div style={titleStyle}>Uso por modelo (respostas da IA)</div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={modelData} layout="vertical" margin={{ left: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border, #1e1e2e)" />
              <XAxis type="number" tick={{ fontSize: 10, fill: "var(--text3, #888)" }} allowDecimals={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: "var(--text3, #888)" }} width={130} />
              <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: "#e5e7eb" }} cursor={{ fill: "rgba(201,168,76,0.08)" }} />
              <Bar dataKey="messages" name="Mensagens" radius={[0, 4, 4, 0]}>
                {modelData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div style={cardStyle}>
          <div style={titleStyle}>Tokens processados por modelo</div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={modelData} layout="vertical" margin={{ left: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border, #1e1e2e)" />
              <XAxis type="number" tick={{ fontSize: 10, fill: "var(--text3, #888)" }} tickFormatter={(v) => fmtTokens(Number(v))} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: "var(--text3, #888)" }} width={130} />
              <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: "#e5e7eb" }} formatter={(v) => fmtTokens(Number(v))} cursor={{ fill: "rgba(201,168,76,0.08)" }} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="tokIn" name="Entrada" stackId="tok" fill="#6366f1" radius={[0, 0, 0, 0]} />
              <Bar dataKey="tokOut" name="Saída" stackId="tok" fill="#c9a84c" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Nota metodológica — honestidade sobre o que é e o que não é medível */}
      <div style={{ ...cardStyle, background: "var(--bg2, #0f0f1a)" }}>
        <div style={{ fontSize: 11, color: "var(--text3, #888)", lineHeight: 1.6 }}>
          <strong style={{ color: "var(--gold, #c9a84c)" }}>Metodologia.</strong> Dados de uso orgânico do agente na janela {janela}.
          {" "}<strong>Latência</strong> = duração de run (<code>orchestration_runs</code>), reportada pela <strong>mediana</strong> (p50) por ser robusta à cauda longa de runs deixados abertos.
          {" "}<strong>Custo em USD não é exibido</strong> por não estar instrumentado no banco (<code>cost_usd</code> vazio e <code>model_pricing</code> não casa com os modelos usados); em seu lugar, mostramos <strong>tokens reais</strong>.
        </div>
      </div>
    </div>
  );
}
