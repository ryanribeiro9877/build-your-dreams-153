import { useState, useCallback, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAgents } from "@/hooks/useAgents";
import {
  Crown, Briefcase, Target, Scale, HardHat, Coins, ClipboardList, Hash,
  Landmark, Search, DollarSign, ShieldCheck, Users, Mail, RefreshCw, Palette,
  Settings, Brain, Phone, Inbox, BarChart3, FileEdit, Microscope, CreditCard,
  Banknote, ArrowLeftRight, Eye, Plug, Database, CircleDot, TrendingDown,
  DollarSign as DollarSign2, Link, Monitor, Lightbulb, Globe,
  Pen, ChevronRight, GripVertical, ArrowLeft, Maximize2, Minimize2, RotateCcw,
  ClipboardList as ClipboardIcon
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/* ─── TYPES ─── */
interface Agent {
  id: number;
  name: string;
  Icon: LucideIcon;
  color: string;
  role: string;
  status: string;
  department: string[];
  reportsTo?: number;
  description?: string;
  currentTasks: number;
  maxConcurrentTasks: number;
}

/* ─── AGENTS DATA ─── */
const INITIAL_AGENTS: Agent[] = [
  { id: 0, name: "CEO LexForce", Icon: Crown, color: "#c9a84c", role: "ceo", status: "active", department: ["*","diretoria"], currentTasks: 8, maxConcurrentTasks: 20, description: "Supervisiona todos os diretores e operação global" },
  { id: 1, name: "Diretor de Recepção", Icon: Briefcase, color: "#3b82f6", role: "director", status: "active", department: ["recepcao","diretoria"], reportsTo: 0, currentTasks: 3, maxConcurrentTasks: 10 },
  { id: 9, name: "Diretor de Marketing", Icon: Target, color: "#f59e0b", role: "director", status: "active", department: ["marketing","diretoria"], reportsTo: 0, currentTasks: 5, maxConcurrentTasks: 10 },
  { id: 102, name: "Diretor Contencioso Cível", Icon: Scale, color: "#8b5cf6", role: "director", status: "active", department: ["civel","diretoria"], reportsTo: 0, currentTasks: 4, maxConcurrentTasks: 10 },
  { id: 104, name: "Diretor Cont. Trabalhista", Icon: HardHat, color: "#ef4444", role: "director", status: "active", department: ["trabalhista","diretoria"], reportsTo: 0, currentTasks: 3, maxConcurrentTasks: 10 },
  { id: 106, name: "Diretor Cont. Tributário", Icon: Coins, color: "#10b981", role: "director", status: "active", department: ["tributario","diretoria"], reportsTo: 0, currentTasks: 3, maxConcurrentTasks: 10 },
  { id: 108, name: "Diretor de Protocolo", Icon: ClipboardList, color: "#6366f1", role: "director", status: "active", department: ["protocolo","diretoria"], reportsTo: 0, currentTasks: 4, maxConcurrentTasks: 10 },
  { id: 109, name: "Diretor de Cálculos", Icon: Hash, color: "#ec4899", role: "director", status: "active", department: ["calculos","diretoria"], reportsTo: 0, currentTasks: 3, maxConcurrentTasks: 8 },
  { id: 110, name: "Diretor de Audiências", Icon: Landmark, color: "#14b8a6", role: "director", status: "active", department: ["audiencias","diretoria"], reportsTo: 0, currentTasks: 4, maxConcurrentTasks: 10 },
  { id: 111, name: "Diretor de Monitoramento", Icon: Search, color: "#f97316", role: "director", status: "active", department: ["monitoramento","diretoria"], reportsTo: 0, currentTasks: 4, maxConcurrentTasks: 10 },
  { id: 112, name: "Diretor Financeiro (4.1)", Icon: DollarSign, color: "#2ecc71", role: "director", status: "active", department: ["financeiro","diretoria"], reportsTo: 0, currentTasks: 5, maxConcurrentTasks: 10 },
  { id: 113, name: "Diretor de Compliance", Icon: ShieldCheck, color: "#0ea5e9", role: "director", status: "active", department: ["compliance","diretoria"], reportsTo: 0, currentTasks: 3, maxConcurrentTasks: 10 },
  { id: 114, name: "Diretor Família/Sucessões", Icon: Users, color: "#a855f7", role: "director", status: "active", department: ["familia","diretoria"], reportsTo: 0, currentTasks: 3, maxConcurrentTasks: 10 },
  { id: 115, name: "Diretor Com. ao Cliente", Icon: Mail, color: "#06b6d4", role: "director", status: "active", department: ["recepcao","diretoria"], reportsTo: 0, currentTasks: 4, maxConcurrentTasks: 10 },
  { id: 300, name: "Diretor de Conversão (2.1)", Icon: RefreshCw, color: "#e74c3c", role: "director", status: "active", department: ["conversao","diretoria"], reportsTo: 0, currentTasks: 7, maxConcurrentTasks: 12 },
  { id: 320, name: "Diretor de Criação (6.1)", Icon: Palette, color: "#e67e22", role: "director", status: "active", department: ["criacao","diretoria"], reportsTo: 0, currentTasks: 5, maxConcurrentTasks: 10 },
  { id: 330, name: "Diretor Tech (7.1)", Icon: Settings, color: "#9b59b6", role: "director", status: "active", department: ["tech","diretoria"], reportsTo: 0, currentTasks: 4, maxConcurrentTasks: 10 },
  { id: 400, name: "Diretor de Eficiência", Icon: Brain, color: "#ff6b6b", role: "director", status: "active", department: ["eficiencia","diretoria"], reportsTo: 0, currentTasks: 8, maxConcurrentTasks: 15 },
  // Managers
  { id: 2, name: "Ger. Atendimento", Icon: Phone, color: "#3b82f6", role: "manager", status: "active", department: ["recepcao"], reportsTo: 1, currentTasks: 4, maxConcurrentTasks: 8 },
  { id: 100, name: "Ger. Intake", Icon: Inbox, color: "#3b82f6", role: "manager", status: "active", department: ["recepcao"], reportsTo: 1, currentTasks: 5, maxConcurrentTasks: 8 },
  { id: 10, name: "Ger. Campanhas", Icon: BarChart3, color: "#f59e0b", role: "manager", status: "active", department: ["marketing"], reportsTo: 9, currentTasks: 6, maxConcurrentTasks: 8 },
  { id: 101, name: "Ger. Conteúdo", Icon: FileEdit, color: "#f59e0b", role: "manager", status: "active", department: ["marketing"], reportsTo: 9, currentTasks: 5, maxConcurrentTasks: 8 },
  { id: 20, name: "Ger. Processual Cível", Icon: ClipboardList, color: "#8b5cf6", role: "manager", status: "active", department: ["civel"], reportsTo: 102, currentTasks: 6, maxConcurrentTasks: 10 },
  { id: 103, name: "Ger. Análise Cível", Icon: Microscope, color: "#8b5cf6", role: "manager", status: "active", department: ["civel"], reportsTo: 102, currentTasks: 5, maxConcurrentTasks: 8 },
  { id: 28, name: "Ger. Processual Trab.", Icon: ClipboardList, color: "#ef4444", role: "manager", status: "active", department: ["trabalhista"], reportsTo: 104, currentTasks: 5, maxConcurrentTasks: 10 },
  { id: 34, name: "Ger. Processual Tribut.", Icon: ClipboardList, color: "#10b981", role: "manager", status: "active", department: ["tributario"], reportsTo: 106, currentTasks: 4, maxConcurrentTasks: 10 },
  { id: 40, name: "Ger. de Protocolo", Icon: ClipboardList, color: "#6366f1", role: "manager", status: "active", department: ["protocolo"], reportsTo: 108, currentTasks: 6, maxConcurrentTasks: 10 },
  { id: 46, name: "Ger. de Cálculos", Icon: Hash, color: "#ec4899", role: "manager", status: "active", department: ["calculos"], reportsTo: 109, currentTasks: 5, maxConcurrentTasks: 8 },
  { id: 51, name: "Ger. de Audiências", Icon: Landmark, color: "#14b8a6", role: "manager", status: "active", department: ["audiencias"], reportsTo: 110, currentTasks: 6, maxConcurrentTasks: 10 },
  { id: 57, name: "Ger. de Monitoramento", Icon: Search, color: "#f97316", role: "manager", status: "active", department: ["monitoramento"], reportsTo: 111, currentTasks: 7, maxConcurrentTasks: 10 },
  { id: 200, name: "Ger. Contas a Pagar", Icon: CreditCard, color: "#2ecc71", role: "manager", status: "active", department: ["financeiro"], reportsTo: 112, currentTasks: 4, maxConcurrentTasks: 8 },
  { id: 201, name: "Ger. Contas a Receber", Icon: Banknote, color: "#2ecc71", role: "manager", status: "active", department: ["financeiro"], reportsTo: 112, currentTasks: 5, maxConcurrentTasks: 8 },
  { id: 202, name: "Ger. Conciliação", Icon: ArrowLeftRight, color: "#27ae60", role: "manager", status: "active", department: ["financeiro"], reportsTo: 112, currentTasks: 3, maxConcurrentTasks: 8 },
  { id: 66, name: "Ger. de Compliance", Icon: ShieldCheck, color: "#0ea5e9", role: "manager", status: "active", department: ["compliance"], reportsTo: 113, currentTasks: 3, maxConcurrentTasks: 8 },
  { id: 70, name: "Ger. de Família", Icon: Users, color: "#a855f7", role: "manager", status: "active", department: ["familia"], reportsTo: 114, currentTasks: 5, maxConcurrentTasks: 10 },
  { id: 75, name: "Ger. Consulta Processual", Icon: Search, color: "#06b6d4", role: "manager", status: "active", department: ["recepcao"], reportsTo: 115, currentTasks: 5, maxConcurrentTasks: 8 },
  { id: 301, name: "Ger. Intel. Motores", Icon: BarChart3, color: "#e74c3c", role: "manager", status: "active", department: ["conversao"], reportsTo: 300, currentTasks: 5, maxConcurrentTasks: 8 },
  { id: 302, name: "Ger. Omnichannel", Icon: Globe, color: "#c0392b", role: "manager", status: "active", department: ["conversao"], reportsTo: 300, currentTasks: 6, maxConcurrentTasks: 8 },
  { id: 303, name: "Ger. Personalização", Icon: Pen, color: "#c0392b", role: "manager", status: "active", department: ["conversao"], reportsTo: 300, currentTasks: 5, maxConcurrentTasks: 8 },
  { id: 321, name: "Ger. Monit. Concorrência", Icon: Search, color: "#e67e22", role: "manager", status: "active", department: ["criacao"], reportsTo: 320, currentTasks: 4, maxConcurrentTasks: 8 },
  { id: 322, name: "Ger. Estratégia Criativa", Icon: Lightbulb, color: "#d35400", role: "manager", status: "active", department: ["criacao"], reportsTo: 320, currentTasks: 5, maxConcurrentTasks: 8 },
  { id: 331, name: "Ger. Integrações", Icon: Plug, color: "#9b59b6", role: "manager", status: "alert", department: ["tech"], reportsTo: 330, currentTasks: 6, maxConcurrentTasks: 8 },
  { id: 332, name: "Ger. Dados Operacionais", Icon: Database, color: "#8e44ad", role: "manager", status: "active", department: ["tech"], reportsTo: 330, currentTasks: 4, maxConcurrentTasks: 8 },
  { id: 333, name: "Ger. Observabilidade", Icon: Eye, color: "#8e44ad", role: "manager", status: "alert", department: ["tech"], reportsTo: 330, currentTasks: 7, maxConcurrentTasks: 10 },
  // Efficiency specialists
  { id: 401, name: "Detector Gargalos Op.", Icon: CircleDot, color: "#ff6b6b", role: "specialist", status: "active", department: ["eficiencia"], reportsTo: 400, currentTasks: 30, maxConcurrentTasks: 50 },
  { id: 402, name: "Detector Gargalos Mkt", Icon: TrendingDown, color: "#ff6b6b", role: "specialist", status: "active", department: ["eficiencia"], reportsTo: 400, currentTasks: 12, maxConcurrentTasks: 20 },
  { id: 403, name: "Detector Gargalos Custos", Icon: CreditCard, color: "#ff6b6b", role: "specialist", status: "active", department: ["eficiencia"], reportsTo: 400, currentTasks: 8, maxConcurrentTasks: 15 },
  { id: 404, name: "Detector Gargalos Juríd.", Icon: Scale, color: "#ff6b6b", role: "specialist", status: "active", department: ["eficiencia"], reportsTo: 400, currentTasks: 25, maxConcurrentTasks: 50 },
  { id: 405, name: "Otimizador Fluxo", Icon: Link, color: "#ff6b6b", role: "specialist", status: "active", department: ["eficiencia"], reportsTo: 400, currentTasks: 10, maxConcurrentTasks: 20 },
  { id: 406, name: "Monitor KPIs Global", Icon: Monitor, color: "#ff6b6b", role: "monitor", status: "active", department: ["eficiencia"], reportsTo: 400, currentTasks: 35, maxConcurrentTasks: 50 },
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

/* ─── DRAG & DROP NODE ─── */
function OrgNode({
  node, depth, toggleExpand, draggedId, onDragStart, onDragOver, onDrop, dropTargetId,
}: {
  node: TreeNode; depth: number; toggleExpand: (id: number) => void;
  draggedId: number | null; onDragStart: (id: number) => void;
  onDragOver: (e: React.DragEvent, id: number) => void; onDrop: (targetId: number) => void;
  dropTargetId: number | null;
}) {
  const { agent } = node;
  const AgentIcon = agent.Icon;
  const load = Math.round((agent.currentTasks / agent.maxConcurrentTasks) * 100);
  const rs = ROLE_STYLE[agent.role] || ROLE_STYLE.executor;
  const hasChildren = node.children.length > 0;
  const isDragging = draggedId === agent.id;
  const isDropTarget = dropTargetId === agent.id && draggedId !== agent.id;
  const canDrag = agent.role !== "ceo";

  return (
    <div style={{ marginLeft: depth > 0 ? 24 : 0 }}>
      {depth > 0 && (
        <div style={{ display: "flex", alignItems: "center", marginLeft: -16, marginBottom: -8 }}>
          <div style={{ width: 16, height: 1, background: "rgba(255,255,255,0.08)" }} />
        </div>
      )}
      <div
        draggable={canDrag}
        onDragStart={(e) => { if (canDrag) { e.dataTransfer.effectAllowed = "move"; onDragStart(agent.id); } }}
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; onDragOver(e, agent.id); }}
        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); onDrop(agent.id); }}
        onClick={() => hasChildren && toggleExpand(agent.id)}
        style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "10px 14px", marginBottom: 4,
          background: isDropTarget ? "rgba(45,212,160,0.12)" : isDragging ? "rgba(201,168,76,0.15)" : depth === 0 ? "rgba(201,168,76,0.06)" : "rgba(255,255,255,0.02)",
          border: `1px solid ${isDropTarget ? "rgba(45,212,160,0.5)" : agent.status === "alert" ? "rgba(239,68,68,0.3)" : "rgba(255,255,255,0.06)"}`,
          borderRadius: 10,
          cursor: canDrag ? "grab" : hasChildren ? "pointer" : "default",
          borderLeft: `3px solid ${agent.color}`,
          transition: "all 0.2s",
          opacity: isDragging ? 0.5 : 1,
          transform: isDropTarget ? "scale(1.02)" : "none",
        }}
      >
        {canDrag && (
          <GripVertical size={12} color="#555" style={{ cursor: "grab", flexShrink: 0 }} />
        )}
        <div style={{
          width: 36, height: 36, borderRadius: 8,
          background: `${agent.color}18`, display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}>
          <AgentIcon size={18} color={agent.color} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#e8e8ed", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {agent.name}
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 2 }}>
            <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 4, background: rs.bg, color: rs.text, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              {rs.label}
            </span>
            <span style={{ fontSize: 9, color: agent.status === "active" ? "#2dd4a0" : agent.status === "alert" ? "#ff8080" : "#888" }}>
              {agent.status === "active" ? "● Ativo" : agent.status === "alert" ? "● Alerta" : "○ Ocioso"}
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
          <ChevronRight size={12} color="#888" style={{ transition: "transform 0.2s", transform: node.expanded ? "rotate(90deg)" : "rotate(0deg)" }} />
        )}
      </div>
      {node.expanded && node.children.map(child => (
        <OrgNode
          key={child.agent.id} node={child} depth={depth + 1}
          toggleExpand={toggleExpand} draggedId={draggedId}
          onDragStart={onDragStart} onDragOver={onDragOver} onDrop={onDrop}
          dropTargetId={dropTargetId}
        />
      ))}
    </div>
  );
}

/* ─── STATS BAR ─── */
function StatsBar({ agents }: { agents: Agent[] }) {
  const directors = agents.filter(a => a.role === "director").length;
  const managers = agents.filter(a => a.role === "manager").length;
  const others = agents.length - 1 - directors - managers;
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
  const { agents: dbAgents } = useAgents();

  // Merge: dados do banco (status, current_tasks, max) sobre Icon/role do hardcoded.
  // Migracao completa para uuid + DB so na Onda 4.
  const initialMerged = useMemo<Agent[]>(() => {
    if (!dbAgents.length) return INITIAL_AGENTS;
    const byExt = new Map(dbAgents.filter(a => a.externalId !== null).map(a => [a.externalId!, a]));
    return INITIAL_AGENTS.map(a => {
      const db = byExt.get(a.id);
      if (!db) return a;
      return {
        ...a,
        status: db.status === "offline" ? "idle" : db.status,
        currentTasks: db.currentTasks,
        maxConcurrentTasks: db.maxConcurrentTasks,
        color: db.color || a.color,
      };
    });
  }, [dbAgents]);

  const [agents, setAgents] = useState<Agent[]>(INITIAL_AGENTS);
  const [tree, setTree] = useState(() => buildTree(INITIAL_AGENTS));
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [dropTargetId, setDropTargetId] = useState<number | null>(null);
  const [moveLog, setMoveLog] = useState<string[]>([]);

  // Quando dbAgents chega, sincroniza estado local.
  useEffect(() => {
    setAgents(initialMerged);
    setTree(buildTree(initialMerged));
  }, [initialMerged]);

  const rebuildTree = useCallback((newAgents: Agent[]) => {
    setAgents(newAgents);
    setTree(buildTree(newAgents));
  }, []);

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

  const handleDragStart = useCallback((id: number) => setDraggedId(id), []);

  const handleDragOver = useCallback((_e: React.DragEvent, id: number) => {
    setDropTargetId(id);
  }, []);

  const handleDrop = useCallback((targetId: number) => {
    if (draggedId === null || draggedId === targetId) {
      setDraggedId(null);
      setDropTargetId(null);
      return;
    }

    function isDescendant(agentsList: Agent[], parentId: number, childId: number): boolean {
      const directChildren = agentsList.filter(a => a.reportsTo === parentId);
      for (const child of directChildren) {
        if (child.id === childId) return true;
        if (isDescendant(agentsList, child.id, childId)) return true;
      }
      return false;
    }

    if (isDescendant(agents, draggedId, targetId)) {
      toast.error("Não é possível mover um agente para dentro de seus subordinados");
      setDraggedId(null);
      setDropTargetId(null);
      return;
    }

    const draggedAgent = agents.find(a => a.id === draggedId);
    const targetAgent = agents.find(a => a.id === targetId);
    if (!draggedAgent || !targetAgent) return;

    const oldSuperior = agents.find(a => a.id === draggedAgent.reportsTo);
    const newAgents = agents.map(a => {
      if (a.id === draggedId) return { ...a, reportsTo: targetId };
      return a;
    });

    rebuildTree(newAgents);

    const logEntry = `${draggedAgent.name} movido de "${oldSuperior?.name || 'CEO'}" → "${targetAgent.name}"`;
    setMoveLog(prev => [logEntry, ...prev].slice(0, 20));
    toast.success(`Agente reorganizado: ${draggedAgent.name} agora reporta a ${targetAgent.name}`);

    setDraggedId(null);
    setDropTargetId(null);
  }, [draggedId, agents, rebuildTree]);

  const handleDragEnd = useCallback(() => {
    setDraggedId(null);
    setDropTargetId(null);
  }, []);

  return (
    <div
      style={{ minHeight: "100vh", background: "#09090f", color: "#e8e8ed", fontFamily: "'Inter', sans-serif" }}
      onDragEnd={handleDragEnd}
    >
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
          <h1 style={{ fontSize: 22, fontWeight: 700, fontFamily: "'Cormorant Garamond', serif", color: "#c9a84c", margin: 0 }}>
            Organograma LexForce
          </h1>
          <p style={{ fontSize: 12, color: "#888", margin: 0 }}>Arraste agentes entre departamentos para reorganizar a hierarquia</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={expandAll} style={{ background: "rgba(45,212,160,0.1)", border: "1px solid rgba(45,212,160,0.2)", borderRadius: 6, padding: "5px 12px", color: "#2dd4a0", cursor: "pointer", fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}>
            <Maximize2 size={12} /> Expandir Tudo
          </button>
          <button onClick={collapseAll} style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 6, padding: "5px 12px", color: "#ff8080", cursor: "pointer", fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}>
            <Minimize2 size={12} /> Recolher Tudo
          </button>
          <button onClick={() => rebuildTree(INITIAL_AGENTS)} style={{ background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.2)", borderRadius: 6, padding: "5px 12px", color: "#60a5fa", cursor: "pointer", fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}>
            <RotateCcw size={12} /> Resetar
          </button>
        </div>
      </header>

      <div style={{ display: "flex", gap: 24, maxWidth: 1200, margin: "0 auto", padding: "24px 16px" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <StatsBar agents={agents} />

          {draggedId !== null && (
            <div style={{
              padding: "8px 16px", marginBottom: 12, borderRadius: 8,
              background: "rgba(201,168,76,0.1)", border: "1px solid rgba(201,168,76,0.2)",
              fontSize: 12, color: "#c9a84c", textAlign: "center",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}>
              <RefreshCw size={14} /> Solte sobre outro agente para mover a hierarquia
            </div>
          )}

          {tree.map(node => (
            <OrgNode
              key={node.agent.id} node={node} depth={0}
              toggleExpand={toggleExpand} draggedId={draggedId}
              onDragStart={handleDragStart} onDragOver={handleDragOver}
              onDrop={handleDrop} dropTargetId={dropTargetId}
            />
          ))}

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

        {moveLog.length > 0 && (
          <div style={{
            width: 280, flexShrink: 0, padding: 16,
            background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 10, height: "fit-content", position: "sticky", top: 24,
          }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#c9a84c", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
              <ClipboardIcon size={14} /> Log de Movimentações
            </div>
            {moveLog.map((entry, i) => (
              <div key={i} style={{
                fontSize: 11, color: "#aaa", padding: "6px 0",
                borderBottom: i < moveLog.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
              }}>
                {entry}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
