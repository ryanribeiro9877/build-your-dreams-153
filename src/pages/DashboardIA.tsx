import { Fragment, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area,
} from "recharts";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { HexagonLoader } from "@/components/HexagonLoader";
import { useIaMetrics } from "@/hooks/useIaMetrics";
import { useIaUsageByUser } from "@/hooks/useIaUsageByUser";
import { useIaCost } from "@/hooks/useIaCost";
import { ProviderCreditsCard } from "@/components/ProviderCreditsCard";

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
// Custo em dólar. Abaixo de US$ 1 mostra mais casas (não zerar valores pequenos).
const fmtUsd = (n: number | null | undefined) => {
  const v = n ?? 0;
  const dec = v !== 0 && Math.abs(v) < 1 ? 4 : 2;
  return "US$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
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

// ── Tabela (uso por usuário / por modelo) ─────────────────────────────────────
const thStyle: React.CSSProperties = {
  textAlign: "left", padding: "9px 12px", fontSize: 10, fontWeight: 600,
  color: "var(--text3, #888)", textTransform: "uppercase", letterSpacing: "0.06em",
  borderBottom: "1px solid var(--border, #1e1e2e)", whiteSpace: "nowrap",
};
const tdStyle: React.CSSProperties = {
  padding: "10px 12px", fontSize: 12.5, color: "var(--text2, #cbd5e1)",
  borderBottom: "1px solid var(--border, #1e1e2e)", verticalAlign: "middle",
};
// Rótulos amigáveis de papel (role_templates.code); fallback ao próprio código.
const ROLE_LABELS: Record<string, string> = {
  tech: "Tecnologia", socio: "Sócio", lider_recepcao: "Líder Recepção",
  recepcionista: "Recepção", adv_previdenciario: "Adv. Previdenciário",
  adv_confeccao_geral: "Adv. Confecção", "(sem papel)": "—", "(sem nome)": "—",
};
const roleLabel = (c: string) => ROLE_LABELS[c] ?? c;
// Taxa de erro: >20% âmbar, >=40% vermelho (destaque do briefing).
const errColor = (e: number) => (e >= 40 ? "#ef4444" : e >= 20 ? "#f59e0b" : "var(--text2, #cbd5e1)");
// Amostra de erro por modelo confiável só com >= 20 runs mapeados.
const MIN_ERROR_SAMPLE = 20;

export default function DashboardIA() {
  const navigate = useNavigate();
  const { data, loading, error } = useIaMetrics();
  const { data: usage } = useIaUsageByUser();
  const { data: cost } = useIaCost();

  // Custo por modelo (barras) — só modelos com custo casado; sonnet deve dominar (~92%).
  const costModelData = useMemo(
    () => (cost?.by_model ?? [])
      .filter((m) => (m.cost_usd ?? 0) > 0)
      .map((m, idx) => ({
        name: shortModel(m.raw_model || m.model || "?"),
        cost: Number(m.cost_usd ?? 0),
        tokens: m.tokens,
        fill: MODEL_COLORS[idx % MODEL_COLORS.length],
      })),
    [cost],
  );

  // Custo por dia (operacional) + projeção mensal simples (média diária × dias do mês).
  const costDailyData = useMemo(
    () => (cost?.daily ?? []).map((d) => ({
      label: format(parseISO(d.date), "dd/MM", { locale: ptBR }),
      cost: Number(d.cost_usd ?? 0),
    })),
    [cost],
  );
  const costProjection = useMemo(() => {
    const days = cost?.daily ?? [];
    const withCost = days.filter((d) => (d.cost_usd ?? 0) > 0);
    const base = withCost.length > 0 ? withCost : days;
    if (base.length === 0) return null;
    const sum = base.reduce((a, d) => a + (d.cost_usd ?? 0), 0);
    const avgDaily = sum / base.length;
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    return { avgDaily, monthly: avgDaily * daysInMonth };
  }, [cost]);

  // Taxa de erro por usuário (cruzamento com o RPC de uso) — chave user_id → error_rate.
  const errorRateByUser = useMemo(() => {
    const map = new Map<string, number>();
    (usage?.users ?? []).forEach((u) => map.set(u.user_id, u.error_rate));
    return map;
  }, [usage]);

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

      {/* ══ Custo em USD por chamada de LLM (RPC dashboard_ia_cost) ══════════════ */}
      {cost && (
        <>
          {/* Aviso de piso: enquanto o custo vier do backfill (mensagem final), ele
              SUBCONTA as chamadas internas do run — some quando a instrumentação por
              chamada (source='orchestrator') dominar. */}
          {cost.notes.cost_is_lower_bound && (
            <div style={{ ...cardStyle, padding: "12px 16px", marginBottom: 16, display: "flex", gap: 10, alignItems: "flex-start", borderLeft: "3px solid #f59e0b" }}>
              <span style={{ fontSize: 15, lineHeight: 1.2 }} aria-hidden>⚠</span>
              <div style={{ fontSize: 12.5, color: "var(--text2, #cbd5e1)", lineHeight: 1.5 }}>
                Custo <strong>parcial</strong> (granularidade de mensagem final); sobe com a instrumentação por chamada. O total real tende a ser maior conforme as chamadas internas de cada run passam a ser contabilizadas.
              </div>
            </div>
          )}

          {/* KPIs de custo */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 16 }}>
            <div style={{ ...cardStyle, padding: "16px 20px", display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: "#22c55e", fontFamily: "var(--font-mono, monospace)" }}>{fmtUsd(cost.kpis.cost_real_usd)}</div>
              <div style={{ fontSize: 10, color: "var(--text3, #888)", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 4, textAlign: "center" }}>Custo total (operacional)</div>
              {cost.kpis.cost_test_usd > 0 && (
                <div style={{ fontSize: 10.5, color: "#EAB308", marginTop: 4 }}>+ {fmtUsd(cost.kpis.cost_test_usd)} teste do tech</div>
              )}
            </div>
            <div style={{ ...cardStyle, padding: "16px 20px", display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: "#c9a84c", fontFamily: "var(--font-mono, monospace)" }}>{fmtUsd(cost.kpis.blended_usd_per_mtok)}</div>
              <div style={{ fontSize: 10, color: "var(--text3, #888)", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 4, textAlign: "center" }}>Custo médio / Mtok (mix)</div>
            </div>
            <div style={{ ...cardStyle, padding: "16px 20px", display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: "#8b5cf6", fontFamily: "var(--font-mono, monospace)" }}>{fmtInt(cost.kpis.generations_real)}</div>
              <div style={{ fontSize: 10, color: "var(--text3, #888)", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 4, textAlign: "center" }}>Chamadas de LLM</div>
              {cost.kpis.unpriced > 0 && (
                <div style={{ fontSize: 10.5, color: "var(--text3, #888)", marginTop: 4 }}>{fmtInt(cost.kpis.unpriced)} sem preço casado</div>
              )}
            </div>
            <div style={{ ...cardStyle, padding: "16px 20px", display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: "#06b6d4", fontFamily: "var(--font-mono, monospace)" }}>{costProjection ? fmtUsd(costProjection.monthly) : "—"}</div>
              <div style={{ fontSize: 10, color: "var(--text3, #888)", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 4, textAlign: "center" }}>Projeção mensal</div>
              {costProjection && <div style={{ fontSize: 10.5, color: "var(--text3, #888)", marginTop: 4 }}>{fmtUsd(costProjection.avgDaily)}/dia</div>}
            </div>
          </div>

          {/* Row: Custo por modelo | Custo por dia */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
            <div style={cardStyle}>
              <div style={titleStyle}>Custo por modelo (USD)</div>
              {costModelData.length === 0 ? (
                <div style={{ fontSize: 12.5, color: "var(--text3, #888)", padding: "40px 0", textAlign: "center" }}>Sem custo casado na janela.</div>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={costModelData} layout="vertical" margin={{ left: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border, #1e1e2e)" />
                    <XAxis type="number" tick={{ fontSize: 10, fill: "var(--text3, #888)" }} tickFormatter={(v) => fmtUsd(Number(v))} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: "var(--text3, #888)" }} width={130} />
                    <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: "#e5e7eb" }} formatter={(v) => fmtUsd(Number(v))} cursor={{ fill: "rgba(201,168,76,0.08)" }} />
                    <Bar dataKey="cost" name="Custo" radius={[0, 4, 4, 0]}>
                      {costModelData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div style={cardStyle}>
              <div style={titleStyle}>Custo por dia (USD, operacional)</div>
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={costDailyData}>
                  <defs>
                    <linearGradient id="iaCostGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border, #1e1e2e)" />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--text3, #888)" }} interval="preserveStartEnd" minTickGap={20} />
                  <YAxis tick={{ fontSize: 10, fill: "var(--text3, #888)" }} tickFormatter={(v) => fmtUsd(Number(v))} width={70} />
                  <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: "#e5e7eb" }} labelStyle={{ color: "#c9a84c" }} formatter={(v) => fmtUsd(Number(v))} />
                  <Area type="monotone" dataKey="cost" name="Custo" stroke="#22c55e" fillOpacity={1} fill="url(#iaCostGrad)" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Custo por usuário (cruzado com a taxa de erro do RPC de uso) */}
          <div style={{ ...cardStyle, marginBottom: 16, overflowX: "auto" }}>
            <div style={titleStyle}>Custo por usuário (USD)</div>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
              <thead>
                <tr>
                  <th style={thStyle}>Usuário</th>
                  <th style={thStyle}>Papel</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Chamadas</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Tokens</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Taxa de erro</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Custo (USD)</th>
                </tr>
              </thead>
              <tbody>
                {cost.by_user.map((u) => {
                  const er = errorRateByUser.get(u.user_id);
                  return (
                    <tr key={u.user_id}>
                      <td style={{ ...tdStyle, color: "var(--text1, #e5e7eb)", fontWeight: 600 }}>{u.name}</td>
                      <td style={tdStyle}>{roleLabel(u.role === "-" ? "(sem papel)" : u.role)}</td>
                      <td style={{ ...tdStyle, textAlign: "right", fontFamily: "var(--font-mono, monospace)" }}>{fmtInt(u.generations)}</td>
                      <td style={{ ...tdStyle, textAlign: "right", fontFamily: "var(--font-mono, monospace)", color: "var(--text3, #888)" }}>{fmtTokens(u.tokens)}</td>
                      <td style={{ ...tdStyle, textAlign: "right", fontFamily: "var(--font-mono, monospace)", fontWeight: 700, color: er == null ? "var(--text3, #888)" : errColor(er) }}>
                        {er == null ? "—" : `${er}%`}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right", fontFamily: "var(--font-mono, monospace)", fontWeight: 700 }}>
                        {fmtUsd(u.cost_usd)}
                        {(u.cost_test_usd ?? 0) > 0 && <span style={{ color: "#EAB308", fontSize: 11, fontWeight: 400 }}> · +{fmtUsd(u.cost_test_usd)} teste</span>}
                      </td>
                    </tr>
                  );
                })}
                {cost.by_user.length === 0 && (
                  <tr><td style={{ ...tdStyle, textAlign: "center", color: "var(--text3, #888)" }} colSpan={6}>Sem custo registrado na janela.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ══ Créditos dos provedores (RPC dashboard_provider_credits) ══════════════ */}
      <ProviderCreditsCard />

      {/* ══ Uso & gasto por usuário e por modelo (RPC dashboard_ia_usage_by_user) ══ */}
      {usage && (
        <>
          {/* Recomendações (info/warn) — hoje inclui a concentração de tokens */}
          {usage.recommendations.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12, marginBottom: 16 }}>
              {usage.recommendations.map((r, i) => (
                <div key={i} style={{ ...cardStyle, padding: "12px 16px", display: "flex", gap: 10, alignItems: "flex-start", borderLeft: `3px solid ${r.level === "warn" ? "#ef4444" : "#6366f1"}` }}>
                  <span style={{ fontSize: 15, lineHeight: 1.2 }} aria-hidden>{r.level === "warn" ? "⚠" : "ℹ"}</span>
                  <div style={{ minWidth: 0 }}>
                    {r.model && <div style={{ fontSize: 11, color: "var(--gold, #c9a84c)", fontWeight: 700, marginBottom: 2 }}>{shortModel(r.model)}</div>}
                    <div style={{ fontSize: 12.5, color: "var(--text2, #cbd5e1)", lineHeight: 1.5 }}>{r.message}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Tabela por usuário */}
          <div style={{ ...cardStyle, marginBottom: 16, overflowX: "auto" }}>
            <div style={titleStyle}>Uso &amp; gasto por usuário</div>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
              <thead>
                <tr>
                  <th style={thStyle}>Usuário</th>
                  <th style={thStyle}>Papel</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Mensagens</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Runs</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Taxa de erro</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Tokens (in / out)</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Crédito gasto</th>
                </tr>
              </thead>
              <tbody>
                {usage.users.map((u) => {
                  const hasTest = u.tokens_test > 0 || u.runs_test > 0;
                  return (
                    <Fragment key={u.user_id}>
                      <tr style={hasTest ? { borderBottom: "none" } : undefined}>
                        <td style={{ ...tdStyle, color: "var(--text1, #e5e7eb)", fontWeight: 600, ...(hasTest ? { borderBottom: "none" } : {}) }}>{u.name}</td>
                        <td style={{ ...tdStyle, ...(hasTest ? { borderBottom: "none" } : {}) }}>{roleLabel(u.role)}</td>
                        <td style={{ ...tdStyle, textAlign: "right", fontFamily: "var(--font-mono, monospace)", ...(hasTest ? { borderBottom: "none" } : {}) }}>{fmtInt(u.messages)}</td>
                        <td style={{ ...tdStyle, textAlign: "right", fontFamily: "var(--font-mono, monospace)", ...(hasTest ? { borderBottom: "none" } : {}) }}>
                          {fmtInt(u.runs)}
                          {u.failed_runs > 0 && <span style={{ color: "#ef4444", fontSize: 11 }}> · {fmtInt(u.failed_runs)} falha{u.failed_runs > 1 ? "s" : ""}</span>}
                        </td>
                        <td style={{ ...tdStyle, textAlign: "right", fontFamily: "var(--font-mono, monospace)", fontWeight: 700, color: errColor(u.error_rate), ...(hasTest ? { borderBottom: "none" } : {}) }}>{u.error_rate}%</td>
                        <td style={{ ...tdStyle, textAlign: "right", fontFamily: "var(--font-mono, monospace)", ...(hasTest ? { borderBottom: "none" } : {}) }}>
                          {fmtTokens(u.tokens_total)}
                          <span style={{ color: "var(--text3, #888)", fontSize: 11 }}> ({fmtTokens(u.tokens_in)} / {fmtTokens(u.tokens_out)})</span>
                        </td>
                        <td style={{ ...tdStyle, textAlign: "right", fontFamily: "var(--font-mono, monospace)", ...(hasTest ? { borderBottom: "none" } : {}) }}>{fmtInt(u.token_consumption)}</td>
                      </tr>
                      {hasTest && (
                        <tr>
                          <td style={{ ...tdStyle, paddingTop: 0, paddingBottom: 8, color: "#EAB308", fontSize: 11 }} colSpan={7}>
                            🧪 dos quais, teste: {fmtTokens(u.tokens_test)} tokens · {fmtInt(u.runs_test)} run{u.runs_test === 1 ? "" : "s"} (não entram nos KPIs gerais)
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                {usage.users.length === 0 && (
                  <tr><td style={{ ...tdStyle, textAlign: "center", color: "var(--text3, #888)" }} colSpan={7}>Sem uso registrado na janela.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Tabela por modelo (LLM) */}
          <div style={{ ...cardStyle, marginBottom: 16, overflowX: "auto" }}>
            <div style={titleStyle}>Uso por modelo (LLM)</div>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
              <thead>
                <tr>
                  <th style={thStyle}>Modelo</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Mensagens</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Tokens (in / out)</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Total</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Taxa de erro (amostra)</th>
                </tr>
              </thead>
              <tbody>
                {usage.by_model.map((m, i) => {
                  const weak = m.mapped_runs < MIN_ERROR_SAMPLE;
                  return (
                    <tr key={i}>
                      <td style={{ ...tdStyle, color: "var(--text1, #e5e7eb)", fontWeight: 600 }}>{shortModel(m.model)}</td>
                      <td style={{ ...tdStyle, textAlign: "right", fontFamily: "var(--font-mono, monospace)" }}>{fmtInt(m.messages)}</td>
                      <td style={{ ...tdStyle, textAlign: "right", fontFamily: "var(--font-mono, monospace)", color: "var(--text3, #888)" }}>{fmtTokens(m.tokens_in)} / {fmtTokens(m.tokens_out)}</td>
                      <td style={{ ...tdStyle, textAlign: "right", fontFamily: "var(--font-mono, monospace)" }}>{fmtTokens(m.tokens_total)}</td>
                      <td style={{ ...tdStyle, textAlign: "right", fontFamily: "var(--font-mono, monospace)" }}>
                        {m.error_rate_sample == null ? (
                          <span style={{ color: "var(--text3, #888)" }}>—</span>
                        ) : weak ? (
                          // Amostra fraca (< 20 runs mapeados): não afirmar a taxa como robusta.
                          <span style={{ color: "var(--text3, #888)" }} title="Amostra insuficiente para afirmar a taxa">
                            {m.error_rate_sample}% · amostra fraca ({fmtInt(m.mapped_runs)} runs)
                          </span>
                        ) : (
                          <span style={{ color: errColor(m.error_rate_sample), fontWeight: 700 }}>
                            {m.error_rate_sample}% <span style={{ color: "var(--text3, #888)", fontWeight: 400, fontSize: 11 }}>· amostra {fmtInt(m.mapped_runs)} runs</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {usage.by_model.length === 0 && (
                  <tr><td style={{ ...tdStyle, textAlign: "center", color: "var(--text3, #888)" }} colSpan={5}>Sem modelos registrados na janela.</td></tr>
                )}
              </tbody>
            </table>
            <div style={{ fontSize: 11, color: "var(--text3, #888)", marginTop: 10, lineHeight: 1.5 }}>
              A taxa de erro por modelo é uma <strong>amostra</strong> (só runs cujo modelo foi mapeável): cobertura de {fmtInt(usage.notes.model_error_coverage_runs)} de {fmtInt(usage.notes.total_runs)} runs. Abaixo de {MIN_ERROR_SAMPLE} runs mapeados, a taxa aparece em cinza (amostra fraca).
            </div>
          </div>
        </>
      )}

      {/* Nota metodológica — honestidade sobre o que é e o que não é medível */}
      <div style={{ ...cardStyle, background: "var(--bg2, #0f0f1a)" }}>
        <div style={{ fontSize: 11, color: "var(--text3, #888)", lineHeight: 1.6 }}>
          <strong style={{ color: "var(--gold, #c9a84c)" }}>Metodologia.</strong> Dados de uso orgânico do agente na janela {janela}.
          {" "}<strong>Latência</strong> = duração de run (<code>orchestration_runs</code>), reportada pela <strong>mediana</strong> (p50) por ser robusta à cauda longa de runs deixados abertos.
          {" "}<strong>Custo em USD</strong> vem de <code>ai_generations</code> (1 linha por chamada de LLM; <code>cost_usd</code> calculado no insert via <code>resolve_model_price</code> + <code>model_pricing</code>). O custo operacional exclui as sessões de teste do tech (<code>is_tech_test</code>); modelos sem preço casado aparecem como "sem preço" (nunca chutamos um valor). Enquanto o aviso de custo parcial estiver visível, o total é um piso (backfill por mensagem final).
        </div>
      </div>
    </div>
  );
}
