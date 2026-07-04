import {
  Sparkles, Crown, Brain, RefreshCw, Building2, Megaphone, Palette,
  Scale, HardHat, Coins, ClipboardList, Calculator, Landmark, Eye,
  DollarSign, CreditCard, Settings, Shield, Heart,
  Briefcase, Target, Microscope, Zap, Radio, CheckCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Agent, AgentRole } from "./types";

// ── Icon maps ──
export const DEPT_ICONS: Record<string, LucideIcon> = {
  assistente: Sparkles, diretoria: Crown, eficiencia: Brain, conversao: RefreshCw,
  recepcao: Building2, marketing: Megaphone, criacao: Palette, civel: Scale,
  trabalhista: HardHat, tributario: Coins, protocolo: ClipboardList,
  calculos: Calculator, audiencias: Landmark, monitoramento: Eye,
  financeiro: DollarSign, cobrancas: CreditCard, tech: Settings,
  compliance: Shield, familia: Heart,
};

export const ROLE_ICONS: Record<string, LucideIcon> = {
  ceo: Crown, director: Briefcase, orchestrator: Target, manager: ClipboardList,
  specialist: Microscope, reviewer: CheckCircle, executor: Zap, monitor: Radio,
};

// ── Accent colors ──
export const ACCENT = "#EAB308";
export const ACCENT_SOFT = "#CA8A04";

// ── Hierarchy colors (sidebar agent avatars) ──
export const HIERARCHY_COLORS = {
  ceo:        "#EAB308",
  director:   "#B45309",
  manager:    "#92400E",
  monitor:    "#6B7280",
  default:    "#6B7280",
} as const;

type AgentRoleColorKey = keyof typeof HIERARCHY_COLORS;

export function getHierarchyColor(role?: string | null): string {
  if (!role) return HIERARCHY_COLORS.default;
  const key = role.toLowerCase() as AgentRoleColorKey;
  return HIERARCHY_COLORS[key] ?? HIERARCHY_COLORS.default;
}

// ── Department data ──
export const DEPARTMENTS = [
  { id: "assistente",    label: "Meu Assistente",          color: ACCENT, badge: 8  },
  { id: "diretoria",     label: "Diretoria / CEO",         color: ACCENT_SOFT, badge: 0  },
  { id: "eficiencia",    label: "Central de Eficiência",    color: ACCENT, badge: 5  },
  { id: "conversao",     label: "Conversão",                color: ACCENT_SOFT, badge: 7  },
  { id: "recepcao",      label: "Recepção",                 color: ACCENT, badge: 6  },
  { id: "marketing",     label: "Marketing",                color: ACCENT_SOFT, badge: 5  },
  { id: "criacao",       label: "Criação",                  color: ACCENT, badge: 4  },
  { id: "civel",         label: "Contencioso Cível",        color: ACCENT_SOFT, badge: 12 },
  { id: "trabalhista",   label: "Contencioso Trabalhista",  color: ACCENT, badge: 7  },
  { id: "tributario",    label: "Contencioso Tributário",    color: ACCENT_SOFT, badge: 4  },
  { id: "protocolo",     label: "Protocolo",                color: ACCENT, badge: 9  },
  { id: "calculos",      label: "Cálculos Jurídicos",       color: ACCENT_SOFT, badge: 3  },
  { id: "audiencias",    label: "Audiências",               color: ACCENT, badge: 11 },
  { id: "monitoramento", label: "Monitoramento Processual", color: ACCENT_SOFT, badge: 15 },
  { id: "financeiro",    label: "Financeiro",               color: ACCENT, badge: 6  },
  { id: "cobrancas",     label: "Cobranças",                color: ACCENT_SOFT, badge: 2  },
  { id: "tech",          label: "Tecnologia",               color: ACCENT, badge: 3  },
  { id: "compliance",    label: "Compliance",               color: ACCENT_SOFT, badge: 1  },
  { id: "familia",       label: "Família e Sucessões",      color: ACCENT, badge: 3  },
];

// ── Agents fallback (used while useAgents() loads from DB) ──
export const AGENTS_FALLBACK: Agent[] = [
  { id: 0, name: "CEO JurisAI", status: "active", color: "#c9a84c", role: "ceo", permissions: ["read","write","approve","execute","admin"], department: ["*","diretoria"], canOrchestrate: true, maxConcurrentTasks: 20, currentTasks: 8, description: "Agente CEO — supervisiona todos os diretores e a operação global" },
  { id: 1, name: "Diretor de Recepção", status: "active", color: "#3b82f6", role: "director", permissions: ["read","write","approve","admin"], department: ["recepcao","diretoria"], canOrchestrate: true, maxConcurrentTasks: 10, currentTasks: 3, reportsTo: 0 },
  { id: 2, name: "Gerente de Atendimento", status: "active", color: "#3b82f6", role: "manager", permissions: ["read","write","approve","schedule"], department: ["recepcao"], canOrchestrate: true, maxConcurrentTasks: 8, currentTasks: 4, reportsTo: 1 },
  { id: 100, name: "Gerente de Intake", status: "active", color: "#3b82f6", role: "manager", permissions: ["read","write","approve","contact_client","schedule"], department: ["recepcao"], canOrchestrate: true, maxConcurrentTasks: 8, currentTasks: 5, reportsTo: 1 },
  { id: 3, name: "Agente Agendador", status: "active", color: "#60a5fa", role: "executor", permissions: ["read","write","schedule"], department: ["recepcao"], canOrchestrate: false, maxConcurrentTasks: 15, currentTasks: 7, reportsTo: 2 },
  { id: 4, name: "Confirmacao de Audiencias", status: "active", color: "#60a5fa", role: "executor", permissions: ["read","write","contact_client","schedule"], department: ["recepcao","audiencias"], canOrchestrate: false, maxConcurrentTasks: 20, currentTasks: 12, reportsTo: 2 },
  { id: 5, name: "Coletor de Documentos", status: "active", color: "#93c5fd", role: "executor", permissions: ["read","write","contact_client"], department: ["recepcao"], canOrchestrate: false, maxConcurrentTasks: 10, currentTasks: 5, reportsTo: 100 },
  { id: 6, name: "Atendente WhatsApp", status: "active", color: "#93c5fd", role: "executor", permissions: ["read","write","contact_client"], department: ["recepcao","marketing"], canOrchestrate: false, maxConcurrentTasks: 25, currentTasks: 15, reportsTo: 100 },
  { id: 7, name: "Monitor de Novos Clientes", status: "active", color: "#3b82f6", role: "monitor", permissions: ["read","monitor","schedule"], department: ["recepcao"], canOrchestrate: false, maxConcurrentTasks: 20, currentTasks: 8, reportsTo: 100 },
  { id: 8, name: "Agente de Triagem", status: "active", color: "#3b82f6", role: "specialist", permissions: ["read","write","execute"], department: ["recepcao"], canOrchestrate: false, maxConcurrentTasks: 10, currentTasks: 4, reportsTo: 2 },
  { id: 9, name: "Diretor de Marketing", status: "active", color: "#f59e0b", role: "director", permissions: ["read","write","approve","admin","market_study"], department: ["marketing","diretoria"], canOrchestrate: true, maxConcurrentTasks: 10, currentTasks: 5, reportsTo: 0 },
  { id: 10, name: "Gerente de Campanhas", status: "active", color: "#f59e0b", role: "manager", permissions: ["read","write","approve","execute"], department: ["marketing"], canOrchestrate: true, maxConcurrentTasks: 8, currentTasks: 6, reportsTo: 9 },
  { id: 102, name: "Diretor Contencioso Civel", status: "active", color: "#8b5cf6", role: "director", permissions: ["read","write","approve","admin","petition"], department: ["civel","diretoria"], canOrchestrate: true, maxConcurrentTasks: 10, currentTasks: 4, reportsTo: 0 },
  { id: 20, name: "Gerente Processual Civel", status: "active", color: "#8b5cf6", role: "manager", permissions: ["read","write","approve","petition"], department: ["civel"], canOrchestrate: true, maxConcurrentTasks: 10, currentTasks: 6, reportsTo: 102 },
  { id: 22, name: "Redator de Peticoes", status: "active", color: "#a78bfa", role: "executor", permissions: ["read","write","execute","petition"], department: ["civel"], canOrchestrate: false, maxConcurrentTasks: 5, currentTasks: 3, reportsTo: 20 },
  { id: 24, name: "Monitor de Prazos Civel", status: "alert", color: "#c4b5fd", role: "monitor", permissions: ["read","monitor"], department: ["civel"], canOrchestrate: false, maxConcurrentTasks: 50, currentTasks: 35, maxProcessesMonitored: 50, reportsTo: 20 },
  { id: 104, name: "Diretor Contencioso Trabalhista", status: "active", color: "#ef4444", role: "director", permissions: ["read","write","approve","admin"], department: ["trabalhista","diretoria"], canOrchestrate: true, maxConcurrentTasks: 10, currentTasks: 3, reportsTo: 0 },
  { id: 28, name: "Gerente Processual Trabalhista", status: "active", color: "#ef4444", role: "manager", permissions: ["read","write","approve"], department: ["trabalhista"], canOrchestrate: true, maxConcurrentTasks: 10, currentTasks: 5, reportsTo: 104 },
  { id: 106, name: "Diretor Contencioso Tributario", status: "active", color: "#10b981", role: "director", permissions: ["read","write","approve","admin"], department: ["tributario","diretoria"], canOrchestrate: true, maxConcurrentTasks: 10, currentTasks: 3, reportsTo: 0 },
  { id: 108, name: "Diretor de Protocolo", status: "active", color: "#6366f1", role: "director", permissions: ["read","write","approve","admin","protocol"], department: ["protocolo","diretoria"], canOrchestrate: true, maxConcurrentTasks: 10, currentTasks: 4, reportsTo: 0 },
  { id: 40, name: "Gerente de Protocolo", status: "active", color: "#6366f1", role: "manager", permissions: ["read","write","approve","protocol"], department: ["protocolo"], canOrchestrate: true, maxConcurrentTasks: 10, currentTasks: 6, reportsTo: 108 },
  { id: 109, name: "Diretor de Calculos", status: "active", color: "#ec4899", role: "director", permissions: ["read","write","approve","admin","calculate"], department: ["calculos","diretoria"], canOrchestrate: true, maxConcurrentTasks: 8, currentTasks: 3, reportsTo: 0 },
  { id: 46, name: "Gerente de Calculos", status: "active", color: "#ec4899", role: "manager", permissions: ["read","write","approve","calculate","review_calculation"], department: ["calculos"], canOrchestrate: true, maxConcurrentTasks: 8, currentTasks: 5, reportsTo: 109 },
  { id: 110, name: "Diretor de Audiencias", status: "active", color: "#14b8a6", role: "director", permissions: ["read","write","approve","admin","schedule"], department: ["audiencias","diretoria"], canOrchestrate: true, maxConcurrentTasks: 10, currentTasks: 4, reportsTo: 0 },
  { id: 111, name: "Diretor de Monitoramento", status: "active", color: "#f97316", role: "director", permissions: ["read","write","approve","admin","monitor"], department: ["monitoramento","diretoria"], canOrchestrate: true, maxConcurrentTasks: 10, currentTasks: 4, reportsTo: 0 },
  { id: 112, name: "Diretor Financeiro", status: "active", color: "#2ecc71", role: "director", permissions: ["read","write","approve","admin","calculate"], department: ["financeiro","cobrancas","diretoria"], canOrchestrate: true, maxConcurrentTasks: 10, currentTasks: 5, reportsTo: 0 },
  { id: 113, name: "Diretor de Compliance", status: "active", color: "#0ea5e9", role: "director", permissions: ["read","write","approve","admin"], department: ["compliance","diretoria"], canOrchestrate: true, maxConcurrentTasks: 10, currentTasks: 3, reportsTo: 0 },
  { id: 114, name: "Diretor de Familia", status: "active", color: "#a855f7", role: "director", permissions: ["read","write","approve","admin"], department: ["familia","diretoria"], canOrchestrate: true, maxConcurrentTasks: 10, currentTasks: 3, reportsTo: 0 },
  { id: 300, name: "Diretor de Conversao", status: "active", color: "#e74c3c", role: "director", permissions: ["read","write","approve","admin","execute"], department: ["conversao","diretoria"], canOrchestrate: true, maxConcurrentTasks: 12, currentTasks: 7, reportsTo: 0 },
  { id: 320, name: "Diretor de Criacao", status: "active", color: "#e67e22", role: "director", permissions: ["read","write","approve","admin","market_study"], department: ["criacao","marketing","diretoria"], canOrchestrate: true, maxConcurrentTasks: 10, currentTasks: 5, reportsTo: 0 },
  { id: 330, name: "Diretor Tech", status: "active", color: "#9b59b6", role: "director", permissions: ["read","write","approve","admin","execute"], department: ["tech","diretoria"], canOrchestrate: true, maxConcurrentTasks: 10, currentTasks: 4, reportsTo: 0 },
  { id: 400, name: "Diretor de Eficiencia", status: "active", color: "#ff6b6b", role: "director", permissions: ["read","write","approve","admin","monitor"], department: ["eficiencia","diretoria"], canOrchestrate: true, maxConcurrentTasks: 15, currentTasks: 8, reportsTo: 0 },
  { id: 401, name: "Detector de Gargalos", status: "active", color: "#ff6b6b", role: "specialist", permissions: ["read","monitor","execute"], department: ["eficiencia","*"], canOrchestrate: false, maxConcurrentTasks: 50, currentTasks: 30, reportsTo: 400 },
  { id: 406, name: "Monitor de KPIs Global", status: "active", color: "#ff6b6b", role: "monitor", permissions: ["read","monitor"], department: ["eficiencia","*"], canOrchestrate: false, maxConcurrentTasks: 50, currentTasks: 35, reportsTo: 400 },
];

export const ALL_COMMANDS = [
  "Gerar petição inicial", "Ver prazos fatais", "Resumir caso", "Avisar cliente",
  "Abrir fila de revisão", "Relatório do dia", "Ver gargalos", "Painel financeiro",
  "Gerenciar usuários", "Ver organograma", "Auditoria geral", "Status orquestração",
];

// ── Token cost per command type ──
export const TOKEN_COST: Record<string, { cost: number; label: string }> = {
  "Gerar petição inicial": { cost: 10, label: "Geração de petição" },
  "Resumir caso":          { cost: 5,  label: "Pesquisa jurídica" },
  "Ver gargalos":          { cost: 5,  label: "Análise de eficiência" },
  "Auditoria geral":       { cost: 5,  label: "Auditoria" },
  "Status orquestração":   { cost: 5,  label: "Análise de orquestração" },
  "Relatório do dia":      { cost: 5,  label: "Geração de relatório" },
};
export const DEFAULT_TOKEN_COST = 1;

export function getTokenCost(message: string): { cost: number; label: string } {
  if (TOKEN_COST[message]) return TOKEN_COST[message];
  const lower = message.toLowerCase();
  if (lower.includes("petição") || lower.includes("peticao") || lower.includes("gerar documento"))
    return { cost: 10, label: "Geração de petição" };
  if (lower.includes("pesquis") || lower.includes("jurisprud") || lower.includes("precedent") || lower.includes("resumir caso"))
    return { cost: 5, label: "Pesquisa jurídica" };
  if (lower.includes("relatório") || lower.includes("relatorio") || lower.includes("auditoria"))
    return { cost: 5, label: "Geração de relatório" };
  return { cost: DEFAULT_TOKEN_COST, label: "Comando simples" };
}

// ── Utility functions ──
export function getAgentsForDepartment(agents: Agent[], deptId: string): Agent[] {
  return agents.filter(a => a.department.includes("*") || a.department.includes(deptId));
}
export function getAgentLoad(agent: Agent): number {
  return Math.round((agent.currentTasks / agent.maxConcurrentTasks) * 100);
}
export function getAgentsByRole(agents: Agent[], role: AgentRole): Agent[] {
  return agents.filter(a => a.role === role);
}
export function getTotalCapacity(agents: Agent[]) {
  const used = agents.reduce((s, a) => s + a.currentTasks, 0);
  const total = agents.reduce((s, a) => s + a.maxConcurrentTasks, 0);
  return { used, total, percentage: total > 0 ? Math.round((used / total) * 100) : 0 };
}
export function getInitials(name: string) {
  return name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
}

export function getCaseAreaChip(area: string) {
  const m: Record<string, { background: string; color: string; border: string }> = {
    "Bancário": { background: "rgba(234,179,8,0.32)", color: "#ffffff", border: "1px solid rgba(234,179,8,0.5)" },
    "Cível": { background: "rgba(234,179,8,0.18)", color: "#ffffff", border: "1px solid rgba(234,179,8,0.38)" },
    "Previdência": { background: "rgba(250,204,21,0.28)", color: "#ffffff", border: "1px solid rgba(250,204,21,0.48)" },
    "Previdenciário": { background: "rgba(250,204,21,0.28)", color: "#ffffff", border: "1px solid rgba(250,204,21,0.48)" },
    "Contratos": { background: "rgba(202,138,4,0.28)", color: "#ffffff", border: "1px solid rgba(202,138,4,0.45)" },
  };
  return m[area] || { background: "rgba(234,179,8,0.2)", color: "#ffffff", border: "1px solid rgba(234,179,8,0.4)" };
}

export function normalizeSystemReason(reason: string): string {
  return reason
    .trim()
    .replace(/\)\.\s*$/, ")")
    .replace(/\.{2,}/g, ".")
    .replace(/\.\s*$/, "");
}

export function formatTokenRefundMessage(cost: number, reason: string): string {
  const motivo = normalizeSystemReason(reason);
  const motivoLine = motivo.endsWith(".") ? motivo : `${motivo}.`;
  const tokenLine =
    cost === 1
      ? "O **1 token** foi estornado ao seu saldo."
      : `Os **${cost} tokens** foram estornados ao seu saldo.`;
  return `Não consegui processar sua solicitação agora.\n\n**Motivo:** ${motivoLine}\n\n${tokenLine}`;
}

export function formatInsufficientBalanceMessage(cost: number, label: string): string {
  const custo = cost === 1 ? "**1 token**" : `**${cost} tokens**`;
  return `Saldo insuficiente para continuar.\n\nEste comando custa ${custo} (${label}). Recarregue seus tokens para seguir.`;
}

export const roleLabelsMap: Record<string, string> = {
  ceo: "CEO", director: "Diretor", orchestrator: "Orquestrador", manager: "Gerente",
  specialist: "Especialista", reviewer: "Revisor", executor: "Executor", monitor: "Monitor",
};

export function hashCode(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h) + str.charCodeAt(i) | 0;
  return h;
}

import type { WorkspaceAgent } from "@/hooks/useMyWorkspace";

export function toLegacyAgent(ws: WorkspaceAgent): Agent {
  const role = (ws.role === "assistant_root" ? "ceo" : ws.role) as AgentRole;
  return {
    id: Math.abs(hashCode(ws.id)),
    uuid: ws.id,
    name: ws.name,
    status: ws.status === "offline" ? "idle" : (ws.status as Agent["status"]),
    color: ws.color || "#EAB308",
    role,
    permissions: [],
    department: ws.template_stage ? [`stage:${ws.template_stage}`] : ["assistente"],
    canOrchestrate: ws.role === "ceo" || ws.role === "assistant_root" || ws.role === "director",
    maxConcurrentTasks: 10,
    currentTasks: 0,
  };
}
