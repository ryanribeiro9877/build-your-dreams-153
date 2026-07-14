import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { HexagonLoader } from "@/components/HexagonLoader";
import { useDashboardRpc } from "@/hooks/useDashboardRpc";
import {
  DASH_BG, cardStyle, titleStyle, tooltipStyle, PALETTE, fmtInt, labelOf,
  DashboardHeader, KpiGrid, ChartCard, EmptyState, ScaffoldBanner,
} from "@/components/dashboard/dashboardKit";

interface ProximaAudiencia {
  when: string; client: string | null; tipo: string | null; advogado: string | null; status: string;
}
interface PrazosMetrics {
  kpis: { prazos_vencidos: number; prazos_7d: number; prazos_30d: number; audiencias_futuras: number; proc_hearings: number; cards_criticos: number };
  deadline_buckets: { key: string; n: number }[];
  audiencias_by_status: { key: string; n: number }[];
  criticidade_by_estado: { key: string; n: number }[];
  proximas_audiencias: ProximaAudiencia[];
}

const BUCKET_COLORS: Record<string, string> = {
  "Vencido": "#ef4444", "Até 3 dias": "#f59e0b", "Até 7 dias": "#eab308", "Até 30 dias": "#3b82f6", "> 30 dias": "#6b7280",
};
const AUDIENCIA_STATUS_LABELS: Record<string, string> = {
  marcada: "Marcada", confirmada: "Confirmada", realizada: "Realizada", redesignada: "Redesignada", cancelada: "Cancelada",
};

export default function DashboardPrazos() {
  const navigate = useNavigate();
  const { data, loading, error } = useDashboardRpc<PrazosMetrics>("dashboard_prazos_metrics");

  const deadlineData = useMemo(
    () => (data?.deadline_buckets ?? []).map((b) => ({ name: b.key, count: b.n, fill: BUCKET_COLORS[b.key] ?? "#6b7280" })),
    [data],
  );
  const audienciaStatus = useMemo(
    () => (data?.audiencias_by_status ?? []).map((s, i) => ({ name: labelOf(AUDIENCIA_STATUS_LABELS, s.key), value: s.n, fill: PALETTE[i % PALETTE.length] })),
    [data],
  );
  const criticidade = useMemo(
    () => (data?.criticidade_by_estado ?? []).map((s) => ({ name: s.key === "_none" ? "Sem estado" : s.key, count: s.n })),
    [data],
  );

  if (loading) return <HexagonLoader variant="fullscreen" label="Carregando prazos e audiências..." />;

  if (error === "acesso_negado" || !data) {
    return (
      <div style={{ minHeight: "100vh", background: DASH_BG, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 24, textAlign: "center" }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: "var(--gold, #c9a84c)" }}>Prazos & Audiências</h1>
        <p style={{ opacity: 0.7, maxWidth: 420, color: "var(--text3, #888)" }}>
          {error === "acesso_negado" ? "Este painel é restrito a Tecnologia e Sócio." : "Não foi possível carregar as métricas agora. Tente recarregar."}
        </p>
        <button onClick={() => navigate("/sistema")} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid var(--border, #1e1e2e)", background: "transparent", color: "var(--gold, #c9a84c)", cursor: "pointer", fontSize: 12 }}>← Voltar</button>
      </div>
    );
  }

  const k = data.kpis;
  const proximas = data.proximas_audiencias ?? [];
  const semAudiencias = k.audiencias_futuras === 0 && k.proc_hearings === 0;

  const kpis = [
    { label: "Prazos vencidos", value: fmtInt(k.prazos_vencidos), color: "#ef4444" },
    { label: "Vencem em 7 dias", value: fmtInt(k.prazos_7d), color: "#f59e0b" },
    { label: "Vencem em 30 dias", value: fmtInt(k.prazos_30d), color: "#eab308" },
    { label: "Audiências futuras", value: fmtInt(k.audiencias_futuras), color: "#8b5cf6" },
    { label: "Audiências (processo)", value: fmtInt(k.proc_hearings), color: "#06b6d4" },
    { label: "Cards críticos", value: fmtInt(k.cards_criticos), color: "#ef4444" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: DASH_BG, padding: "24px 32px" }}>
      <DashboardHeader
        title="Prazos & Audiências"
        subtitle={`${fmtInt(k.prazos_vencidos)} vencidos · ${fmtInt(k.prazos_7d)} em 7 dias · ${fmtInt(k.audiencias_futuras)} audiências futuras`}
      />

      {semAudiencias && (
        <ScaffoldBanner text="Módulo de audiências ainda sem registros e processos sem data de audiência. O painel acende conforme audiências (8.3), prazos fatais e criticidade de kanban (7.3) entrarem em uso." />
      )}

      <KpiGrid items={kpis} />

      {/* Prazos por faixa - full */}
      <ChartCard title="Prazos por faixa de vencimento (tarefas ativas)" empty={deadlineData.length === 0} hint="Sem tarefas com prazo. Acende quando tarefas ganharem data fatal / deadline." height={240} full>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={deadlineData} margin={{ left: -10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border, #1e1e2e)" />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--text3, #888)" }} />
            <YAxis tick={{ fontSize: 10, fill: "var(--text3, #888)" }} allowDecimals={false} />
            <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: "#e5e7eb" }} cursor={{ fill: "rgba(201,168,76,0.08)" }} />
            <Bar dataKey="count" name="Tarefas" radius={[4, 4, 0, 0]}>
              {deadlineData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <div style={{ height: 16 }} />

      {/* Row: Audiências por status | Criticidade kanban */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <ChartCard title="Audiências por status" empty={audienciaStatus.length === 0} hint="Sem audiências registradas (módulo 8.3). Acende quando a primeira for agendada.">
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={audienciaStatus} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={85} label={({ name, value }) => `${name}: ${value}`}>
                {audienciaStatus.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: "#e5e7eb" }} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Criticidade no Kanban por estado" empty={criticidade.length === 0} hint="Sem cards com criticidade (7.3). Acende conforme cards entrarem em colunas com prazo.">
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={criticidade} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border, #1e1e2e)" />
              <XAxis type="number" tick={{ fontSize: 10, fill: "var(--text3, #888)" }} allowDecimals={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: "var(--text3, #888)" }} width={100} />
              <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: "#e5e7eb" }} cursor={{ fill: "rgba(201,168,76,0.08)" }} />
              <Bar dataKey="count" name="Cards" radius={[0, 4, 4, 0]}>
                {criticidade.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Próximas audiências - lista */}
      <div style={cardStyle}>
        <div style={titleStyle}>Próximas audiências</div>
        {proximas.length === 0 ? (
          <EmptyState hint="Nenhuma audiência futura agendada. A lista se preenche automaticamente quando houver audiências marcadas ou confirmadas." height={160} />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {proximas.map((a, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 14px", background: "var(--bg2, #0f0f1a)", border: "1px solid var(--border, #1e1e2e)", borderRadius: 8 }}>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text1, #eee)" }}>{a.client ?? "—"}</span>
                  <span style={{ fontSize: 10, color: "var(--text3, #888)" }}>{a.tipo ?? "Audiência"}{a.advogado ? ` · ${a.advogado}` : ""}</span>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 12, color: "var(--gold, #c9a84c)", fontFamily: "var(--font-mono, monospace)" }}>
                    {format(parseISO(a.when), "dd/MM 'às' HH:mm", { locale: ptBR })}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--text3, #888)" }}>{labelOf(AUDIENCIA_STATUS_LABELS, a.status)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
