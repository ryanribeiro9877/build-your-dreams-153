import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area } from "recharts";
import {
  Building2, Megaphone, Scale, HardHat, Coins, FileText, Hash, Landmark,
  Search, DollarSign, RefreshCw, Palette, Settings, ShieldCheck,
  Brain, TrendingUp, Target, ClipboardList, Clock, AlertTriangle, Siren, X, ArrowLeft
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { HexagonLoader } from "@/components/HexagonLoader";

/* ─── DEPARTMENT CONFIG ─── */
const DEPTS: { id: string; label: string; color: string; icon: LucideIcon }[] = [
  { id: "recepcao", label: "Recepção", color: "#3b82f6", icon: Building2 },
  { id: "marketing", label: "Marketing", color: "#f59e0b", icon: Megaphone },
  { id: "civel", label: "Cível", color: "#8b5cf6", icon: Scale },
  { id: "trabalhista", label: "Trabalhista", color: "#ef4444", icon: HardHat },
  { id: "tributario", label: "Tributário", color: "#10b981", icon: Coins },
  { id: "protocolo", label: "Protocolo", color: "#6366f1", icon: FileText },
  { id: "calculos", label: "Cálculos", color: "#ec4899", icon: Hash },
  { id: "audiencias", label: "Audiências", color: "#14b8a6", icon: Landmark },
  { id: "monitoramento", label: "Monitoramento", color: "#f97316", icon: Search },
  { id: "financeiro", label: "Financeiro", color: "#2ecc71", icon: DollarSign },
  { id: "conversao", label: "Conversão", color: "#e74c3c", icon: RefreshCw },
  { id: "criacao", label: "Criação", color: "#e67e22", icon: Palette },
  { id: "tech", label: "Tech", color: "#9b59b6", icon: Settings },
  { id: "compliance", label: "Compliance", color: "#0ea5e9", icon: ShieldCheck },
];

const PRIORITY_COLORS: Record<string, string> = { critical: "#ef4444", high: "#f59e0b", medium: "#3b82f6", low: "#10b981" };

interface DeptMetric {
  dept: string;
  label: string;
  color: string;
  Icon: LucideIcon;
  total: number;
  pending: number;
  overdue: number;
  critical: number;
  avgLoad: number;
  bottleneckScore: number;
}

/** Linhas vindas de `agent_tasks` / `agent_orchestration_log` sem tipagem gerada no cliente. */
interface EfficiencyTaskRow {
  created_at: string;
  task_category?: string | null;
  agent_name?: string | null;
  status?: string;
  due_date?: string | null;
  priority?: string;
}

interface OrchLogRow {
  id?: string;
  action?: string;
  created_at: string;
  details?: unknown;
}

export default function EfficiencyKPIs() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [tasks, setTasks] = useState<EfficiencyTaskRow[]>([]);
  const [orchLogs, setOrchLogs] = useState<OrchLogRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [filterDept, setFilterDept] = useState("all");
  const [filterSeverity, setFilterSeverity] = useState("all");
  const [filterPeriod, setFilterPeriod] = useState("30");

  const fetchData = useCallback(async () => {
    if (!user) return;
    const [tasksRes, logsRes] = await Promise.all([
      supabase.from("agent_tasks").select("*").eq("user_id", user.id),
      supabase.from("agent_orchestration_log").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50),
    ]);
    setTasks((tasksRes.data as EfficiencyTaskRow[]) || []);
    setOrchLogs((logsRes.data as OrchLogRow[]) || []);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchData();
    const channel = supabase.channel("efficiency_kpis")
      .on("postgres_changes", { event: "*", schema: "public", table: "agent_tasks" }, () => fetchData())
      .on("postgres_changes", { event: "*", schema: "public", table: "agent_orchestration_log" }, () => fetchData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchData]);

  const filteredTasks = useMemo(() => {
    const now = new Date();
    const daysAgo = new Date(now.getTime() - parseInt(filterPeriod) * 86400000);
    let result = tasks.filter(t => new Date(t.created_at) >= daysAgo);
    if (filterDept !== "all") {
      result = result.filter(t => t.task_category === filterDept || t.agent_name?.toLowerCase().includes(filterDept));
    }
    return result;
  }, [tasks, filterDept, filterPeriod]);

  const deptMetrics = useMemo<DeptMetric[]>(() => {
    const now = new Date();
    return DEPTS.map(d => {
      const deptTasks = filteredTasks.filter(t => t.task_category === d.id || t.agent_name?.toLowerCase().includes(d.id));
      const pending = deptTasks.filter(t => t.status === "pending").length;
      const overdue = deptTasks.filter(t => t.due_date && new Date(t.due_date) < now && t.status !== "completed" && t.status !== "cancelled").length;
      const critical = deptTasks.filter(t => t.priority === "critical").length;
      const total = deptTasks.length;
      const avgLoad = total > 0 ? Math.min(100, Math.round((pending + critical * 2) / Math.max(total, 1) * 100)) : 0;
      const bottleneckScore = Math.min(100, overdue * 15 + critical * 10 + Math.max(0, pending - 5) * 3);
      return { dept: d.id, label: d.label, color: d.color, Icon: d.icon, total, pending, overdue, critical, avgLoad, bottleneckScore };
    }).sort((a, b) => b.bottleneckScore - a.bottleneckScore);
  }, [filteredTasks]);

  const globalKPIs = useMemo(() => {
    const now = new Date();
    const total = filteredTasks.length;
    const pending = filteredTasks.filter(t => t.status === "pending").length;
    const inProgress = filteredTasks.filter(t => t.status === "in_progress").length;
    const overdue = filteredTasks.filter(t => t.due_date && new Date(t.due_date) < now && t.status !== "completed" && t.status !== "cancelled").length;
    const critical = filteredTasks.filter(t => t.priority === "critical").length;
    const completed = filteredTasks.filter(t => t.status === "completed").length;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
    const bottlenecks = deptMetrics.filter(d => d.bottleneckScore > 30).length;
    return { total, pending, inProgress, overdue, critical, completed, completionRate, bottlenecks };
  }, [filteredTasks, deptMetrics]);

  const priorityData = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredTasks.forEach(t => {
      const p = t.priority ?? "unknown";
      counts[p] = (counts[p] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [filteredTasks]);

  const trendData = useMemo(() => {
    const days: Record<string, number> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
      days[key] = 0;
    }
    orchLogs.forEach(log => {
      if (typeof log.action === "string" && log.action.startsWith("bottleneck_")) {
        const d = new Date(log.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
        if (days[d] !== undefined) days[d]++;
      }
    });
    return Object.entries(days).map(([date, alerts]) => ({ date, alerts }));
  }, [orchLogs]);

  if (loading) {
    return <HexagonLoader variant="fullscreen" label="Carregando métricas de eficiência..." />;
  }

  return (
    <div style={{ minHeight: "100vh", background: "#09090f", color: "#e8e8ed", fontFamily: "'Roboto', sans-serif" }}>
      <header style={{
        display: "flex", alignItems: "center", gap: 16, padding: "16px 24px",
        borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.01)",
        flexWrap: "wrap",
      }}>
        <button onClick={() => navigate("/sistema")} style={{
          background: "rgba(201,168,76,0.1)", border: "1px solid rgba(201,168,76,0.2)",
          borderRadius: 8, padding: "6px 14px", color: "#c9a84c", cursor: "pointer", fontSize: 13, fontWeight: 500,
          display: "flex", alignItems: "center", gap: 6,
        }}><ArrowLeft size={14} /> Voltar ao Sistema</button>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, fontFamily: "'Roboto', sans-serif", color: "#ff6b6b", margin: 0, display: "flex", alignItems: "center", gap: 10 }}>
            <Brain size={24} /> Central de Eficiência — KPIs em Tempo Real
          </h1>
          <p style={{ fontSize: 12, color: "#888", margin: 0 }}>Métricas de gargalo por departamento · Atualização automática</p>
        </div>
      </header>

      <div style={{
        display: "flex", gap: 12, padding: "12px 24px", borderBottom: "1px solid rgba(255,255,255,0.04)",
        background: "rgba(255,255,255,0.01)", flexWrap: "wrap", alignItems: "center",
      }}>
        <span style={{ fontSize: 11, color: "#888", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>Filtros:</span>

        <select value={filterDept} onChange={e => setFilterDept(e.target.value)} style={{
          background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6,
          padding: "5px 10px", color: "#e8e8ed", fontSize: 12, cursor: "pointer",
        }}>
          <option value="all">Todos os Departamentos</option>
          {DEPTS.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
        </select>

        <select value={filterPeriod} onChange={e => setFilterPeriod(e.target.value)} style={{
          background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6,
          padding: "5px 10px", color: "#e8e8ed", fontSize: 12, cursor: "pointer",
        }}>
          <option value="7">Últimos 7 dias</option>
          <option value="15">Últimos 15 dias</option>
          <option value="30">Últimos 30 dias</option>
          <option value="90">Últimos 90 dias</option>
          <option value="365">Último ano</option>
        </select>

        <select value={filterSeverity} onChange={e => setFilterSeverity(e.target.value)} style={{
          background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6,
          padding: "5px 10px", color: "#e8e8ed", fontSize: 12, cursor: "pointer",
        }}>
          <option value="all">Todas as Severidades</option>
          <option value="critical">Crítico (score {">"} 50)</option>
          <option value="warning">Atenção (score {">"} 20)</option>
          <option value="ok">OK (score ≤ 20)</option>
        </select>

        {(filterDept !== "all" || filterPeriod !== "30" || filterSeverity !== "all") && (
          <button onClick={() => { setFilterDept("all"); setFilterPeriod("30"); setFilterSeverity("all"); }} style={{
            background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 6,
            padding: "5px 10px", color: "#ff8080", fontSize: 11, cursor: "pointer",
            display: "flex", alignItems: "center", gap: 4,
          }}><X size={12} /> Limpar Filtros</button>
        )}
      </div>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 16px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12, marginBottom: 28 }}>
          {[
            { label: "Total Tarefas", value: globalKPIs.total, color: "#c9a84c" },
            { label: "Pendentes", value: globalKPIs.pending, color: "#f59e0b" },
            { label: "Em Andamento", value: globalKPIs.inProgress, color: "#3b82f6" },
            { label: "Vencidas", value: globalKPIs.overdue, color: globalKPIs.overdue > 0 ? "#ef4444" : "#2dd4a0" },
            { label: "Críticas", value: globalKPIs.critical, color: globalKPIs.critical > 0 ? "#ef4444" : "#2dd4a0" },
            { label: "Concluídas", value: globalKPIs.completed, color: "#2dd4a0" },
            { label: "Taxa Conclusão", value: `${globalKPIs.completionRate}%`, color: globalKPIs.completionRate > 60 ? "#2dd4a0" : "#f59e0b" },
            { label: "Gargalos Ativos", value: globalKPIs.bottlenecks, color: globalKPIs.bottlenecks > 3 ? "#ef4444" : "#f59e0b" },
          ].map(k => (
            <div key={k.label} style={{
              padding: "16px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 10, borderLeft: `3px solid ${k.color}`,
            }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: k.color, fontFamily: "'Roboto', sans-serif" }}>{k.value}</div>
              <div style={{ fontSize: 10, color: "#888", textTransform: "uppercase", letterSpacing: "0.08em" }}>{k.label}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 20, marginBottom: 28 }}>
          <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#e8e8ed", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
              <TrendingUp size={16} color="#ff6b6b" /> Alertas de Gargalo (7 dias)
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={trendData}>
                <defs>
                  <linearGradient id="alertGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ff6b6b" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#ff6b6b" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tick={{ fill: "#888", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#888", fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }} />
                <Area type="monotone" dataKey="alerts" stroke="#ff6b6b" fill="url(#alertGrad)" strokeWidth={2} name="Alertas" />
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
                  {priorityData.map((entry) => (
                    <Cell key={entry.name} fill={PRIORITY_COLORS[entry.name] || "#888"} />
                  ))}
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
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
            {deptMetrics.filter(d => {
              if (filterSeverity === "critical") return d.bottleneckScore > 50;
              if (filterSeverity === "warning") return d.bottleneckScore > 20 && d.bottleneckScore <= 50;
              if (filterSeverity === "ok") return d.bottleneckScore <= 20;
              return true;
            }).map(d => {
              const DeptIcon = d.Icon;
              return (
                <div key={d.dept} style={{
                  padding: 16, borderRadius: 10,
                  background: d.bottleneckScore > 50 ? "rgba(239,68,68,0.05)" : "rgba(255,255,255,0.02)",
                  border: `1px solid ${d.bottleneckScore > 50 ? "rgba(239,68,68,0.2)" : "rgba(255,255,255,0.06)"}`,
                  borderLeft: `3px solid ${d.color}`,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <DeptIcon size={18} color={d.color} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#e8e8ed" }}>{d.label}</div>
                      <div style={{ fontSize: 10, color: "#888" }}>{d.total} tarefas</div>
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
              );
            })}
          </div>
        </div>

        <div style={{
          marginTop: 24, padding: 20,
          background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10,
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#e8e8ed", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
            <ClipboardList size={16} /> Últimos Eventos de Orquestração
          </div>
          {orchLogs.length === 0 && (
            <div style={{ fontSize: 12, color: "#888", textAlign: "center", padding: 20 }}>
              Nenhum evento de orquestração registrado ainda
            </div>
          )}
          {orchLogs.slice(0, 10).map((log, i) => (
            <div key={log.id || i} style={{
              display: "flex", gap: 10, padding: "8px 0", alignItems: "center",
              borderBottom: i < 9 ? "1px solid rgba(255,255,255,0.04)" : "none",
            }}>
              <span style={{
                fontSize: 9, padding: "2px 6px", borderRadius: 4,
                background: log.action?.includes("critical") ? "rgba(239,68,68,0.15)" : "rgba(59,130,246,0.15)",
                color: log.action?.includes("critical") ? "#ff8080" : "#60a5fa",
                fontFamily: "monospace", whiteSpace: "nowrap",
              }}>{log.action}</span>
              <span style={{ fontSize: 11, color: "#aaa", flex: 1 }}>
                {typeof log.details === "object" && log.details !== null && "message" in log.details
                  ? String((log.details as { message?: unknown }).message)
                  : JSON.stringify(log.details ?? null).slice(0, 80)}
              </span>
              <span style={{ fontSize: 9, color: "#666", fontFamily: "monospace", whiteSpace: "nowrap" }}>
                {new Date(log.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
