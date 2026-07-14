import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area,
} from "recharts";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { HexagonLoader } from "@/components/HexagonLoader";
import { useDashboardRpc } from "@/hooks/useDashboardRpc";
import {
  DASH_BG, tooltipStyle, PALETTE, fmtInt, labelOf,
  DashboardHeader, KpiGrid, ChartCard, ScaffoldBanner,
} from "@/components/dashboard/dashboardKit";

interface OperacionalMetrics {
  kpis: { clients_total: number; processes_total: number; docs_total: number; tasks_total: number; tasks_active: number; pendencias_open: number };
  clients_by_origin: { key: string; n: number }[];
  clients_by_status: { key: string; n: number }[];
  docs_by_type: { key: string; n: number }[];
  tasks_by_status: { key: string; n: number }[];
  tasks_by_priority: { key: string; n: number }[];
  processes_by_status: { key: string; n: number }[];
  new_clients_daily: { date: string; n: number }[];
}

const TASK_STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho", assigned: "Atribuída", in_progress: "Em execução", awaiting_external: "Aguard. externo",
  awaiting_validation: "Aguard. validação", blocked: "Bloqueada", completed: "Concluída", cancelled: "Cancelada",
};
const PRIORITY_LABELS: Record<string, string> = { critical: "Crítica", high: "Alta", medium: "Média", low: "Baixa" };
const PRIORITY_COLORS: Record<string, string> = { critical: "#ef4444", high: "#f59e0b", medium: "#3b82f6", low: "#6b7280" };
const ORIGIN_LABELS: Record<string, string> = { mock: "Mock", indicacao: "Indicação", marketing: "Marketing", organico: "Orgânico", _none: "Sem origem" };
const DOC_TYPE_LABELS: Record<string, string> = {
  procuracao: "Procuração", contrato_honorarios: "Contrato", termo_cooperado: "Termo cooperado",
  declaracao_hipossuficiencia: "Decl. hipossuf.", rg: "RG", cpf: "CPF", comprovante: "Comprovante",
  comprovante_residencia: "Comp. residência", minuta: "Minuta", peticao_inicial: "Petição inicial",
};

export default function DashboardOperacional() {
  const navigate = useNavigate();
  const { data, loading, error } = useDashboardRpc<OperacionalMetrics>("dashboard_operacional_metrics");

  const tasksStatus = useMemo(
    () => (data?.tasks_by_status ?? []).map((s) => ({ name: labelOf(TASK_STATUS_LABELS, s.key), count: s.n })),
    [data],
  );
  const tasksPriority = useMemo(
    () => (data?.tasks_by_priority ?? []).map((s) => ({ name: labelOf(PRIORITY_LABELS, s.key), value: s.n, fill: PRIORITY_COLORS[s.key] ?? "#6b7280" })),
    [data],
  );
  const clientsOrigin = useMemo(
    () => (data?.clients_by_origin ?? []).map((s, i) => ({ name: labelOf(ORIGIN_LABELS, s.key), value: s.n, fill: PALETTE[i % PALETTE.length] })),
    [data],
  );
  const docsType = useMemo(
    () => (data?.docs_by_type ?? []).map((s) => ({ name: labelOf(DOC_TYPE_LABELS, s.key), count: s.n })),
    [data],
  );
  const procStatus = useMemo(
    () => (data?.processes_by_status ?? []).map((s) => ({ name: s.key === "_none" ? "Sem status" : s.key, count: s.n })),
    [data],
  );
  const newClients = useMemo(
    () => (data?.new_clients_daily ?? []).map((d) => ({ ...d, label: format(parseISO(d.date), "dd/MM", { locale: ptBR }) })),
    [data],
  );
  const newClientsSum = useMemo(() => newClients.reduce((a, b) => a + b.n, 0), [newClients]);

  if (loading) return <HexagonLoader variant="fullscreen" label="Carregando painel operacional..." />;

  if (error === "acesso_negado" || !data) {
    return (
      <div style={{ minHeight: "100vh", background: DASH_BG, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 24, textAlign: "center" }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: "var(--gold, #c9a84c)" }}>Recepção & Jurídico</h1>
        <p style={{ opacity: 0.7, maxWidth: 420, color: "var(--text3, #888)" }}>
          {error === "acesso_negado" ? "Este painel é restrito a Tecnologia e Sócio." : "Não foi possível carregar as métricas agora. Tente recarregar."}
        </p>
        <button onClick={() => navigate("/sistema")} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid var(--border, #1e1e2e)", background: "transparent", color: "var(--gold, #c9a84c)", cursor: "pointer", fontSize: 12 }}>← Voltar</button>
      </div>
    );
  }

  const k = data.kpis;
  const semBaseReal = k.clients_total === 0 && k.processes_total === 0 && k.docs_total === 0;

  const kpis = [
    { label: "Clientes", value: fmtInt(k.clients_total), color: "#c9a84c" },
    { label: "Processos", value: fmtInt(k.processes_total), color: "#8b5cf6" },
    { label: "Documentos", value: fmtInt(k.docs_total), color: "#06b6d4" },
    { label: "Tarefas ativas", value: fmtInt(k.tasks_active), color: "#22c55e" },
    { label: "Pendências", value: fmtInt(k.pendencias_open), color: "#f59e0b" },
    { label: "Tarefas (total)", value: fmtInt(k.tasks_total), color: "#6366f1" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: DASH_BG, padding: "24px 32px" }}>
      <DashboardHeader
        title="Recepção & Jurídico"
        subtitle={`Visão operacional · ${fmtInt(k.clients_total)} clientes · ${fmtInt(k.processes_total)} processos · ${fmtInt(k.tasks_active)} tarefas ativas`}
      />

      {semBaseReal && (
        <ScaffoldBanner text="Base de recepção/jurídico ainda sem cadastro real (limpa em 13/07). Os cartões acendem automaticamente conforme clientes, documentos e processos forem cadastrados." />
      )}

      <KpiGrid items={kpis} />

      {/* Novos clientes no tempo (30 dias) */}
      <ChartCard title="Novos clientes — últimos 30 dias" empty={newClientsSum === 0} hint="Sem cadastros no período. Acende quando entrar cliente novo." height={200} full>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={newClients}>
            <defs>
              <linearGradient id="opGold" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#c9a84c" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#c9a84c" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border, #1e1e2e)" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--text3, #888)" }} interval="preserveStartEnd" minTickGap={20} />
            <YAxis tick={{ fontSize: 10, fill: "var(--text3, #888)" }} allowDecimals={false} />
            <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: "#e5e7eb" }} labelStyle={{ color: "#c9a84c" }} />
            <Area type="monotone" dataKey="n" name="Novos clientes" stroke="#c9a84c" fillOpacity={1} fill="url(#opGold)" strokeWidth={2} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      <div style={{ height: 16 }} />

      {/* Row: Tarefas por status | Tarefas por prioridade */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <ChartCard title="Tarefas por status" empty={tasksStatus.length === 0} hint="Sem tarefas ainda.">
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={tasksStatus} layout="vertical" margin={{ left: 30 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border, #1e1e2e)" />
              <XAxis type="number" tick={{ fontSize: 10, fill: "var(--text3, #888)" }} allowDecimals={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: "var(--text3, #888)" }} width={110} />
              <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: "#e5e7eb" }} cursor={{ fill: "rgba(201,168,76,0.08)" }} />
              <Bar dataKey="count" name="Tarefas" radius={[0, 4, 4, 0]}>
                {tasksStatus.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Tarefas por prioridade" empty={tasksPriority.length === 0} hint="Sem tarefas ainda.">
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={tasksPriority} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={85} label={({ name, value }) => `${name}: ${value}`}>
                {tasksPriority.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: "#e5e7eb" }} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Row: Clientes por origem | Documentos por tipo */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <ChartCard title="Clientes por origem" empty={clientsOrigin.length === 0} hint="Sem clientes cadastrados. Acende com o primeiro cadastro real.">
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={clientsOrigin} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={85} label={({ name, value }) => `${name}: ${value}`}>
                {clientsOrigin.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: "#e5e7eb" }} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Documentos por tipo" empty={docsType.length === 0} hint="Sem documentos. Acende quando anexarem/gerarem documentos.">
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={docsType} layout="vertical" margin={{ left: 30 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border, #1e1e2e)" />
              <XAxis type="number" tick={{ fontSize: 10, fill: "var(--text3, #888)" }} allowDecimals={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: "var(--text3, #888)" }} width={110} />
              <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: "#e5e7eb" }} cursor={{ fill: "rgba(201,168,76,0.08)" }} />
              <Bar dataKey="count" name="Documentos" radius={[0, 4, 4, 0]}>
                {docsType.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Processos por status - full */}
      <ChartCard title="Processos por status" empty={procStatus.length === 0} hint="Sem processos cadastrados. Acende quando a distribuição de casos (7.2) começar a criar processos." height={220} full>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={procStatus} margin={{ left: -10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border, #1e1e2e)" />
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: "var(--text3, #888)" }} />
            <YAxis tick={{ fontSize: 10, fill: "var(--text3, #888)" }} allowDecimals={false} />
            <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: "#e5e7eb" }} cursor={{ fill: "rgba(201,168,76,0.08)" }} />
            <Bar dataKey="count" name="Processos" radius={[4, 4, 0, 0]}>
              {procStatus.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}
