import { useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

/* ─── TYPES ─── */
interface Agent {
  id: number;
  name: string;
  avatar: string;
  color: string;
  role: string;
  status: string;
  department: string[];
  reportsTo?: number;
  description?: string;
  currentTasks: number;
  maxConcurrentTasks: number;
}

/* ─── AGENTS DATA (mirrors JurisCloudOS) ─── */
const AGENTS: Agent[] = [
  { id: 0, name: "CEO Agent Jus IA", avatar: "👑", color: "#c9a84c", role: "ceo", status: "active", department: ["*","diretoria"], currentTasks: 8, maxConcurrentTasks: 20, description: "Supervisiona todos os diretores e operação global" },
  // Directors
  { id: 1, name: "Diretor de Recepção", avatar: "👔", color: "#3b82f6", role: "director", status: "active", department: ["recepcao","diretoria"], reportsTo: 0, currentTasks: 3, maxConcurrentTasks: 10 },
  { id: 9, name: "Diretor de Marketing", avatar: "🎯", color: "#f59e0b", role: "director", status: "active", department: ["marketing","diretoria"], reportsTo: 0, currentTasks: 5, maxConcurrentTasks: 10 },
  { id: 102, name: "Diretor Contencioso Cível", avatar: "⚖️", color: "#8b5cf6", role: "director", status: "active", department: ["civel","diretoria"], reportsTo: 0, currentTasks: 4, maxConcurrentTasks: 10 },
  { id: 104, name: "Diretor Cont. Trabalhista", avatar: "👷", color: "#ef4444", role: "director", status: "active", department: ["trabalhista","diretoria"], reportsTo: 0, currentTasks: 3, maxConcurrentTasks: 10 },
  { id: 106, name: "Diretor Cont. Tributário", avatar: "💰", color: "#10b981", role: "director", status: "active", department: ["tributario","diretoria"], reportsTo: 0, currentTasks: 3, maxConcurrentTasks: 10 },
  { id: 108, name: "Diretor de Protocolo", avatar: "📋", color: "#6366f1", role: "director", status: "active", department: ["protocolo","diretoria"], reportsTo: 0, currentTasks: 4, maxConcurrentTasks: 10 },
  { id: 109, name: "Diretor de Cálculos", avatar: "🔢", color: "#ec4899", role: "director", status: "active", department: ["calculos","diretoria"], reportsTo: 0, currentTasks: 3, maxConcurrentTasks: 8 },
  { id: 110, name: "Diretor de Audiências", avatar: "🏛️", color: "#14b8a6", role: "director", status: "active", department: ["audiencias","diretoria"], reportsTo: 0, currentTasks: 4, maxConcurrentTasks: 10 },
  { id: 111, name: "Diretor de Monitoramento", avatar: "🔍", color: "#f97316", role: "director", status: "active", department: ["monitoramento","diretoria"], reportsTo: 0, currentTasks: 4, maxConcurrentTasks: 10 },
  { id: 112, name: "Diretor Financeiro (4.1)", avatar: "💰", color: "#2ecc71", role: "director", status: "active", department: ["financeiro","diretoria"], reportsTo: 0, currentTasks: 5, maxConcurrentTasks: 10 },
  { id: 113, name: "Diretor de Compliance", avatar: "🛡️", color: "#0ea5e9", role: "director", status: "active", department: ["compliance","diretoria"], reportsTo: 0, currentTasks: 3, maxConcurrentTasks: 10 },
  { id: 114, name: "Diretor Família/Sucessões", avatar: "👨‍👩‍👧‍👦", color: "#a855f7", role: "director", status: "active", department: ["familia","diretoria"], reportsTo: 0, currentTasks: 3, maxConcurrentTasks: 10 },
  { id: 115, name: "Diretor Com. ao Cliente", avatar: "📨", color: "#06b6d4", role: "director", status: "active", department: ["recepcao","diretoria"], reportsTo: 0, currentTasks: 4, maxConcurrentTasks: 10 },
  { id: 300, name: "Diretor de Conversão (2.1)", avatar: "🔁", color: "#e74c3c", role: "director", status: "active", department: ["conversao","diretoria"], reportsTo: 0, currentTasks: 7, maxConcurrentTasks: 12 },
  { id: 320, name: "Diretor de Criação (6.1)", avatar: "🎨", color: "#e67e22", role: "director", status: "active", department: ["criacao","diretoria"], reportsTo: 0, currentTasks: 5, maxConcurrentTasks: 10 },
  { id: 330, name: "Diretor Tech (7.1)", avatar: "⚙️", color: "#9b59b6", role: "director", status: "active", department: ["tech","diretoria"], reportsTo: 0, currentTasks: 4, maxConcurrentTasks: 10 },
  { id: 400, name: "Diretor de Eficiência", avatar: "🧠", color: "#ff6b6b", role: "director", status: "active", department: ["eficiencia","diretoria"], reportsTo: 0, currentTasks: 8, maxConcurrentTasks: 15 },
  // Managers (sample per director)
  { id: 2, name: "Ger. Atendimento", avatar: "📞", color: "#3b82f6", role: "manager", status: "active", department: ["recepcao"], reportsTo: 1, currentTasks: 4, maxConcurrentTasks: 8 },
  { id: 100, name: "Ger. Intake", avatar: "📥", color: "#3b82f6", role: "manager", status: "active", department: ["recepcao"], reportsTo: 1, currentTasks: 5, maxConcurrentTasks: 8 },
  { id: 10, name: "Ger. Campanhas", avatar: "📊", color: "#f59e0b", role: "manager", status: "active", department: ["marketing"], reportsTo: 9, currentTasks: 6, maxConcurrentTasks: 8 },
  { id: 101, name: "Ger. Conteúdo", avatar: "📝", color: "#f59e0b", role: "manager", status: "active", department: ["marketing"], reportsTo: 9, currentTasks: 5, maxConcurrentTasks: 8 },
  { id: 20, name: "Ger. Processual Cível", avatar: "📋", color: "#8b5cf6", role: "manager", status: "active", department: ["civel"], reportsTo: 102, currentTasks: 6, maxConcurrentTasks: 10 },
  { id: 103, name: "Ger. Análise Cível", avatar: "🔬", color: "#8b5cf6", role: "manager", status: "active", department: ["civel"], reportsTo: 102, currentTasks: 5, maxConcurrentTasks: 8 },
  { id: 28, name: "Ger. Processual Trab.", avatar: "📋", color: "#ef4444", role: "manager", status: "active", department: ["trabalhista"], reportsTo: 104, currentTasks: 5, maxConcurrentTasks: 10 },
  { id: 34, name: "Ger. Processual Tribut.", avatar: "📋", color: "#10b981", role: "manager", status: "active", department: ["tributario"], reportsTo: 106, currentTasks: 4, maxConcurrentTasks: 10 },
  { id: 40, name: "Ger. de Protocolo", avatar: "📋", color: "#6366f1", role: "manager", status: "active", department: ["protocolo"], reportsTo: 108, currentTasks: 6, maxConcurrentTasks: 10 },
  { id: 46, name: "Ger. de Cálculos", avatar: "🔢", color: "#ec4899", role: "manager", status: "active", department: ["calculos"], reportsTo: 109, currentTasks: 5, maxConcurrentTasks: 8 },
  { id: 51, name: "Ger. de Audiências", avatar: "🏛️", color: "#14b8a6", role: "manager", status: "active", department: ["audiencias"], reportsTo: 110, currentTasks: 6, maxConcurrentTasks: 10 },
  { id: 57, name: "Ger. de Monitoramento", avatar: "🔍", color: "#f97316", role: "manager", status: "active", department: ["monitoramento"], reportsTo: 111, currentTasks: 7, maxConcurrentTasks: 10 },
  { id: 200, name: "Ger. Contas a Pagar", avatar: "💸", color: "#2ecc71", role: "manager", status: "active", department: ["financeiro"], reportsTo: 112, currentTasks: 4, maxConcurrentTasks: 8 },
  { id: 201, name: "Ger. Contas a Receber", avatar: "💵", color: "#2ecc71", role: "manager", status: "active", department: ["financeiro"], reportsTo: 112, currentTasks: 5, maxConcurrentTasks: 8 },
  { id: 202, name: "Ger. Conciliação", avatar: "🔄", color: "#27ae60", role: "manager", status: "active", department: ["financeiro"], reportsTo: 112, currentTasks: 3, maxConcurrentTasks: 8 },
  { id: 66, name: "Ger. de Compliance", avatar: "🛡️", color: "#0ea5e9", role: "manager", status: "active", department: ["compliance"], reportsTo: 113, currentTasks: 3, maxConcurrentTasks: 8 },
  { id: 70, name: "Ger. de Família", avatar: "👨‍👩‍👧‍👦", color: "#a855f7", role: "manager", status: "active", department: ["familia"], reportsTo: 114, currentTasks: 5, maxConcurrentTasks: 10 },
  { id: 75, name: "Ger. Consulta Processual", avatar: "🔎", color: "#06b6d4", role: "manager", status: "active", department: ["recepcao"], reportsTo: 115, currentTasks: 5, maxConcurrentTasks: 8 },
  { id: 301, name: "Ger. Intel. Motores", avatar: "📊", color: "#e74c3c", role: "manager", status: "active", department: ["conversao"], reportsTo: 300, currentTasks: 5, maxConcurrentTasks: 8 },
  { id: 302, name: "Ger. Omnichannel", avatar: "🌐", color: "#c0392b", role: "manager", status: "active", department: ["conversao"], reportsTo: 300, currentTasks: 6, maxConcurrentTasks: 8 },
  { id: 303, name: "Ger. Personalização", avatar: "✍️", color: "#c0392b", role: "manager", status: "active", department: ["conversao"], reportsTo: 300, currentTasks: 5, maxConcurrentTasks: 8 },
  { id: 321, name: "Ger. Monit. Concorrência", avatar: "🔍", color: "#e67e22", role: "manager", status: "active", department: ["criacao"], reportsTo: 320, currentTasks: 4, maxConcurrentTasks: 8 },
  { id: 322, name: "Ger. Estratégia Criativa", avatar: "💡", color: "#d35400", role: "manager", status: "active", department: ["criacao"], reportsTo: 320, currentTasks: 5, maxConcurrentTasks: 8 },
  { id: 331, name: "Ger. Integrações", avatar: "🔌", color: "#9b59b6", role: "manager", status: "alert", department: ["tech"], reportsTo: 330, currentTasks: 6, maxConcurrentTasks: 8 },
  { id: 332, name: "Ger. Dados Operacionais", avatar: "🗄️", color: "#8e44ad", role: "manager", status: "active", department: ["tech"], reportsTo: 330, currentTasks: 4, maxConcurrentTasks: 8 },
  { id: 333, name: "Ger. Observabilidade", avatar: "👁️", color: "#8e44ad", role: "manager", status: "alert", department: ["tech"], reportsTo: 330, currentTasks: 7, maxConcurrentTasks: 10 },
  { id: 401, name: "Detector Gargalos Op.", avatar: "🔴", color: "#ff6b6b", role: "specialist", status: "active", department: ["eficiencia"], reportsTo: 400, currentTasks: 30, maxConcurrentTasks: 50 },
  { id: 402, name: "Detector Gargalos Mkt", avatar: "📉", color: "#ff6b6b", role: "specialist", status: "active", department: ["eficiencia"], reportsTo: 400, currentTasks: 12, maxConcurrentTasks: 20 },
  { id: 403, name: "Detector Gargalos Custos", avatar: "💸", color: "#ff6b6b", role: "specialist", status: "active", department: ["eficiencia"], reportsTo: 400, currentTasks: 8, maxConcurrentTasks: 15 },
  { id: 404, name: "Detector Gargalos Juríd.", avatar: "⚖️", color: "#ff6b6b", role: "specialist", status: "active", department: ["eficiencia"], reportsTo: 400, currentTasks: 25, maxConcurrentTasks: 50 },
  { id: 405, name: "Otimizador Fluxo", avatar: "🔗", color: "#ff6b6b", role: "specialist", status: "active", department: ["eficiencia"], reportsTo: 400, currentTasks: 10, maxConcurrentTasks: 20 },
  { id: 406, name: "Monitor KPIs Global", avatar: "📊", color: "#ff6b6b", role: "monitor", status: "active", department: ["eficiencia"], reportsTo: 400, currentTasks: 35, maxConcurrentTasks: 50 },
];

/* ─── TREE BUILDING ─── */
interface TreeNode {
  agent: Agent;
  children: TreeNode[];
  expanded: boolean;
}

function buildTree(agents: Agent[]): TreeNode[] {
  const map = new Map<number, TreeNode>();
  agents.forEach(a => map.set(a.id, { agent: a, children: [], expanded: a.role === "ceo" || a.role === "director" }));
  const roots: TreeNode[] = [];
  agents.forEach(a => {
    const node = map.get(a.id)!;
    if (a.reportsTo !== undefined && map.has(a.reportsTo)) {
      map.get(a.reportsTo)!.children.push(node);
    } else if (a.reportsTo === undefined) {
      roots.push(node);
    }
  });
  return roots;
}

/* ─── ROLE LABELS / COLORS ─── */
const ROLE_STYLE: Record<string, { label: string; bg: string; text: string }> = {
  ceo: { label: "CEO", bg: "rgba(201,168,76,0.2)", text: "#c9a84c" },
  director: { label: "Diretor", bg: "rgba(139,92,246,0.15)", text: "#a78bfa" },
  manager: { label: "Gerente", bg: "rgba(59,130,246,0.15)", text: "#60a5fa" },
  specialist: { label: "Especialista", bg: "rgba(45,212,160,0.15)", text: "#2dd4a0" },
  reviewer: { label: "Revisor", bg: "rgba(245,158,11,0.15)", text: "#fbbf24" },
  executor: { label: "Executor", bg: "rgba(236,72,153,0.15)", text: "#f472b6" },
  monitor: { label: "Monitor", bg: "rgba(249,115,22,0.15)", text: "#fb923c" },
  orchestrator: { label: "Orquestrador", bg: "rgba(201,168,76,0.15)", text: "#c9a84c" },
};

/* ─── NODE COMPONENT ─── */
function OrgNode({ node, depth, toggleExpand }: { node: TreeNode; depth: number; toggleExpand: (id: number) => void }) {
  const { agent } = node;
  const load = Math.round((agent.currentTasks / agent.maxConcurrentTasks) * 100);
  const rs = ROLE_STYLE[agent.role] || ROLE_STYLE.executor;
  const hasChildren = node.children.length > 0;

  return (
    <div style={{ marginLeft: depth > 0 ? 24 : 0 }}>
      {/* Connector line */}
      {depth > 0 && (
        <div style={{ display: "flex", alignItems: "center", marginLeft: -16, marginBottom: -8 }}>
          <div style={{ width: 16, height: 1, background: "rgba(255,255,255,0.08)" }} />
        </div>
      )}
      <div
        onClick={() => hasChildren && toggleExpand(agent.id)}
        style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "10px 14px", marginBottom: 4,
          background: depth === 0 ? "rgba(201,168,76,0.06)" : "rgba(255,255,255,0.02)",
          border: `1px solid ${agent.status === "alert" ? "rgba(239,68,68,0.3)" : "rgba(255,255,255,0.06)"}`,
          borderRadius: 10, cursor: hasChildren ? "pointer" : "default",
          borderLeft: `3px solid ${agent.color}`,
          transition: "all 0.2s",
        }}
      >
        <div style={{
          width: 36, height: 36, borderRadius: 8,
          background: `${agent.color}18`, display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 18, flexShrink: 0,
        }}>{agent.avatar}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#e8e8ed", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {agent.name}
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 2 }}>
            <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 4, background: rs.bg, color: rs.text, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              {rs.label}
            </span>
            <span style={{ fontSize: 9, color: agent.status === "active" ? "#2dd4a0" : agent.status === "alert" ? "#ff8080" : "#888" }}>
              {agent.status === "active" ? "● Ativo" : agent.status === "alert" ? "⚠ Alerta" : "○ Ocioso"}
            </span>
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 10, color: "#888", marginBottom: 2 }}>Carga</div>
          <div style={{ width: 50, height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
            <div style={{ width: `${load}%`, height: "100%", borderRadius: 2, background: load > 80 ? "#ef4444" : load > 50 ? "#f59e0b" : "#2dd4a0" }} />
          </div>
          <div style={{ fontSize: 9, color: "#888", marginTop: 1 }}>{load}%</div>
        </div>
        {hasChildren && (
          <span style={{ fontSize: 12, color: "#888", transition: "transform 0.2s", transform: node.expanded ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
        )}
      </div>
      {node.expanded && node.children.map(child => (
        <OrgNode key={child.agent.id} node={child} depth={depth + 1} toggleExpand={toggleExpand} />
      ))}
    </div>
  );
}

/* ─── STATS BAR ─── */
function StatsBar({ agents }: { agents: Agent[] }) {
  const directors = agents.filter(a => a.role === "director").length;
  const managers = agents.filter(a => a.role === "manager").length;
  const others = agents.length - 1 - directors - managers; // -1 for CEO
  const totalLoad = Math.round(agents.reduce((s, a) => s + a.currentTasks, 0) / agents.reduce((s, a) => s + a.maxConcurrentTasks, 0) * 100);

  const stats = [
    { label: "Total Agentes", value: agents.length, color: "#c9a84c" },
    { label: "Diretores", value: directors, color: "#a78bfa" },
    { label: "Gerentes", value: managers, color: "#60a5fa" },
    { label: "Operacionais", value: others, color: "#2dd4a0" },
    { label: "Carga Global", value: `${totalLoad}%`, color: totalLoad > 70 ? "#ef4444" : "#2dd4a0" },
  ];

  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
      {stats.map(s => (
        <div key={s.label} style={{
          flex: "1 1 140px", padding: "14px 16px",
          background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 10, borderLeft: `3px solid ${s.color}`,
        }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: s.color, fontFamily: "'Cormorant Garamond', serif" }}>{s.value}</div>
          <div style={{ fontSize: 10, color: "#888", textTransform: "uppercase", letterSpacing: "0.08em" }}>{s.label}</div>
        </div>
      ))}
    </div>
  );
}

/* ─── PAGE ─── */
export default function OrgChart() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [tree, setTree] = useState(() => buildTree(AGENTS));
  const [filter, setFilter] = useState("");

  const toggleExpand = useCallback((id: number) => {
    function toggle(nodes: TreeNode[]): TreeNode[] {
      return nodes.map(n => {
        if (n.agent.id === id) return { ...n, expanded: !n.expanded };
        return { ...n, children: toggle(n.children) };
      });
    }
    setTree(prev => toggle(prev));
  }, []);

  const expandAll = useCallback(() => {
    function expand(nodes: TreeNode[]): TreeNode[] {
      return nodes.map(n => ({ ...n, expanded: true, children: expand(n.children) }));
    }
    setTree(prev => expand(prev));
  }, []);

  const collapseAll = useCallback(() => {
    function collapse(nodes: TreeNode[]): TreeNode[] {
      return nodes.map(n => ({ ...n, expanded: false, children: collapse(n.children) }));
    }
    setTree(prev => collapse(prev));
  }, []);

  return (
    <div style={{
      minHeight: "100vh", background: "#09090f", color: "#e8e8ed",
      fontFamily: "'Inter', sans-serif",
    }}>
      {/* Header */}
      <header style={{
        display: "flex", alignItems: "center", gap: 16, padding: "16px 24px",
        borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.01)",
      }}>
        <button
          onClick={() => navigate("/sistema")}
          style={{
            background: "rgba(201,168,76,0.1)", border: "1px solid rgba(201,168,76,0.2)",
            borderRadius: 8, padding: "6px 14px", color: "#c9a84c", cursor: "pointer",
            fontSize: 13, fontWeight: 500,
          }}
        >← Voltar ao Sistema</button>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, fontFamily: "'Cormorant Garamond', serif", color: "#c9a84c", margin: 0 }}>
            Organograma Agent Jus IA
          </h1>
          <p style={{ fontSize: 12, color: "#888", margin: 0 }}>Hierarquia completa: CEO → Diretores → Gerentes → Agentes</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={expandAll} style={{ background: "rgba(45,212,160,0.1)", border: "1px solid rgba(45,212,160,0.2)", borderRadius: 6, padding: "5px 12px", color: "#2dd4a0", cursor: "pointer", fontSize: 11 }}>
            Expandir Tudo
          </button>
          <button onClick={collapseAll} style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 6, padding: "5px 12px", color: "#ff8080", cursor: "pointer", fontSize: 11 }}>
            Recolher Tudo
          </button>
        </div>
      </header>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px" }}>
        <StatsBar agents={AGENTS} />

        {/* Filter */}
        <div style={{ marginBottom: 16 }}>
          <input
            placeholder="Filtrar por nome do agente..."
            value={filter}
            onChange={e => setFilter(e.target.value)}
            style={{
              width: "100%", padding: "10px 14px", borderRadius: 8,
              background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
              color: "#e8e8ed", fontSize: 13, outline: "none",
            }}
          />
        </div>

        {/* Tree */}
        <div>
          {tree.map(node => (
            <OrgNode key={node.agent.id} node={node} depth={0} toggleExpand={toggleExpand} />
          ))}
        </div>

        {/* Legend */}
        <div style={{ marginTop: 32, padding: 16, background: "rgba(255,255,255,0.02)", borderRadius: 10, border: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>Legenda de Papéis</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {Object.entries(ROLE_STYLE).map(([key, val]) => (
              <span key={key} style={{ fontSize: 10, padding: "3px 8px", borderRadius: 4, background: val.bg, color: val.text, fontWeight: 600 }}>
                {val.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
