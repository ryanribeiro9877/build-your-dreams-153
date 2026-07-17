import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area } from "recharts";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Brain, TrendingUp, Target, ClipboardList, Clock, AlertTriangle, Siren, X, ArrowLeft,
} from "lucide-react";
import { HexagonLoader } from "@/components/HexagonLoader";
import { useTarefasMetrics } from "@/hooks/useTarefasMetrics";

// Central de Eficiência — gargalos por departamento sobre user_tasks (RPC
// dashboard_tarefas_metrics). Antes lia agent_tasks + agent_orchestration_log
// (ambas mortas, 0 linhas) e ficava toda zerada. Os "Últimos Eventos de
// Orquestração" seguem vindo de orchestration_runs (fonte real). Números excluem
// dados de teste (is_test) por padrão.

// Rótulos de departamento (enum org_stage).
const DEPT_LABELS: Record<string, string> = {
  atendimento: "Atendimento", confeccao: "Confecção", revisao: "Revisão", protocolo: "Protocolo",
  audiencia: "Audiência", execucao: "Execução", execucao_sindicato: "Execução Sindicato",
  recursos: "Recursos", recursos_criticos: "Recursos Críticos", alvara: "Alvará",
  diligencia: "Diligência", acompanhamento: "Acompanhamento", financeiro: "Financeiro",
  recepcao: "Recepção", recepcao_supervisionada: "Recepção Superv.", admin_equipe: "Admin Equipe",
  captacao_cooperativa: "Captação Coop.", kanban_pendencias: "Pendências", gestao: "Gestão",
  todas: "Todas", _none: "Sem departamento",
};
const DEPT_COLORS = ["#3b82f6", "#8b5cf6", "#f59e0b", "#14b8a6", "#ef4444", "#6366f1", "#ec4899", "#10b981", "#f97316", "#0ea5e9"];
const PRIORITY_LABELS: Record<string, string> = { critical: "Crítico", high: "Alta", medium: "Média", low: "Baixa" };
const PRIORITY_COLORS: Record<string, string> = { critical: "#ef4444", high: "#f59e0b", medium: "#3b82f6", low: "#10b981" };

interface OrchRunRow {
  id: string;
  status?: string;
  original_message?: string | null;
  chain?: unknown;
  error?: string | null;
  created_at: string;
}

export default function EfficiencyKPIs() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data, loading, error } = useTarefasMetrics();
  const [orchRuns, setOrchRuns] = useState<OrchRunRow[]>([]);
  const [filterSeverity, setFilterSeverity] = useState("all");

  // Eventos REAIS de orquestração (orchestration_runs); a tabela agent_orchestration_log nunca recebe dados.
  const fetchRuns = useCallback(async () => {
    if (!user) return;
    const { data: runs } = await supabase
      .from("orchestration_runs")
      .select("id,status,original_message,chain,error,created_at")
      .eq("user_id", user.id).order("created_at", { ascending: false }).limit(20);
    setOrchRuns((runs as OrchRunRow[]) || []);
  }, [user]);

  useEffect(() => {
    fetchRuns();
    const channel = supabase.channel("efficiency_kpis")
      .on("postgres_changes", { event: "*", schema: "public", table: "orchestration_runs" }, () => fetchRuns())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchRuns]);

  const deptMetrics = useMemo(
    () => (data?.by_department ?? []).map((d, i) => ({
      dept: d.key, label: DEPT_LABELS[d.key] ?? d.key, color: DEPT_COLORS[i % DEPT_COLORS.length],
      total: d.total, pending: d.pending, overdue: d.overdue, critical: d.critical, bottleneckScore: d.score,
    })).sort((a, b) => b.bottleneckScore - a.bottleneckScore),
    [data],
  );

  const priorityData = useMemo(
    () => (data?.by_priority ?? []).map((p) => ({ name: PRIORITY_LABELS[p.key] ?? p.key, value: p.n, key: p.key })),
    [data],
  );

  const trendData = useMemo(
    () => (data?.trend_daily ?? []).map((d) => ({ date: format(parseISO(d.date), "dd/MM", { locale: ptBR }), count: d.n })),
    [data],
  );

  const visibleDepts = deptMetrics.filter((d) => {
    if (filterSeverity === "critical") return d.bottleneckScore > 50;
    if (filterSeverity === "warning") return d.bottleneckScore > 20 && d.bottleneckScore <= 50;
    if (filterSeverity === "ok") return d.bottleneckScore <= 20;
    return true;
  });

  if (loading) {
    return <HexagonLoader variant="fullscreen" label="Carregando métricas de eficiência..." />;
  }

  if (error === "acesso_negado" || !data) {
    return (
      <div style={{ minHeight: "100vh", background: "#09090f", color: "#e8e8ed", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 24, textAlign: "center" }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: "#ff6b6b" }}>Central de Eficiência</h1>
        <p style={{ opacity: 0.7, maxWidth: 420, color: "#888" }}>
          {error === "acesso_negado" ? "Você não tem acesso a este painel." : "Não foi possível carregar as métricas agora. Tente recarregar a página."}
        </p>
        <button onClick={() => navigate("/sistema")} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid rgba(201,168,76,0.2)", background: "rgba(201,168,76,0.1)", color: "#c9a84c", cursor: "pointer", fontSize: 12 }}>← Voltar</button>
      </div>
    );
  }

  const k = data.kpis;
  const bottlenecks = deptMetrics.filter((d) => d.bottleneckScore > 30).length;
  const fmtWhen = (iso: string) => new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

  const globalKpis = [
    { label: "Total Tarefas", value: k.total, color: "#c9a84c" },
    { label: "Pendentes", value: k.pending, color: "#f59e0b" },
    { label: "Em Andamento", value: k.in_progress, color: "#3b82f6" },
    { label: "Vencidas", value: k.overdue, color: k.overdue > 0 ? "#ef4444" : "#2dd4a0" },
    { label: "Críticas", value: k.critical, color: k.critical > 0 ? "#ef4444" : "#2dd4a0" },
    { label: "Concluídas", value: k.completed, color: "#2dd4a0" },
    { label: "Taxa Conclusão", value: `${k.completion_rate}%`, color: k.completion_rate > 60 ? "#2dd4a0" : "#f59e0b" },
    { label: "Gargalos Ativos", value: bottlenecks, color: bottlenecks > 3 ? "#ef4444" : "#f59e0b" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#09090f", color: "#e8e8ed", fontFamily: "'Roboto', sans-serif" }}>
      <header style={{
        display: "flex", alignItems: "center", gap: 16, padding: "16px 24px",
        borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.01)", flexWrap: "wrap",
      }}>
        <button onClick={() => navigate("/sistema")} style={{
          background: "rgba(201,168,76,0.1)", border: "1px solid rgba(201,168,76,0.2)",
          borderRadius: 8, padding: "6px 14px", color: "#c9a84c", cursor: "pointer", fontSize: 13, fontWeight: 500,
          display: "flex", alignItems: "center", gap: 6,
        }}><ArrowLeft size={14} /> Voltar ao Sistema</button>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#ff6b6b", margin: 0, display: "flex", alignItems: "center", gap: 10 }}>
            <Brain size={24} /> Central de Eficiência — KPIs de Tarefas
          </h1>
          <p style={{ fontSize: 12, color: "#888", margin: 0 }}>
            {data.scope === "global" ? "Visão global" : "Suas tarefas"} · gargalos por departamento · atualizado {fmtWhen(data.generated_at)}
          </p>
        </div>
      </header>

      <div style={{
        display: "flex", gap: 12, padding: "12px 24px", borderBottom: "1px solid rgba(255,255,255,0.04)",
        background: "rgba(255,255,255,0.01)", flexWrap: "wrap", alignItems: "center",
      }}>
        <span style={{ fontSize: 11, color: "#888", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>Filtro:</span>
        <select value={filterSeverity} onChange={(e) => setFilterSeverity(e.target.value)} style={{
          background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6,
          padding: "5px 10px", color: "#e8e8ed", fontSize: 12, cursor: "pointer",
        }}>
          <option value="all">Todas as Severidades</option>
          <option value="critical">Crítico (score {">"} 50)</option>
          <option value="warning">Atenção (score {">"} 20)</option>
          <option value="ok">OK (score ≤ 20)</option>
        </select>
        {filterSeverity !== "all" && (
          <button onClick={() => setFilterSeverity("all")} style={{
            background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 6,
            padding: "5px 10px", color: "#ff8080", fontSize: 11, cursor: "pointer",
            display: "flex", alignItems: "center", gap: 4,
          }}><X size={12} /> Limpar</button>
        )}
      </div>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 16px" }}>
        {k.total === 0 ? (
          <div style={{
            textAlign: "center", color: "#888", padding: "48px 20px",
            background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10,
          }}>
            Nenhuma tarefa {data.scope === "pessoal" ? "atribuída a você " : ""}na base ainda.
          </div>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12, marginBottom: 28 }}>
              {globalKpis.map((kpi) => (
                <div key={kpi.label} style={{
                  padding: "16px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
                  borderRadius: 10, borderLeft: `3px solid ${kpi.color}`,
                }}>
                  <div style={{ fontSize: 28, fontWeight: 700, color: kpi.color }}>{kpi.value}</div>
                  <div style={{ fontSize: 10, color: "#888", textTransform: "uppercase", letterSpacing: "0.08em" }}>{kpi.label}</div>
                </div>
              ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 20, marginBottom: 28 }}>
              <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#e8e8ed", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
                  <TrendingUp size={16} color="#ff6b6b" /> Tarefas Criadas (14 dias)
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={trendData}>
                    <defs>
                      <linearGradient id="effTrendGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ff6b6b" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#ff6b6b" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" tick={{ fill: "#888", fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={20} />
                    <YAxis tick={{ fill: "#888", fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }} />
                    <Area type="monotone" dataKey="count" stroke="#ff6b6b" fill="url(#effTrendGrad)" strokeWidth={2} name="Tarefas" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#e8e8ed", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
                  <Target size={16} color="#c9a84c" /> Distribuição por Prioridade
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={priorityData} cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={4} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                      {priorityData.map((entry) => <Cell key={entry.key} fill={PRIORITY_COLORS[entry.key] || "#888"} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#ff6b6b", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                <AlertTriangle size={16} /> Mapa de Gargalos por Departamento
              </div>
              {visibleDepts.length === 0 ? (
                <div style={{ fontSize: 12, color: "#888", padding: 20, textAlign: "center", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10 }}>
                  Nenhum departamento nesta faixa de severidade.
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
                  {visibleDepts.map((d) => (
                    <div key={d.dept} style={{
                      padding: 16, borderRadius: 10,
                      background: d.bottleneckScore > 50 ? "rgba(239,68,68,0.05)" : "rgba(255,255,255,0.02)",
                      border: `1px solid ${d.bottleneckScore > 50 ? "rgba(239,68,68,0.2)" : "rgba(255,255,255,0.06)"}`,
                      borderLeft: `3px solid ${d.color}`,
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "#e8e8ed" }}>{d.label}</div>
                          <div style={{ fontSize: 10, color: "#888" }}>{d.total} tarefa{d.total === 1 ? "" : "s"}</div>
                        </div>
                        <div style={{
                          fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 6,
                          background: d.bottleneckScore > 50 ? "rgba(239,68,68,0.2)" : d.bottleneckScore > 20 ? "rgba(245,158,11,0.2)" : "rgba(45,212,160,0.2)",
                          color: d.bottleneckScore > 50 ? "#ff8080" : d.bottleneckScore > 20 ? "#fbbf24" : "#2dd4a0",
                        }}>
                          {d.bottleneckScore > 50 ? "CRÍTICO" : d.bottleneckScore > 20 ? "ATENÇÃO" : "OK"}
                        </div>
                      </div>
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#888", marginBottom: 3 }}>
                          <span>Score de Gargalo</span>
                          <span>{d.bottleneckScore}/100</span>
                        </div>
                        <div style={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}>
                          <div style={{
                            width: `${d.bottleneckScore}%`, height: "100%", borderRadius: 3,
                            background: d.bottleneckScore > 50 ? "#ef4444" : d.bottleneckScore > 20 ? "#f59e0b" : "#2dd4a0",
                            transition: "width 0.5s",
                          }} />
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 8, fontSize: 10 }}>
                        <span style={{ color: "#f59e0b", display: "flex", alignItems: "center", gap: 3 }}><Clock size={10} /> {d.pending} pendentes</span>
                        <span style={{ color: d.overdue > 0 ? "#ef4444" : "#888", display: "flex", alignItems: "center", gap: 3 }}><AlertTriangle size={10} /> {d.overdue} vencidas</span>
                        <span style={{ color: d.critical > 0 ? "#ef4444" : "#888", display: "flex", alignItems: "center", gap: 3 }}><Siren size={10} /> {d.critical} críticas</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* Últimos eventos de orquestração — fonte real (orchestration_runs) */}
        <div style={{
          marginTop: 24, padding: 20,
          background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10,
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#e8e8ed", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
            <ClipboardList size={16} /> Últimos Eventos de Orquestração
          </div>
          {orchRuns.length === 0 && (
            <div style={{ fontSize: 12, color: "#888", textAlign: "center", padding: 20 }}>
              Nenhum evento de orquestração registrado ainda
            </div>
          )}
          {orchRuns.slice(0, 10).map((run, i) => {
            const isFailed = run.status === "failed";
            const isDone = run.status === "done";
            const finalAgent = Array.isArray(run.chain)
              ? (run.chain as { agent?: string }[]).filter((c) => c && c.agent).slice(-1)[0]?.agent
              : undefined;
            return (
              <div key={run.id || i} style={{
                display: "flex", gap: 10, padding: "8px 0", alignItems: "center",
                borderBottom: i < 9 ? "1px solid rgba(255,255,255,0.04)" : "none",
              }}>
                <span style={{
                  fontSize: 9, padding: "2px 6px", borderRadius: 4,
                  background: isFailed ? "rgba(239,68,68,0.15)" : isDone ? "rgba(45,212,160,0.15)" : "rgba(59,130,246,0.15)",
                  color: isFailed ? "#ff8080" : isDone ? "#2dd4a0" : "#60a5fa",
                  fontFamily: "monospace", whiteSpace: "nowrap",
                }}>{run.status || "—"}</span>
                <span style={{ fontSize: 11, color: "#aaa", flex: 1 }}>
                  {finalAgent ? `${finalAgent} · ` : ""}
                  {isFailed && run.error ? String(run.error).slice(0, 80) : String(run.original_message ?? "").slice(0, 90)}
                </span>
                <span style={{ fontSize: 9, color: "#666", fontFamily: "monospace", whiteSpace: "nowrap" }}>
                  {new Date(run.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
