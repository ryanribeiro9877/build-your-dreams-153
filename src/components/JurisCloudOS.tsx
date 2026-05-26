import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { useAgents } from "@/hooks/useAgents";
import { useChatOrchestrator, friendlyError } from "@/hooks/useChatOrchestrator";
import { useRealtimeNotifications } from "@/hooks/useRealtimeNotifications";
import { useBottleneckDetection } from "@/hooks/useBottleneckDetection";
import { useTokenBalance } from "@/hooks/useTokenBalance";
import TaskQueuesPanel from "@/components/TaskQueuesPanel";
import WelcomeScreen from "@/components/WelcomeScreen";
import { NotificationCenter } from "@/components/NotificationCenter";
import { SafeMarkdown } from "@/components/SafeMarkdown";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useUiPreferences } from "@/hooks/useUiPreferences";
import { trackUiEvent } from "@/lib/uiTracking";
import {
  Sparkles, Crown, Brain, RefreshCw, Building2, Megaphone, Palette,
  Scale, HardHat, Coins, ClipboardList, Calculator, Landmark, Eye,
  DollarSign, CreditCard, Settings, Shield, Heart, Users, BarChart3,
  Network, Activity, User, Globe, LogOut, Send, Mic, MicOff, Sun, Moon,
  Menu, X, Search, AlertTriangle, AlertCircle, Info, CheckCircle,
  ChevronRight, Briefcase, Target, Microscope, Zap, Radio, Lock,
  MessageSquare, ListTodo, FileText, PanelRightOpen, PanelRightClose,
  Circle, ChevronLeft,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/* ─────────────────────────────────────────────────────────────
   JURISAI  –  Sua força de trabalho de IA jurídica
───────────────────────────────────────────────────────────── */

// ── Icon map for departments ──
const DEPT_ICONS: Record<string, LucideIcon> = {
  assistente: Sparkles, diretoria: Crown, eficiencia: Brain, conversao: RefreshCw,
  recepcao: Building2, marketing: Megaphone, criacao: Palette, civel: Scale,
  trabalhista: HardHat, tributario: Coins, protocolo: ClipboardList,
  calculos: Calculator, audiencias: Landmark, monitoramento: Eye,
  financeiro: DollarSign, cobrancas: CreditCard, tech: Settings,
  compliance: Shield, familia: Heart,
};

const ROLE_ICONS: Record<string, LucideIcon> = {
  ceo: Crown, director: Briefcase, orchestrator: Target, manager: ClipboardList,
  specialist: Microscope, reviewer: CheckCircle, executor: Zap, monitor: Radio,
};

const ACCENT = "#EAB308";
const ACCENT_SOFT = "#CA8A04";
const DEPARTMENTS = [
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

type AgentRole = "ceo" | "director" | "orchestrator" | "manager" | "specialist" | "reviewer" | "executor" | "monitor";
type AgentPermission = "read" | "write" | "approve" | "execute" | "admin" | "monitor" | "schedule" | "contact_client" | "protocol" | "calculate" | "review_calculation" | "petition" | "market_study";

const AGENT_PERMISSION_VALUES: readonly AgentPermission[] = [
  "read", "write", "approve", "execute", "admin", "monitor", "schedule", "contact_client",
  "protocol", "calculate", "review_calculation", "petition", "market_study",
] as const;

function parseAgentPermissions(raw: string[]): AgentPermission[] {
  const allowed = new Set<string>(AGENT_PERMISSION_VALUES);
  return raw.filter((p): p is AgentPermission => allowed.has(p));
}

interface Agent {
  id: number;
  /** UUID em `public.agents` — necessário para abrir `/admin/agentes/:id`. */
  uuid?: string;
  name: string; status: "active" | "idle" | "alert";
  color: string; role: AgentRole; permissions: AgentPermission[];
  department: string[]; canOrchestrate: boolean;
  maxConcurrentTasks: number; currentTasks: number;
  description?: string; maxProcessesMonitored?: number; reportsTo?: number;
}

// AGENTS_FALLBACK — usado enquanto useAgents() carrega do banco.
// Fonte de verdade canonica esta em public.agents (migration 20260511122000_seed_agents.sql).
// Mantemos esse array apenas para evitar flash de tela vazia no primeiro render.
const AGENTS_FALLBACK: Agent[] = [
  { id: 0, name: "CEO JurisAI", status: "active", color: "#c9a84c", role: "ceo", permissions: ["read","write","approve","execute","admin"], department: ["*","diretoria"], canOrchestrate: true, maxConcurrentTasks: 20, currentTasks: 8, description: "Agente CEO — supervisiona todos os diretores e a operação global" },
  { id: 1, name: "Diretor de Recepção", status: "active", color: "#3b82f6", role: "director", permissions: ["read","write","approve","admin"], department: ["recepcao","diretoria"], canOrchestrate: true, maxConcurrentTasks: 10, currentTasks: 3, reportsTo: 0 },
  { id: 2, name: "Gerente de Atendimento", status: "active", color: "#3b82f6", role: "manager", permissions: ["read","write","approve","schedule"], department: ["recepcao"], canOrchestrate: true, maxConcurrentTasks: 8, currentTasks: 4, reportsTo: 1 },
  { id: 100, name: "Gerente de Intake", status: "active", color: "#3b82f6", role: "manager", permissions: ["read","write","approve","contact_client","schedule"], department: ["recepcao"], canOrchestrate: true, maxConcurrentTasks: 8, currentTasks: 5, reportsTo: 1 },
  { id: 3, name: "Agente Agendador", status: "active", color: "#60a5fa", role: "executor", permissions: ["read","write","schedule"], department: ["recepcao"], canOrchestrate: false, maxConcurrentTasks: 15, currentTasks: 7, reportsTo: 2 },
  { id: 4, name: "Confirmação de Audiências", status: "active", color: "#60a5fa", role: "executor", permissions: ["read","write","contact_client","schedule"], department: ["recepcao","audiencias"], canOrchestrate: false, maxConcurrentTasks: 20, currentTasks: 12, reportsTo: 2 },
  { id: 5, name: "Coletor de Documentos", status: "active", color: "#93c5fd", role: "executor", permissions: ["read","write","contact_client"], department: ["recepcao"], canOrchestrate: false, maxConcurrentTasks: 10, currentTasks: 5, reportsTo: 100 },
  { id: 6, name: "Atendente WhatsApp", status: "active", color: "#93c5fd", role: "executor", permissions: ["read","write","contact_client"], department: ["recepcao","marketing"], canOrchestrate: false, maxConcurrentTasks: 25, currentTasks: 15, reportsTo: 100 },
  { id: 7, name: "Monitor de Novos Clientes", status: "active", color: "#3b82f6", role: "monitor", permissions: ["read","monitor","schedule"], department: ["recepcao"], canOrchestrate: false, maxConcurrentTasks: 20, currentTasks: 8, reportsTo: 100 },
  { id: 8, name: "Agente de Triagem", status: "active", color: "#3b82f6", role: "specialist", permissions: ["read","write","execute"], department: ["recepcao"], canOrchestrate: false, maxConcurrentTasks: 10, currentTasks: 4, reportsTo: 2 },
  { id: 9, name: "Diretor de Marketing", status: "active", color: "#f59e0b", role: "director", permissions: ["read","write","approve","admin","market_study"], department: ["marketing","diretoria"], canOrchestrate: true, maxConcurrentTasks: 10, currentTasks: 5, reportsTo: 0 },
  { id: 10, name: "Gerente de Campanhas", status: "active", color: "#f59e0b", role: "manager", permissions: ["read","write","approve","execute"], department: ["marketing"], canOrchestrate: true, maxConcurrentTasks: 8, currentTasks: 6, reportsTo: 9 },
  { id: 102, name: "Diretor Contencioso Cível", status: "active", color: "#8b5cf6", role: "director", permissions: ["read","write","approve","admin","petition"], department: ["civel","diretoria"], canOrchestrate: true, maxConcurrentTasks: 10, currentTasks: 4, reportsTo: 0 },
  { id: 20, name: "Gerente Processual Cível", status: "active", color: "#8b5cf6", role: "manager", permissions: ["read","write","approve","petition"], department: ["civel"], canOrchestrate: true, maxConcurrentTasks: 10, currentTasks: 6, reportsTo: 102 },
  { id: 22, name: "Redator de Petições", status: "active", color: "#a78bfa", role: "executor", permissions: ["read","write","execute","petition"], department: ["civel"], canOrchestrate: false, maxConcurrentTasks: 5, currentTasks: 3, reportsTo: 20 },
  { id: 24, name: "Monitor de Prazos Cível", status: "alert", color: "#c4b5fd", role: "monitor", permissions: ["read","monitor"], department: ["civel"], canOrchestrate: false, maxConcurrentTasks: 50, currentTasks: 35, maxProcessesMonitored: 50, reportsTo: 20 },
  { id: 104, name: "Diretor Contencioso Trabalhista", status: "active", color: "#ef4444", role: "director", permissions: ["read","write","approve","admin"], department: ["trabalhista","diretoria"], canOrchestrate: true, maxConcurrentTasks: 10, currentTasks: 3, reportsTo: 0 },
  { id: 28, name: "Gerente Processual Trabalhista", status: "active", color: "#ef4444", role: "manager", permissions: ["read","write","approve"], department: ["trabalhista"], canOrchestrate: true, maxConcurrentTasks: 10, currentTasks: 5, reportsTo: 104 },
  { id: 106, name: "Diretor Contencioso Tributário", status: "active", color: "#10b981", role: "director", permissions: ["read","write","approve","admin"], department: ["tributario","diretoria"], canOrchestrate: true, maxConcurrentTasks: 10, currentTasks: 3, reportsTo: 0 },
  { id: 108, name: "Diretor de Protocolo", status: "active", color: "#6366f1", role: "director", permissions: ["read","write","approve","admin","protocol"], department: ["protocolo","diretoria"], canOrchestrate: true, maxConcurrentTasks: 10, currentTasks: 4, reportsTo: 0 },
  { id: 40, name: "Gerente de Protocolo", status: "active", color: "#6366f1", role: "manager", permissions: ["read","write","approve","protocol"], department: ["protocolo"], canOrchestrate: true, maxConcurrentTasks: 10, currentTasks: 6, reportsTo: 108 },
  { id: 109, name: "Diretor de Cálculos", status: "active", color: "#ec4899", role: "director", permissions: ["read","write","approve","admin","calculate"], department: ["calculos","diretoria"], canOrchestrate: true, maxConcurrentTasks: 8, currentTasks: 3, reportsTo: 0 },
  { id: 46, name: "Gerente de Cálculos", status: "active", color: "#ec4899", role: "manager", permissions: ["read","write","approve","calculate","review_calculation"], department: ["calculos"], canOrchestrate: true, maxConcurrentTasks: 8, currentTasks: 5, reportsTo: 109 },
  { id: 110, name: "Diretor de Audiências", status: "active", color: "#14b8a6", role: "director", permissions: ["read","write","approve","admin","schedule"], department: ["audiencias","diretoria"], canOrchestrate: true, maxConcurrentTasks: 10, currentTasks: 4, reportsTo: 0 },
  { id: 111, name: "Diretor de Monitoramento", status: "active", color: "#f97316", role: "director", permissions: ["read","write","approve","admin","monitor"], department: ["monitoramento","diretoria"], canOrchestrate: true, maxConcurrentTasks: 10, currentTasks: 4, reportsTo: 0 },
  { id: 112, name: "Diretor Financeiro", status: "active", color: "#2ecc71", role: "director", permissions: ["read","write","approve","admin","calculate"], department: ["financeiro","cobrancas","diretoria"], canOrchestrate: true, maxConcurrentTasks: 10, currentTasks: 5, reportsTo: 0 },
  { id: 113, name: "Diretor de Compliance", status: "active", color: "#0ea5e9", role: "director", permissions: ["read","write","approve","admin"], department: ["compliance","diretoria"], canOrchestrate: true, maxConcurrentTasks: 10, currentTasks: 3, reportsTo: 0 },
  { id: 114, name: "Diretor de Família", status: "active", color: "#a855f7", role: "director", permissions: ["read","write","approve","admin"], department: ["familia","diretoria"], canOrchestrate: true, maxConcurrentTasks: 10, currentTasks: 3, reportsTo: 0 },
  { id: 300, name: "Diretor de Conversão", status: "active", color: "#e74c3c", role: "director", permissions: ["read","write","approve","admin","execute"], department: ["conversao","diretoria"], canOrchestrate: true, maxConcurrentTasks: 12, currentTasks: 7, reportsTo: 0 },
  { id: 320, name: "Diretor de Criação", status: "active", color: "#e67e22", role: "director", permissions: ["read","write","approve","admin","market_study"], department: ["criacao","marketing","diretoria"], canOrchestrate: true, maxConcurrentTasks: 10, currentTasks: 5, reportsTo: 0 },
  { id: 330, name: "Diretor Tech", status: "active", color: "#9b59b6", role: "director", permissions: ["read","write","approve","admin","execute"], department: ["tech","diretoria"], canOrchestrate: true, maxConcurrentTasks: 10, currentTasks: 4, reportsTo: 0 },
  { id: 400, name: "Diretor de Eficiência", status: "active", color: "#ff6b6b", role: "director", permissions: ["read","write","approve","admin","monitor"], department: ["eficiencia","diretoria"], canOrchestrate: true, maxConcurrentTasks: 15, currentTasks: 8, reportsTo: 0 },
  { id: 401, name: "Detector de Gargalos", status: "active", color: "#ff6b6b", role: "specialist", permissions: ["read","monitor","execute"], department: ["eficiencia","*"], canOrchestrate: false, maxConcurrentTasks: 50, currentTasks: 30, reportsTo: 400 },
  { id: 406, name: "Monitor de KPIs Global", status: "active", color: "#ff6b6b", role: "monitor", permissions: ["read","monitor"], department: ["eficiencia","*"], canOrchestrate: false, maxConcurrentTasks: 50, currentTasks: 35, reportsTo: 400 },
];

function getAgentsForDepartment(agents: Agent[], deptId: string): Agent[] {
  return agents.filter(a => a.department.includes("*") || a.department.includes(deptId));
}
function getAgentLoad(agent: Agent): number {
  return Math.round((agent.currentTasks / agent.maxConcurrentTasks) * 100);
}
function getAgentsByRole(agents: Agent[], role: AgentRole): Agent[] {
  return agents.filter(a => a.role === role);
}
function getTotalCapacity(agents: Agent[]) {
  const used = agents.reduce((s, a) => s + a.currentTasks, 0);
  const total = agents.reduce((s, a) => s + a.maxConcurrentTasks, 0);
  return { used, total, percentage: total > 0 ? Math.round((used / total) * 100) : 0 };
}
function getInitials(name: string) {
  return name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
}

const PROCESSES = [
  { id: "0023847", client: "Marcos Vinícius S.",  area: "Bancário",  status: "urgente",   prazo: "HOJE",    tribunal: "TJBA", value: "R$ 48.200" },
  { id: "0019234", client: "Ana Paula Ferreira",  area: "Cível",     status: "normal",    prazo: "3 dias",  tribunal: "TJBA", value: "R$ 22.000" },
  { id: "0031102", client: "Roberto Mendes",      area: "Previdência",status: "revisar",  prazo: "5 dias",  tribunal: "TRF5", value: "R$ 91.500" },
  { id: "0041887", client: "Clínica São Lucas",   area: "Contratos", status: "normal",    prazo: "7 dias",  tribunal: "—",    value: "R$ 135.000"},
];

/** Chips de área — apenas tons de amarelo + texto preto/branco. */
function getCaseAreaChip(area: string) {
  const m: Record<string, { background: string; color: string; border: string }> = {
    "Bancário": { background: "rgba(234,179,8,0.32)", color: "#FFFBEB", border: "1px solid rgba(234,179,8,0.5)" },
    "Cível": { background: "rgba(234,179,8,0.18)", color: "#FEFCE8", border: "1px solid rgba(234,179,8,0.38)" },
    "Previdência": { background: "rgba(250,204,21,0.28)", color: "#171717", border: "1px solid rgba(250,204,21,0.48)" },
    "Previdenciário": { background: "rgba(250,204,21,0.28)", color: "#171717", border: "1px solid rgba(250,204,21,0.48)" },
    "Contratos": { background: "rgba(202,138,4,0.28)", color: "#FFFBEB", border: "1px solid rgba(202,138,4,0.45)" },
  };
  return m[area] || { background: "rgba(234,179,8,0.2)", color: "#FFFBEB", border: "1px solid rgba(234,179,8,0.4)" };
}

const ALERTS = [
  { type: "fatal",   text: "Prazo fatal: caso #0023847 – Bancário",  time: "HOJE 17h" },
  { type: "warning", text: "4 clientes sem retorno há +48h",          time: "2h atrás" },
  { type: "info",    text: "12 iniciais aguardam aprovação",          time: "Hoje" },
  { type: "success", text: "Protocolo #0029991 confirmado no TJBA",  time: "09:42" },
];

/** Chat inicia vazio; CTA "Comece a Trabalhar" aparece até a primeira interação. */
const INITIAL_MESSAGES: JcChatMessage[] = [];

const ALL_COMMANDS = [
  "Gerar petição inicial", "Ver prazos fatais", "Resumir caso", "Avisar cliente",
  "Abrir fila de revisão", "Relatório do dia", "Ver gargalos", "Painel financeiro",
  "Gerenciar usuários", "Ver organograma", "Auditoria geral", "Status orquestração",
];

// Token cost per command type
const TOKEN_COST: Record<string, { cost: number; label: string }> = {
  "Gerar petição inicial": { cost: 10, label: "Geração de petição" },
  "Resumir caso":          { cost: 5,  label: "Pesquisa jurídica" },
  "Ver gargalos":          { cost: 5,  label: "Análise de eficiência" },
  "Auditoria geral":       { cost: 5,  label: "Auditoria" },
  "Status orquestração":   { cost: 5,  label: "Análise de orquestração" },
  "Relatório do dia":      { cost: 5,  label: "Geração de relatório" },
};
const DEFAULT_TOKEN_COST = 1;

function getTokenCost(message: string): { cost: number; label: string } {
  // Check exact command match first
  if (TOKEN_COST[message]) return TOKEN_COST[message];
  // Check keywords for typed messages
  const lower = message.toLowerCase();
  if (lower.includes("petição") || lower.includes("peticao") || lower.includes("gerar documento"))
    return { cost: 10, label: "Geração de petição" };
  if (lower.includes("pesquis") || lower.includes("jurisprud") || lower.includes("precedent") || lower.includes("resumir caso"))
    return { cost: 5, label: "Pesquisa jurídica" };
  if (lower.includes("relatório") || lower.includes("relatorio") || lower.includes("auditoria"))
    return { cost: 5, label: "Geração de relatório" };
  return { cost: DEFAULT_TOKEN_COST, label: "Comando simples" };
}

type Theme = "dark" | "light";

// ── STYLE INJECTION ──────────────────────────────────────────
const GlobalStyles = ({ theme }: { theme: Theme }) => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Literata:ital,opsz,wght@0,7..72,400;0,7..72,600;0,7..72,700;1,7..72,400&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --font-disp: 'Literata', Georgia, 'Times New Roman', serif;
      --font-body: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
      --font-mono: 'Plus Jakarta Sans', system-ui, sans-serif;
      --gold: #EAB308; --gold2: #FACC15;
      --theme-transition: 0.42s cubic-bezier(0.22, 1, 0.36, 1);
      --panel-ease: cubic-bezier(0.22, 1, 0.36, 1);
    }
    /* Light: ChatGPT-inspired palette — pure white surfaces, black text. */
    [data-theme="light"] {
      --bg: #ffffff; --bg2: #f9f9f9; --bg3: #ececec; --bg4: #e5e5e5;
      --border: #e5e5e5; --border2: #d9d9d9;
      --card-border: #e5e5e5;
      --card-border-hover: #d0d0d0;
      --text1: #0d0d0d; --text2: #1f1f1f; --text3: #5d5d5d;
      --logo-text: #ffffff;
      --user-bubble-bg: #f4f4f4; --user-bubble-border: #e5e5e5;
      --badge-bg: #ececec;
    }
    /* Dark: deep neutral surfaces with warm gold accents. */
    [data-theme="dark"] {
      --bg: #09090f; --bg2: #11111a; --bg3: #16161f; --bg4: #1c1c28;
      --border: #25253a; --border2: #34344d;
      --card-border: #25253a;
      --card-border-hover: #3a3a55;
      --text1: #eeeef5; --text2: #c4c4d4; --text3: #7a7a92;
      --logo-text: #0a0a12;
      --user-bubble-bg: rgba(234,179,8,0.08); --user-bubble-border: rgba(234,179,8,0.22);
      --badge-bg: rgba(255,255,255,0.06);
    }
    body, .jc-root, .jc-sidebar, .jc-main, .jc-topbar, .jc-right-panel,
    .jc-input-area, .jc-msg-bubble, .jc-kpi, .jc-case-card, .jc-alert-item,
    .jc-nav-item, .jc-input-row, .jc-cmd, .jc-user-chip, .jc-theme-toggle,
    .jc-agent-item, .jc-right-tab, .jc-agents-section {
      transition: background-color var(--theme-transition), border-color var(--theme-transition),
                  color var(--theme-transition), box-shadow var(--theme-transition);
    }
    body { background: var(--bg); color: var(--text1); font-family: var(--font-body); }
    .jc-root { display: flex; height: 100vh; overflow: hidden; background: var(--bg); }

    /* SIDEBAR — z-index acima do .jc-main para o toggle na borda (right negativo) não ficar coberto */
    .jc-sidebar {
      width: 184px; min-width: 184px; background: var(--bg2);
      border-right: 1px solid var(--border);
      display: flex; flex-direction: column;
      overflow-x: visible;
      overflow-y: hidden;
      transition: width 0.38s var(--panel-ease), min-width 0.38s var(--panel-ease), transform 0.35s ease;
      position: relative;
      z-index: 6;
    }
    .jc-sidebar-body {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .jc-sidebar.collapsed { width: 52px; min-width: 52px; }
    .jc-sidebar.collapsed .jc-logo-info,
    .jc-sidebar.collapsed .jc-search,
    .jc-sidebar.collapsed .jc-section-label,
    .jc-sidebar.collapsed .jc-nav-label,
    .jc-sidebar.collapsed .jc-nav-badge,
    .jc-sidebar.collapsed .jc-agent-name { display: none; }
    .jc-sidebar.collapsed .jc-logo { padding: 16px 12px; justify-content: center; }
    .jc-sidebar.collapsed .jc-nav-item { justify-content: center; padding: 10px 8px; }
    .jc-sidebar.collapsed .jc-agent-item { justify-content: center; padding: 6px 4px; }
    .jc-sidebar.collapsed .jc-agents-section { padding: 6px 4px; }
    .jc-sidebar.collapsed .jc-agent-status-dot { display: none; }

    /* ========= Modern collapse pill (sidebar) =========
       Renderizado como filho direto do .jc-root para escapar do overflow do
       .jc-sidebar (overflow-y: hidden faz overflow-x: visible virar auto). */
    .jc-sidebar-toggle {
      position: fixed; top: 78px; left: 188px; z-index: 50;
      width: 32px; height: 56px;
      border-radius: 999px;
      background: rgba(28, 28, 40, 0.42);
      border: 1.5px solid rgba(234,179,8,0.32);
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; color: rgba(234, 179, 8, 0.88);
      opacity: 0.92;
      transition:
        transform 220ms cubic-bezier(0.4, 0, 0.2, 1),
        left 0.38s var(--panel-ease),
        top 0.38s var(--panel-ease),
        background 220ms ease,
        border-color 220ms ease,
        box-shadow 220ms ease,
        color 220ms ease,
        opacity 220ms ease;
      box-shadow:
        0 6px 18px rgba(0,0,0,0.35),
        0 0 0 1px rgba(234,179,8,0.08);
      overflow: hidden;
      line-height: 0;
      flex-shrink: 0;
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
    }
    .jc-sidebar-toggle.is-collapsed { left: 56px; }
    [data-theme="light"] .jc-sidebar-toggle {
      background: rgba(255, 255, 255, 0.65);
      border-color: rgba(161, 98, 7, 0.32);
      color: rgba(180, 83, 9, 0.9);
      box-shadow:
        0 4px 14px rgba(0,0,0,0.1),
        0 0 0 1px rgba(161,98,7,0.08);
    }
    .jc-sidebar-toggle::before {
      content: "";
      position: absolute; inset: 0;
      border-radius: inherit;
      background: radial-gradient(ellipse at center,
        rgba(234,179,8,0.18) 0%, rgba(234,179,8,0) 70%);
      opacity: 0;
      transition: opacity 220ms ease;
      pointer-events: none;
    }
    .jc-sidebar-toggle:hover {
      opacity: 1;
      color: var(--gold);
      border-color: rgba(234,179,8,0.72);
      background: rgba(28, 28, 40, 0.62);
      transform: translateX(2px);
      box-shadow:
        0 8px 22px rgba(0,0,0,0.45),
        0 0 0 2px rgba(234,179,8,0.18);
    }
    [data-theme="light"] .jc-sidebar-toggle:hover {
      background: rgba(255, 255, 255, 0.88);
      border-color: rgba(161, 98, 7, 0.55);
      box-shadow:
        0 6px 16px rgba(0,0,0,0.14),
        0 0 0 2px rgba(161,98,7,0.14);
    }
    .jc-sidebar-toggle:hover::before { opacity: 1; }
    .jc-sidebar-toggle:active { transform: translateX(2px) scale(0.96); }
    .jc-sidebar-toggle:focus-visible,
    .jc-right-toggle-desk:focus-visible,
    .jc-nav-item:focus-visible,
    .jc-agent-item:focus-visible {
      outline: 2px solid var(--gold);
      outline-offset: 2px;
      box-shadow: 0 0 0 4px rgba(234,179,8,0.18);
    }
    .jc-toggle-arrow {
      width: 14px;
      height: 14px;
      user-select: none;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform 220ms cubic-bezier(0.4, 0, 0.2, 1);
    }
    .jc-toggle-arrow svg { width: 100%; height: 100%; display: block; }
    .jc-sidebar-toggle.is-collapsed .jc-toggle-arrow { transform: rotate(180deg); }
    .jc-right-toggle-desk.is-collapsed .jc-toggle-arrow { transform: rotate(180deg); }
    .jc-sr-only {
      position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
      overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0;
    }

    .jc-logo {
      padding: 18px 14px 14px; border-bottom: 1px solid var(--border);
      display: flex; align-items: center; gap: 10px;
    }
    /* Padding normal — o toggle flutua fora do sidebar (position: fixed). */
    .jc-sidebar:not(.collapsed) .jc-logo { padding-right: 14px; }
    .jc-sidebar.collapsed .jc-logo { padding-left: 10px; padding-right: 12px; }
    .jc-logo-mark {
      width: 30px; height: 30px;
      background: linear-gradient(135deg, var(--gold), var(--gold2));
      border-radius: 8px; display: flex; align-items: center; justify-content: center;
      font-size: 15px; font-weight: 700; color: var(--logo-text);
      font-family: var(--font-disp); box-shadow: 0 0 14px rgba(234,179,8,0.3);
      flex-shrink: 0;
    }
    .jc-logo-text {
      font-family: var(--font-disp); font-size: 18px; font-weight: 700;
      letter-spacing: -0.03em;
      transition: color var(--theme-transition), text-shadow var(--theme-transition), opacity var(--theme-transition);
    }
    [data-theme="dark"] .jc-logo-text.online {
      color: #FACC15;
      text-shadow: 0 0 14px rgba(234,179,8,0.35);
    }
    [data-theme="dark"] .jc-logo-text.offline {
      color: #FEF9C3;
      text-shadow: 0 0 12px rgba(250,204,21,0.25);
      opacity: 0.95;
    }
    [data-theme="light"] .jc-logo-text.online {
      color: #713f12;
      text-shadow: none;
      opacity: 1;
    }
    [data-theme="light"] .jc-logo-text.offline {
      color: #9a3412;
      text-shadow: none;
      opacity: 1;
    }
    .jc-logo-sub { font-size: 9px; color: var(--text3); letter-spacing: 0.12em; text-transform: uppercase; font-weight: 600; }
    [data-theme="light"] .jc-logo-sub { color: #52525b; }

    .jc-search {
      margin: 12px 12px 8px; background: var(--bg3); border: 1px solid var(--border);
      border-radius: 8px; padding: 8px 12px; display: flex; align-items: center; gap: 8px;
    }
    .jc-search:hover { border-color: var(--border2); }
    .jc-search input {
      background: none; border: none; outline: none;
      font-family: var(--font-body); font-size: 12px; color: var(--text2); width: 100%;
    }
    .jc-search input::placeholder { color: var(--text3); }

    .jc-nav { flex: 1; overflow-y: auto; padding: 4px 8px 8px; }
    .jc-nav::-webkit-scrollbar { width: 4px; }
    .jc-nav::-webkit-scrollbar-thumb { background: var(--border2); border-radius: 4px; }

    .jc-section-label {
      font-size: 9px; letter-spacing: 0.14em; text-transform: uppercase;
      color: var(--text3); padding: 12px 8px 4px; font-weight: 600;
    }
    .jc-nav-item {
      display: flex; align-items: center; gap: 10px;
      padding: 8px 10px; border-radius: 8px; cursor: pointer;
      transition: background 0.15s; margin-bottom: 1px;
    }
    .jc-nav-item:hover { background: var(--bg4); }
    .jc-nav-item.active { background: rgba(234,179,8,0.08); border: 1px solid rgba(234,179,8,0.15); }
    .jc-nav-label { font-size: 13px; font-weight: 400; color: var(--text1); flex: 1; }
    .jc-nav-badge {
      font-size: 10px; font-family: var(--font-mono);
      background: var(--badge-bg); border-radius: 10px;
      padding: 1px 7px; color: var(--text2); min-width: 22px; text-align: center;
    }
    .jc-nav-badge.alert { background: rgba(234,179,8,0.16); color: #FEF08A; border: 1px solid rgba(234,179,8,0.35); }
    [data-theme="light"] .jc-nav-badge.alert {
      color: #713f12;
      background: rgba(253, 230, 138, 0.5);
      border-color: rgba(161, 98, 7, 0.35);
    }

    .jc-agents-section {
      padding: 8px;
      border-top: 1px solid var(--border);
      flex-shrink: 0;
      max-height: 38vh;
      overflow-x: visible;
      overflow-y: auto;
    }
    .jc-agent-item {
      display: flex; align-items: center; gap: 8px;
      width: 100%;
      border: none; background: transparent; font: inherit; color: inherit; text-align: left;
      padding: 6px 8px; border-radius: 8px; cursor: pointer;
      position: relative; z-index: 0;
      transition: transform 0.22s ease, background 0.2s ease, box-shadow 0.22s ease;
    }
    .jc-agents-section .jc-agent-item:hover {
      background: var(--bg3);
      transform: scale(1.045);
      z-index: 2;
      box-shadow: 0 10px 28px rgba(0,0,0,0.38);
    }
    .jc-agent-avatar {
      width: 26px; height: 26px; border-radius: 6px;
      display: flex; align-items: center; justify-content: center;
      font-size: 9px; font-weight: 700; font-family: var(--font-body); flex-shrink: 0;
    }
    .jc-agent-name { font-size: 11px; color: var(--text2); flex: 1; line-height: 1.2; }

    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

    /* MAIN — abaixo da sidebar para não cobrir o toggle na borda */
    .jc-main { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-width: 0; position: relative; z-index: 1; }
    .jc-topbar {
      min-height: 52px;
      height: auto;
      background: var(--bg2);
      border-bottom: 1px solid var(--border);
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      padding: 10px 16px 12px;
      gap: 10px 12px;
      box-sizing: border-box;
    }
    .jc-topbar-brand {
      flex: 1 1 160px;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .jc-dept-title {
      font-family: var(--font-disp);
      font-size: clamp(15px, 2.4vw, 20px);
      font-weight: 600;
      color: var(--text1);
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
      line-height: 1.2;
    }
    .jc-dept-icon { flex-shrink: 0; }
    .jc-dept-title-text {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .jc-dept-sub { font-size: 11px; color: var(--text3); letter-spacing: 0.08em; text-transform: uppercase; font-weight: 600; }
    [data-theme="light"] .jc-dept-sub { color: #3f3f46; }
    .jc-topbar-trailing {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: flex-end;
      gap: 8px 10px;
      flex: 1 1 220px;
      min-width: 0;
    }
    .jc-alert-chip {
      display: flex; align-items: center; gap: 6px;
      padding: 5px 10px; border-radius: 20px; cursor: pointer;
      font-size: 11px; font-weight: 500; border: 1px solid; transition: opacity 0.15s;
      max-width: min(240px, 36vw);
      flex-shrink: 1;
    }
    .jc-alert-chip:hover { opacity: 0.8; }
    .jc-alert-chip span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .jc-alert-chip.fatal { background: rgba(234,179,8,0.12); border-color: rgba(250,204,21,0.45); color: #FEF9C3; }
    .jc-alert-chip.warning { background: rgba(234,179,8,0.08); border-color: rgba(234,179,8,0.35); color: #FACC15; }
    [data-theme="light"] .jc-alert-chip.fatal {
      color: #431407;
      background: rgba(254, 215, 170, 0.45);
      border-color: rgba(154, 52, 18, 0.35);
    }
    [data-theme="light"] .jc-alert-chip.warning {
      color: #713f12;
      background: rgba(253, 230, 138, 0.35);
      border-color: rgba(161, 98, 7, 0.35);
    }
    .jc-user-chip {
      display: flex; align-items: center; gap: 8px;
      padding: 4px 12px 4px 4px; background: var(--bg3);
      border: 1px solid var(--border); border-radius: 20px; cursor: pointer;
    }
    .jc-user-avatar {
      width: 26px; height: 26px; border-radius: 50%;
      background: linear-gradient(135deg, var(--gold), var(--gold2));
      display: flex; align-items: center; justify-content: center;
      font-size: 11px; font-weight: 700; color: var(--logo-text); font-family: var(--font-disp);
    }
    .jc-user-name { font-size: 12px; color: var(--text1); }

    .jc-onboarding-banner {
      display: flex; align-items: center; gap: 12px;
      margin: 10px 16px 0; padding: 12px 14px;
      background: rgba(234,179,8,0.08);
      border: 1px solid rgba(234,179,8,0.30);
      border-radius: 12px;
      color: var(--text1); font-size: 13px;
    }
    .jc-onboarding-cta {
      background: var(--gold); color: var(--logo-text);
      border: none; border-radius: 8px;
      padding: 8px 14px; font-weight: 600; font-size: 12px;
      cursor: pointer; transition: filter 0.15s;
      white-space: nowrap;
    }
    .jc-onboarding-cta:hover { filter: brightness(1.1); }

    /* MESSAGES */
    .jc-messages { flex: 1; overflow-y: auto; padding: 24px 0; scroll-behavior: smooth; }
    .jc-messages::-webkit-scrollbar { width: 4px; }
    .jc-messages::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }

    .jc-msg-wrap {
      display: flex; gap: 12px; padding: 8px 32px; max-width: 960px; margin: 0 auto;
      animation: fadeUp 0.3s ease both;
    }
    @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
    .jc-msg-wrap.user { flex-direction: row-reverse; }
    .jc-msg-avatar {
      width: 32px; height: 32px; min-width: 32px; border-radius: 8px;
      display: flex; align-items: center; justify-content: center;
      font-size: 11px; font-weight: 700; font-family: var(--font-body);
    }
    .jc-msg-bubble {
      max-width: 75%; background: var(--bg3); border: 1px solid var(--border);
      border-radius: 12px; padding: 14px 16px; font-size: 14px; line-height: 1.7; color: var(--text1);
    }
    .jc-msg-wrap.user .jc-msg-bubble { background: var(--user-bubble-bg); border-color: var(--user-bubble-border); }
    .jc-msg-meta {
      font-size: 10px; color: var(--text3); margin-bottom: 4px;
      font-family: var(--font-body); display: flex; align-items: center; gap: 6px;
    }
    .jc-msg-meta .agent-tag {
      font-size: 9px; padding: 2px 7px; border-radius: 4px;
      background: rgba(234,179,8,0.12); color: var(--gold); border: 1px solid rgba(234,179,8,0.28);
      font-family: var(--font-body); font-weight: 500;
    }
    .jc-msg-text b, .jc-msg-text strong { color: var(--gold2); font-weight: 600; }

    /* BRIEFING */
    .jc-card-briefing {
      background: linear-gradient(135deg, rgba(234,179,8,0.08), rgba(0,0,0,0.12));
      border: 1px solid rgba(234,179,8,0.28); border-radius: 14px; padding: 20px; margin-top: 2px;
    }
    .jc-card-briefing-title { font-family: var(--font-disp); font-size: 22px; font-weight: 600; color: var(--gold2); margin-bottom: 4px; }
    .jc-card-briefing-sub { font-size: 12px; color: var(--text3); margin-bottom: 16px; }
    .jc-card-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
    .jc-kpi {
      background: var(--bg2); border: 1px solid var(--border);
      border-radius: 10px; padding: 12px; display: flex; flex-direction: column; gap: 4px;
    }
    .jc-kpi:hover { border-color: var(--border2); }
    .jc-kpi-value { font-family: var(--font-disp); font-size: 26px; font-weight: 600; line-height: 1; }
    .jc-kpi-label { font-size: 10px; color: var(--text3); text-transform: uppercase; letter-spacing: 0.08em; }

    /* PROCESS LIST */
    .jc-card-processes { margin-top: 8px; display: flex; flex-direction: column; gap: 6px; }
    .jc-process-row {
      background: var(--bg2); border: 1px solid var(--border);
      border-radius: 10px; padding: 11px 14px;
      display: flex; align-items: center; gap: 12px; cursor: pointer; transition: all 0.2s;
    }
    .jc-process-row:hover { border-color: var(--border2); background: var(--bg3); }
    .jc-process-id { font-family: var(--font-body); font-size: 10px; color: var(--text3); min-width: 72px; }
    .jc-process-client { font-size: 12.5px; font-weight: 500; flex: 1; color: var(--text1); }
    .jc-process-area { font-size: 10px; padding: 2px 8px; border-radius: 5px; }
    .jc-process-prazo { font-family: var(--font-body); font-size: 10px; }
    .jc-process-badge {
      font-size: 9px; padding: 3px 8px; border-radius: 5px; font-weight: 600;
      text-transform: uppercase; letter-spacing: 0.06em;
    }
    .jc-process-badge.urgente { background: rgba(234,179,8,0.18); color: #FEF08A; border: 1px solid rgba(250,204,21,0.45); }
    .jc-process-badge.normal { background: rgba(255,255,255,0.06); color: #e4e4e7; border: 1px solid rgba(255,255,255,0.14); }
    .jc-process-badge.revisar { background: rgba(250,204,21,0.12); color: #FACC15; border: 1px solid rgba(250,204,21,0.35); }
    .jc-process-value { font-family: var(--font-body); font-size: 11px; color: #FACC15; min-width: 80px; text-align: right; font-weight: 600; }

    /* THINKING */
    .jc-thinking { display: flex; align-items: center; gap: 4px; padding: 4px 0; }
    .jc-thinking span {
      width: 6px; height: 6px; border-radius: 50%; background: var(--gold);
      animation: thinking 1.2s infinite; display: inline-block;
    }
    .jc-thinking span:nth-child(2) { animation-delay: 0.2s; }
    .jc-thinking span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes thinking { 0%, 60%, 100% { opacity: 0.2; transform: scale(0.8); } 30% { opacity: 1; transform: scale(1.2); } }

    /* INPUT */
    .jc-input-area { background: var(--bg2); border-top: 1px solid var(--border); padding: 12px 32px 16px; }
    .jc-commands { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; }
    .jc-cmd {
      font-size: 11px; padding: 5px 12px; border-radius: 16px;
      background: var(--bg3); border: 1px solid var(--border2);
      color: var(--text2); cursor: pointer; white-space: nowrap; transition: all 0.15s;
      font-family: var(--font-body); display: flex; align-items: center; gap: 4px;
    }
    .jc-cmd:hover { background: rgba(234,179,8,0.08); border-color: rgba(234,179,8,0.25); color: var(--gold2); }
    .jc-input-row {
      display: flex; align-items: flex-end; gap: 10px;
      background: var(--bg3); border: 1px solid var(--border2);
      border-radius: 14px; padding: 10px 14px; transition: border-color 0.2s;
    }
    .jc-input-row:focus-within { border-color: rgba(234,179,8,0.4); }
    .jc-textarea {
      flex: 1; background: none; border: none; outline: none; resize: none;
      font-family: var(--font-body); font-size: 14px; color: var(--text1);
      line-height: 1.5; max-height: 120px; min-height: 22px;
    }
    .jc-textarea::placeholder { color: var(--text3); }
    .jc-send-btn, .jc-mic-btn {
      width: 34px; height: 34px; border-radius: 9px; border: none; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: all 0.2s; flex-shrink: 0;
    }
    .jc-send-btn {
      background: linear-gradient(135deg, var(--gold), var(--gold2));
      color: #0a0a12;
    }
    .jc-send-btn:hover { transform: scale(1.05); box-shadow: 0 0 16px rgba(234,179,8,0.4); }
    .jc-send-btn:disabled { opacity: 0.4; cursor: default; transform: none; }
    .jc-mic-btn {
      background: var(--bg4); color: var(--text2); border: 1px solid var(--border);
    }
    .jc-mic-btn:hover { border-color: var(--gold); color: var(--gold); }
    .jc-mic-btn.recording { background: rgba(234,179,8,0.18); border-color: #EAB308; color: #FEF9C3; animation: pulse 1s infinite; }
    .jc-input-hint { font-size: 10px; color: var(--text3); text-align: center; margin-top: 6px; }

    /* RIGHT PANEL — acima do main para o toggle na borda esquerda ficar visível */
    .jc-right-panel {
      width: 320px; min-width: 320px; background: var(--bg2);
      border-left: 1px solid var(--border); display: flex; flex-direction: column; overflow: hidden;
      transition: width 0.38s var(--panel-ease), min-width 0.38s var(--panel-ease), opacity 0.3s ease;
      position: relative;
      z-index: 5;
    }
    .jc-right-panel.collapsed { width: 0; min-width: 0; border-left: none; }
    .jc-right-panel.collapsed > *:not(.jc-right-toggle-desk) { display: none; }

    /* ========= Modern collapse pill (right panel) =========
       Renderizado como filho direto do .jc-root para escapar do overflow:hidden
       do .jc-right-panel. Position fixed; right calculado pelo estado. */
    .jc-right-toggle-desk {
      position: fixed; top: 78px; right: 324px; z-index: 50;
      width: 32px; height: 56px;
      border-radius: 999px;
      background: rgba(28, 28, 40, 0.42);
      border: 1.5px solid rgba(234,179,8,0.32);
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; color: rgba(234, 179, 8, 0.88);
      opacity: 0.92;
      transition:
        transform 220ms cubic-bezier(0.4, 0, 0.2, 1),
        right 0.38s var(--panel-ease),
        top 0.38s var(--panel-ease),
        background 220ms ease,
        border-color 220ms ease,
        box-shadow 220ms ease,
        color 220ms ease,
        opacity 220ms ease;
      box-shadow:
        0 6px 18px rgba(0,0,0,0.35),
        0 0 0 1px rgba(234,179,8,0.08);
      overflow: hidden;
      line-height: 0;
      flex-shrink: 0;
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
    }
    .jc-right-toggle-desk.is-collapsed { right: 8px; top: 78px; }
    [data-theme="light"] .jc-right-toggle-desk {
      background: rgba(255, 255, 255, 0.65);
      border-color: rgba(161, 98, 7, 0.32);
      color: rgba(180, 83, 9, 0.9);
      box-shadow:
        0 4px 14px rgba(0,0,0,0.1),
        0 0 0 1px rgba(161,98,7,0.08);
    }
    .jc-right-toggle-desk::before {
      content: "";
      position: absolute; inset: 0;
      border-radius: inherit;
      background: radial-gradient(ellipse at center,
        rgba(234,179,8,0.18) 0%, rgba(234,179,8,0) 70%);
      opacity: 0;
      transition: opacity 220ms ease;
      pointer-events: none;
    }
    .jc-right-toggle-desk:hover {
      opacity: 1;
      color: var(--gold);
      border-color: rgba(234,179,8,0.72);
      background: rgba(28, 28, 40, 0.62);
      transform: translateX(-2px);
      box-shadow:
        0 8px 22px rgba(0,0,0,0.45),
        0 0 0 2px rgba(234,179,8,0.18);
    }
    [data-theme="light"] .jc-right-toggle-desk:hover {
      background: rgba(255, 255, 255, 0.88);
      border-color: rgba(161, 98, 7, 0.55);
      box-shadow:
        0 6px 16px rgba(0,0,0,0.14),
        0 0 0 2px rgba(161,98,7,0.14);
    }
    .jc-right-toggle-desk:hover::before { opacity: 1; }
    .jc-right-toggle-desk:active { transform: translateX(-2px) scale(0.96); }

    .jc-right-header {
      padding: 16px 16px 12px 16px; border-bottom: 1px solid var(--border);
      font-family: var(--font-disp); font-size: 16px; font-weight: 600; color: var(--text1);
    }
    .jc-right-tabs { display: flex; border-bottom: 1px solid var(--border); padding: 0 12px; }
    .jc-right-tab {
      font-size: 11px; padding: 9px 12px; cursor: pointer; color: var(--text3);
      border-bottom: 2px solid transparent; transition: all 0.15s; white-space: nowrap; font-weight: 500;
      display: flex; align-items: center; gap: 4px;
    }
    .jc-right-tab.active { color: var(--gold); border-color: var(--gold); }
    .jc-right-body { flex: 1; overflow-y: auto; padding: 12px; }
    .jc-right-body::-webkit-scrollbar { width: 3px; }
    .jc-right-body::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }

    /* Cards inside right panel — lighter outline for separation in dark mode */
    .jc-case-card, .jc-agent-card-rp {
      background: var(--bg3); border: 1px solid var(--card-border);
      border-radius: 10px; padding: 12px; margin-bottom: 8px; cursor: pointer; transition: all 0.2s;
    }
    .jc-case-card:hover, .jc-agent-card-rp:hover {
      border-color: var(--card-border-hover); background: var(--bg4);
    }
    .jc-case-num { font-family: var(--font-body); font-size: 10px; color: var(--text3); margin-bottom: 4px; }
    .jc-case-name { font-size: 13px; font-weight: 500; color: var(--text1); margin-bottom: 6px; }
    .jc-case-row { display: flex; justify-content: space-between; align-items: center; }
    .jc-case-prazo-row { display: flex; align-items: center; gap: 4px; font-size: 10px; color: var(--text3); margin-top: 6px; }

    .jc-alert-item {
      display: flex; gap: 10px; align-items: flex-start;
      padding: 10px; border-radius: 8px; margin-bottom: 6px; border: 1px solid; cursor: pointer;
    }
    .jc-alert-item.fatal { background: rgba(234,179,8,0.06); border-color: rgba(250,204,21,0.35); }
    .jc-alert-item.warning { background: rgba(234,179,8,0.05); border-color: rgba(234,179,8,0.28); }
    .jc-alert-item.info { background: rgba(255,255,255,0.04); border-color: rgba(255,255,255,0.12); }
    .jc-alert-item.success { background: rgba(250,204,21,0.06); border-color: rgba(250,204,21,0.3); }
    .jc-alert-text { font-size: 11.5px; color: var(--text1); line-height: 1.4; flex: 1; }
    .jc-alert-time { font-size: 9px; color: var(--text3); font-family: var(--font-body); white-space: nowrap; }

    .jc-sidebar-overlay { display: none; position: fixed; inset: 0; z-index: 40; background: rgba(0,0,0,0.5); }
    .jc-sidebar-overlay.visible { display: block; }
    .jc-tooltip-overlay {
      position: fixed; inset: 0; z-index: 45;
      background: rgba(0,0,0,0.45);
      backdrop-filter: blur(1px);
      pointer-events: none;
      animation: jcTooltipFade 120ms ease-out;
    }
    @keyframes jcTooltipFade { from { opacity: 0 } to { opacity: 1 } }
    .jc-hamburger { display: none; background: none; border: none; cursor: pointer; color: var(--text1); padding: 4px; flex-shrink: 0; }
    .jc-right-toggle {
      display: none; background: var(--bg3); border: 1px solid var(--border);
      border-radius: 8px; padding: 6px 10px; cursor: pointer; font-size: 11px; color: var(--text2);
      align-items: center; gap: 4px;
    }
    * { scrollbar-color: var(--border) transparent; scrollbar-width: thin; }

    @media (max-width: 1024px) {
      .jc-right-panel { display: none; }
      .jc-right-panel.mobile-visible {
        display: flex; position: fixed; right: 0; top: 0; bottom: 0; z-index: 50;
        width: min(320px, 90vw); box-shadow: -4px 0 24px rgba(0,0,0,0.3);
      }
      /* In mobile mode, the off-canvas right panel always shows full content */
      .jc-right-panel.mobile-visible.collapsed { width: min(320px, 90vw); min-width: 0; border-left: 1px solid var(--border); }
      .jc-right-panel.mobile-visible.collapsed > *:not(.jc-right-toggle-desk) { display: revert; }
      /* Hide the desktop floating toggle on mobile to avoid stray buttons */
      .jc-right-toggle-desk { display: none; }
      .jc-right-panel.mobile-visible .jc-right-toggle-desk { display: none; }
      .jc-right-toggle { display: flex; }
    }
    @media (max-width: 768px) {
      .jc-sidebar {
        position: fixed; left: 0; top: 0; bottom: 0; z-index: 50;
        transform: translateX(-100%); box-shadow: 4px 0 24px rgba(0,0,0,0.3);
        width: 240px !important; min-width: 240px !important;
      }
      .jc-sidebar.mobile-open { transform: translateX(0); }
      .jc-sidebar.collapsed .jc-logo-info,
      .jc-sidebar.collapsed .jc-search,
      .jc-sidebar.collapsed .jc-section-label,
      .jc-sidebar.collapsed .jc-nav-label,
      .jc-sidebar.collapsed .jc-nav-badge,
      .jc-sidebar.collapsed .jc-agent-name { display: revert; }
      .jc-sidebar-toggle { display: none; }
      .jc-sidebar-overlay.visible { display: block; }
      .jc-hamburger { display: block; }
      .jc-topbar { padding: 8px 10px 10px; gap: 8px; }
      .jc-topbar-brand { flex-basis: 100%; }
      .jc-topbar-trailing { flex-basis: 100%; justify-content: flex-start; }
      .jc-alert-chip { display: none; }
      .jc-dept-title { font-size: 16px; }
      .jc-msg-wrap { padding: 8px 16px; }
      .jc-msg-bubble { max-width: 85%; font-size: 13px; }
      .jc-card-grid { grid-template-columns: 1fr 1fr; }
      .jc-input-area { padding: 8px 12px 12px; }
      .jc-cmd { font-size: 10px; padding: 3px 8px; }
    }
    @media (max-width: 480px) {
      .jc-card-grid { grid-template-columns: 1fr 1fr; gap: 6px; }
      .jc-kpi { padding: 8px; }
      .jc-kpi-value { font-size: 20px; }
      .jc-user-chip { display: none; }
    }
  `}</style>
);

// ── SUB-COMPONENTS ───────────────────────────────────────────
interface BriefingKpiItem {
  label: string;
  value: string;
  accent: string;
}

interface BriefingCardPayload {
  type: "briefing";
  title: string;
  summary: string;
  items: BriefingKpiItem[];
}

interface ProcessListRow {
  id: string;
  client: string;
  area: string;
  status: string;
  prazo: string;
  value: string;
  tribunal?: string;
}

interface ProcessListPayload {
  type: "process-list";
  processes: ProcessListRow[];
}

type AssistantChatCard = BriefingCardPayload | ProcessListPayload;

interface JcChatMessage {
  id: number;
  role: string;
  agent?: string;
  content?: string | null;
  timestamp: string;
  card?: AssistantChatCard;
  meta?: { requestId?: string; tokensCost?: number; orchestration?: unknown };
}

function BriefingCard({ card }: { card: BriefingCardPayload }) {
  return (
    <div className="jc-card-briefing">
      <div className="jc-card-briefing-title">{card.title}</div>
      <div className="jc-card-briefing-sub">{card.summary}</div>
      <div className="jc-card-grid">
        {card.items.map((item, i: number) => (
          <div className="jc-kpi" key={i} style={{ borderLeftColor: item.accent, borderLeftWidth: 2 }}>
            <div className="jc-kpi-value" style={{ color: item.accent }}>{item.value}</div>
            <div className="jc-kpi-label">{item.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProcessListCard({ processes }: { processes: ProcessListRow[] }) {
  return (
    <div className="jc-card-processes">
      {processes.map((p) => (
        <div className="jc-process-row" key={p.id}>
          <div className="jc-process-id">#{p.id}</div>
          <div className="jc-process-client">{p.client}</div>
          <div className="jc-process-area" style={getCaseAreaChip(p.area)}>{p.area}</div>
          <div className="jc-process-prazo" style={{ color: p.prazo === "HOJE" ? "#FACC15" : "var(--text2)" }}>
            {p.prazo === "HOJE" ? (
              <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                <AlertTriangle size={10} /> HOJE
              </span>
            ) : p.prazo}
          </div>
          <div className={`jc-process-badge ${p.status}`}>{p.status}</div>
          <div className="jc-process-value">{p.value}</div>
        </div>
      ))}
    </div>
  );
}

function MessageBubble({ msg }: { msg: JcChatMessage }) {
  const agentColors: Record<string, string> = {
    "Meu Assistente": "#EAB308",
    "Pesquisador Jurídico": "#CA8A04",
    "Redator Processual": "#FACC15",
    "Controlador de Prazos": "#A16207",
  };
  const isUser = msg.role === "user";
  const color = agentColors[msg.agent] || "#EAB308";

  return (
    <div className={`jc-msg-wrap ${isUser ? "user" : ""}`}>
      <div className="jc-msg-avatar" style={{
        background: isUser ? "rgba(234,179,8,0.15)" : `${color}20`,
        color: isUser ? "#EAB308" : color,
        border: `1px solid ${isUser ? "rgba(234,179,8,0.25)" : `${color}30`}`,
        fontFamily: isUser ? "var(--font-disp)" : "var(--font-body)",
        fontSize: isUser ? 10 : 11,
        fontWeight: 700,
        letterSpacing: isUser ? "0.04em" : "0",
        textTransform: isUser ? "uppercase" : "none",
        minWidth: isUser ? 44 : undefined,
        paddingInline: isUser ? 8 : undefined,
      }}>
        {isUser ? "VOCÊ" : (msg.agent ? getInitials(msg.agent) : "AI")}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, maxWidth: "80%" }}>
        {!isUser && msg.agent && (
          <div className="jc-msg-meta">
            <span className="agent-tag">{msg.agent}</span>
            <span>{msg.timestamp}</span>
          </div>
        )}
        {isUser && <div className="jc-msg-meta" style={{ justifyContent: "flex-end" }}>{msg.timestamp}</div>}
        <div className="jc-msg-bubble">
          {msg.content && (
            <SafeMarkdown className="jc-msg-text">{msg.content}</SafeMarkdown>
          )}
          {msg.card?.type === "briefing" && <BriefingCard card={msg.card} />}
          {msg.card?.type === "process-list" && <ProcessListCard processes={msg.card.processes} />}
        </div>
      </div>
    </div>
  );
}

function ThinkingBubble({ agent }: { agent: string }) {
  return (
    <div className="jc-msg-wrap">
      <div className="jc-msg-avatar" style={{ background: "rgba(234,179,8,0.12)", color: "#EAB308", border: "1px solid rgba(234,179,8,0.28)", fontSize: 11 }}>
        {getInitials(agent)}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div className="jc-msg-meta"><span className="agent-tag">{agent}</span><span>agora</span></div>
        <div className="jc-msg-bubble" style={{ padding: "14px 18px" }}>
          <div className="jc-thinking"><span /><span /><span /></div>
        </div>
      </div>
    </div>
  );
}

// ── ALERT ICON HELPER ───────────────────────────────────────
function AlertIcon({ type }: { type: string }) {
  const size = 14;
  if (type === "fatal") return <AlertTriangle size={size} style={{ color: "#FACC15" }} />;
  if (type === "warning") return <AlertCircle size={size} style={{ color: "#EAB308" }} />;
  if (type === "success") return <CheckCircle size={size} style={{ color: "#FEF9C3" }} />;
  return <Info size={size} style={{ color: "#FDE047" }} />;
}

// ── MAIN COMPONENT ───────────────────────────────────────────
export default function JurisCloudOS() {
  const navigate = useNavigate();
  const { user, userRoles, signOut, hasRole } = useAuth();
  const { canAccessDepartment, canSeeCommand, canSeeMenuItem, canSeeAgentRole, canAccessAdmin, canAccessClients, isReadOnly, roleLabel, visibility } = usePermissions();
  useRealtimeNotifications();
  useBottleneckDetection();
  const { tokenBalance, consumeTokensWithRef, refundTokens } = useTokenBalance();

  // Agentes do banco. Enquanto carrega usa AGENTS_FALLBACK pra evitar flash de tela vazia.
  const { agents: dbAgents, loading: agentsLoading } = useAgents();
  // Chat principal "Meu Assistente" usa o orchestrator novo, com o CEO JurisAI
  // (ou o primeiro agente com IA configurada) como entrada. A sessão é criada
  // sob demanda na primeira mensagem.
  const { startSession, sendMessage: orchestratorSend } = useChatOrchestrator();
  const [assistantSessionId, setAssistantSessionId] = useState<string | null>(null);
  const [entryAgentId, setEntryAgentId] = useState<string | null>(null);
  const AGENTS: Agent[] = agentsLoading || dbAgents.length === 0
    ? AGENTS_FALLBACK
    : dbAgents.map(a => ({
        id: a.externalId ?? 0,
        uuid: a.id,
        name: a.name,
        status: (a.status === "offline" ? "idle" : a.status) as "active" | "idle" | "alert",
        color: a.color,
        role: a.role,
        permissions: parseAgentPermissions(a.permissions),
        department: a.departmentName === "diretoria" ? [a.departmentName] : [a.departmentName, ...(a.role === "ceo" ? ["*","diretoria"] : a.role === "director" ? ["diretoria"] : [])],
        canOrchestrate: a.canOrchestrate,
        maxConcurrentTasks: a.maxConcurrentTasks,
        currentTasks: a.currentTasks,
        description: a.description ?? undefined,
        reportsTo: a.reportsTo ?? undefined,
      }));

  // Descobre o agente de entrada: prefere o CEO; se não existir, qualquer agente
  // com provider+model configurados. Sem isso, o chat exibe um aviso amigável.
  useEffect(() => {
    if (agentsLoading || dbAgents.length === 0) return;
    (async () => {
      // 1) preferência: agente com role === "ceo"
      const ceo = dbAgents.find((a) => a.role === "ceo");
      // 2) Verifica no banco quais agentes têm IA configurada (provider+model)
      const { data: configured } = await supabase
        .from("agents")
        .select("id")
        .not("provider" as never, "is", null)
        .not("model" as never, "is", null);
      const configuredIds = new Set(((configured as unknown as { id: string }[]) || []).map((r) => r.id));
      const pick = ceo && configuredIds.has(ceo.id)
        ? ceo
        : dbAgents.find((a) => configuredIds.has(a.id));
      if (pick) setEntryAgentId(pick.id);
    })();
  }, [agentsLoading, dbAgents]);

  // Reset da sessão quando o agente de entrada muda.
  useEffect(() => {
    setAssistantSessionId(null);
  }, [entryAgentId]);

    const [showWelcome, setShowWelcome]     = useState(true);
  const [activeDept, setActiveDept]       = useState("assistente");
  const [messages, setMessages]           = useState<JcChatMessage[]>(INITIAL_MESSAGES);
  const [inputVal, setInputVal]           = useState("");
  const [thinking, setThinking]           = useState(false);
  const [rightTab, setRightTab]           = useState("processos");
  const [sidebarSearch, setSidebarSearch] = useState("");
  // Theme: ChatGPT-style light/dark, persisted in localStorage.
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === "undefined") return "light";
    const saved = window.localStorage.getItem("jc-theme");
    return saved === "dark" ? "dark" : "light";
  });
  const [sidebarOpen, setSidebarOpen]     = useState(false);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  // Persisted per-user UI preferences (synced via Lovable Cloud).
  const {
    sidebarCollapsed,
    rightCollapsed,
    setSidebarCollapsed,
    setRightCollapsed,
  } = useUiPreferences();
  const [isRecording, setIsRecording]     = useState(false);
  const [shortcutAnnouncement, setShortcutAnnouncement] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef    = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, thinking]);
  useEffect(() => {
    localStorage.setItem("jc-theme", theme);
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-theme", theme);
      document.documentElement.classList.toggle("dark", theme === "dark");
    }
  }, [theme]);

  // System health: online if no agents in alert state and no fatal alerts
  const systemOnline = !AGENTS.some(a => a.status === "alert") && !ALERTS.some(a => a.type === "fatal");

  const toggleTheme = () => setTheme(t => (t === "dark" ? "light" : "dark"));

  // Toggle helpers with tracking + a11y live-region announcement.
  const announce = (msg: string) => {
    setShortcutAnnouncement(msg);
    window.setTimeout(() => setShortcutAnnouncement(""), 1500);
  };

  const handleSidebarToggle = (source: "click" | "keyboard" = "click") => {
    setSidebarCollapsed(prev => {
      const next = !prev;
      trackUiEvent("sidebar_toggle", {
        surface: "left_sidebar",
        collapsed: next,
        source,
      });
      announce(next ? "Menu lateral recolhido" : "Menu lateral expandido");
      return next;
    });
  };

  const handleRightToggle = (source: "click" | "keyboard" = "click") => {
    setRightCollapsed(prev => {
      const next = !prev;
      trackUiEvent("right_panel_toggle", {
        surface: "right_panel",
        collapsed: next,
        source,
      });
      announce(next ? "Painel de operações recolhido" : "Painel de operações expandido");
      return next;
    });
  };

  // Keyboard shortcuts: Ctrl/Cmd+B (sidebar), Ctrl/Cmd+O (right panel).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      // Skip when typing in inputs/textareas/contenteditable
      const tag = target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || target?.isContentEditable) return;

      const mod = e.ctrlKey || e.metaKey;
      if (!mod || e.altKey) return;

      const key = e.key.toLowerCase();
      if (key === "b") {
        e.preventDefault();
        trackUiEvent("shortcut_used", { target_id: "ctrl+b", surface: "left_sidebar" });
        handleSidebarToggle("keyboard");
      } else if (key === "o") {
        e.preventDefault();
        trackUiEvent("shortcut_used", { target_id: "ctrl+o", surface: "right_panel" });
        handleRightToggle("keyboard");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  // Voice input
  const toggleRecording = () => {
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      return;
    }
    const w = window as Window & {
      SpeechRecognition?: new () => SpeechRecognition;
      webkitSpeechRecognition?: new () => SpeechRecognition;
    };
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SR) return;
    const recognition = new SR();
    recognition.lang = "pt-BR";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (e: SpeechRecognitionEvent) => {
      const transcript = e.results[0][0].transcript;
      setInputVal(prev => prev + (prev ? " " : "") + transcript);
    };
    recognition.onend = () => setIsRecording(false);
    recognition.onerror = () => setIsRecording(false);
    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
  };

  const handleSend = async (text?: string) => {
    const val = (text || inputVal).trim();
    if (!val) return;
    const { cost, label } = getTokenCost(val);

    // Idempotency reference for this request — used to tie charge and refund.
    const requestId = (typeof crypto !== "undefined" && "randomUUID" in crypto)
      ? crypto.randomUUID()
      : `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    const charged = await consumeTokensWithRef(cost, `${label}: ${val.slice(0, 50)}`, requestId);
    if (!charged) {
      setMessages(prev => [...prev, {
        id: Date.now(),
        role: "assistant",
        agent: "Sistema",
        content: `Saldo insuficiente. Este comando custa **${cost} token(s)** (${label}). Recarregue seus tokens para continuar.`,
        timestamp: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      }]);
      return;
    }

    const userMsg = { id: Date.now(), role: "user", content: val, timestamp: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) };
    setMessages(prev => [...prev, userMsg]);
    setInputVal("");
    setThinking(true);

    // Helper: refund + show a friendly system message.
    const refundAndNotify = async (reason: string) => {
      await refundTokens(cost, requestId, `Estorno automatico: ${reason}`);
      setThinking(false);
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        role: "assistant",
        agent: "Sistema",
        content: `Nao consegui processar sua solicitacao agora (${reason}). Os **${cost} token(s)** foram estornados ao seu saldo.`,
        timestamp: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      }]);
    };

    try {
      // 1. Garante que há um agente configurado pra responder
      if (!entryAgentId) {
        await refundAndNotify(
          "nenhum agente com IA configurada — vá em /admin/agentes, escolha o CEO JurisAI (ou outro), na aba Modelo configure provedor + modelo, e salve",
        );
        return;
      }

      // 2. Cria sessão sob demanda na primeira mensagem do "Meu Assistente"
      let sid = assistantSessionId;
      if (!sid) {
        const { sessionId, error: startErr } = await startSession(entryAgentId, { title: "Meu Assistente" });
        if (!sessionId) {
          await refundAndNotify(friendlyError(startErr));
          return;
        }
        setAssistantSessionId(sessionId);
        sid = sessionId;
      }

      // 3. Envia ao chat-orchestrator (mesmo backend de /sistema/chat)
      const { response, error: sendErr } = await orchestratorSend(sid, val);
      if (!response || !response.content) {
        await refundAndNotify(
          friendlyError(sendErr ?? { error: "request_failed", message: "agente nao respondeu" }),
        );
        return;
      }

      setThinking(false);
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        role: "assistant",
        agent: response.agent?.name || "Assistente",
        content: response.content,
        meta: {
          requestId,
          tokensCost: cost,
          orchestration: {
            agent: response.agent?.name,
            model: response.model,
            provider: response.provider,
            durationMs: response.durationMs,
            costUsd: response.usage?.costUsd,
          },
        },
        timestamp: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      }]);
    } catch (e: unknown) {
      await refundAndNotify(e instanceof Error ? e.message : "erro de rede");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const activeDeptData = DEPARTMENTS.find(d => d.id === activeDept);

  // Filter departments by role
  const visibleDepts = DEPARTMENTS.filter(d => canAccessDepartment(d.id));
  // Filter commands by role
  const visibleCommands = ALL_COMMANDS.filter(c => canSeeCommand(c));
  // Filter agents by role + department
  const visibleAgents = (() => {
    const deptAgents = activeDept === "assistente" ? AGENTS : getAgentsForDepartment(AGENTS, activeDept);
    return deptAgents.filter(a => canSeeAgentRole(a.role)).slice(0, visibility.maxAgentsShown);
  })();

  const DeptIcon = DEPT_ICONS[activeDept] || Sparkles;

  // Menu items config
  const MENU_ITEMS = [
    { id: "clientes", label: "Clientes", icon: Users, color: ACCENT, action: () => navigate("/clientes"), show: canSeeMenuItem("clientes") && canAccessClients },
    { id: "admin", label: "Administração", icon: Crown, color: ACCENT_SOFT, action: () => navigate("/admin"), show: canSeeMenuItem("admin") && canAccessAdmin },
    { id: "dashboard", label: "Dashboard", icon: BarChart3, color: ACCENT, action: () => navigate("/dashboard"), show: canSeeMenuItem("dashboard") },
    { id: "organograma", label: "Organograma", icon: Network, color: ACCENT_SOFT, action: () => navigate("/organograma"), show: canSeeMenuItem("organograma") },
    { id: "eficiencia", label: "KPIs Eficiência", icon: Activity, color: ACCENT, action: () => navigate("/eficiencia"), show: canSeeMenuItem("eficiencia") },
    { id: "perfil", label: "Meu Perfil", icon: User, color: ACCENT_SOFT, action: () => navigate("/perfil"), show: canSeeMenuItem("perfil") },
    { id: "site", label: "Voltar ao Site", icon: Globe, color: ACCENT, action: () => navigate("/"), show: canSeeMenuItem("site") },
    { id: "sair", label: "Sair", icon: LogOut, color: "#FEFCE8", action: () => signOut(), show: canSeeMenuItem("sair") },
  ];

  const roleLabelsMap: Record<string, string> = {
    ceo: "CEO", director: "Diretor", orchestrator: "Orquestrador", manager: "Gerente",
    specialist: "Especialista", reviewer: "Revisor", executor: "Executor", monitor: "Monitor",
  };

  // Optional dim overlay when tooltips open on collapsed sidebar — improves
  // contrast/legibility. Opt-in via localStorage flag (`jc-tooltip-overlay`).
  const [openTooltipCount, setOpenTooltipCount] = useState(0);
  const [tooltipOverlay] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("jc-tooltip-overlay") === "1";
  });

  // Wrap in tooltip when sidebar is collapsed (desktop). Plain element otherwise.
  // - Tracks tooltip_open
  // - Closes on Escape (Radix default behavior when trigger has focus)
  // - Returns focus to the trigger automatically (Radix default), so Tab order is preserved.
  const withTooltip = (
    label: string,
    node: React.ReactElement,
    targetId?: string,
    opts?: { side?: "right" | "left" | "top" | "bottom"; surface?: string; alwaysOn?: boolean }
  ) => {
    const enabled = opts?.alwaysOn || sidebarCollapsed;
    if (!enabled) return node;
    const side = opts?.side ?? "right";
    const surface = opts?.surface ?? "left_sidebar";
    return (
      <Tooltip
        key={targetId}
        delayDuration={150}
        onOpenChange={(open) => {
          setOpenTooltipCount((n) => Math.max(0, n + (open ? 1 : -1)));
          if (open) {
            trackUiEvent("tooltip_open", {
              surface,
              target_id: targetId,
              target_label: label,
            });
          }
        }}
      >
        <TooltipTrigger asChild>{node}</TooltipTrigger>
        <TooltipContent
          side={side}
          sideOffset={8}
          onEscapeKeyDown={(e) => {
            // Radix already closes the tooltip; we keep focus on the trigger.
            e.preventDefault();
          }}
        >
          {label}
        </TooltipContent>
      </Tooltip>
    );
  };

  return (
    <div data-theme={theme}>
      <GlobalStyles theme={theme} />
      <TooltipProvider delayDuration={150}>
      <div className="jc-root">
        {/* MOBILE OVERLAY */}
        <div className={`jc-sidebar-overlay ${sidebarOpen ? "visible" : ""}`} onClick={() => setSidebarOpen(false)} />

        {/* Optional dim overlay when collapsed-sidebar tooltips are open (a11y) */}
        {tooltipOverlay && openTooltipCount > 0 && (
          <div className="jc-tooltip-overlay" aria-hidden="true" />
        )}
        {/* SIDEBAR */}
        <aside
          id="jc-sidebar"
          className={`jc-sidebar ${sidebarOpen ? "mobile-open" : ""} ${sidebarCollapsed ? "collapsed" : ""}`}
          aria-label="Menu lateral de navegação"
        >
          <div className="jc-sidebar-body">
          <div className="jc-logo" title={systemOnline ? "JurisAI — sistema ativo" : "JurisAI — sistema inativo"}>
            <div className="jc-logo-mark">J</div>
            <div className="jc-logo-info">
              <div className={`jc-logo-text ${systemOnline ? "online" : "offline"}`}>JurisAI</div>
              <div className="jc-logo-sub">{systemOnline ? "Operacional · 24/7" : "Atenção · alertas ativos"}</div>
            </div>
          </div>

          <div className="jc-search">
            <Search size={14} style={{ color: "var(--text3)", flexShrink: 0 }} />
            <input
              placeholder="Buscar processo, cliente..."
              value={sidebarSearch}
              onChange={e => setSidebarSearch(e.target.value)}
              aria-label="Buscar processo ou cliente"
            />
          </div>

          <nav className="jc-nav" aria-label="Departamentos e sistema">
            <div className="jc-section-label">Departamentos</div>
            {visibleDepts.map(dept => {
              const Icon = DEPT_ICONS[dept.id] || Sparkles;
              const activate = (source: "click" | "keyboard") => {
                setActiveDept(dept.id);
                setSidebarOpen(false);
                trackUiEvent("nav_click", {
                  surface: "left_sidebar",
                  target_id: dept.id,
                  target_label: dept.label,
                  source,
                  collapsed: sidebarCollapsed,
                });
              };
              return withTooltip(dept.label,
                <div
                  key={dept.id}
                  className={`jc-nav-item ${activeDept === dept.id ? "active" : ""}`}
                  onClick={() => activate("click")}
                  role="button"
                  tabIndex={0}
                  aria-current={activeDept === dept.id ? "page" : undefined}
                  onFocus={(e) => {
                    // Track keyboard navigation only — ignore programmatic/mouse focus.
                    if ((e.nativeEvent as FocusEvent & { sourceCapabilities?: unknown }).sourceCapabilities === null
                      || e.target.matches(":focus-visible")) {
                      trackUiEvent("tab_navigate", {
                        surface: "left_sidebar",
                        target_id: dept.id,
                        target_label: dept.label,
                        collapsed: sidebarCollapsed,
                      });
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      trackUiEvent("key_activate", {
                        surface: "left_sidebar",
                        target_id: dept.id,
                        target_label: dept.label,
                        source: "keyboard",
                      });
                      activate("keyboard");
                    }
                  }}
                >
                  <Icon size={16} style={{ color: dept.color, flexShrink: 0 }} />
                  <span className="jc-nav-label">{dept.label}</span>
                  {dept.badge > 0 && <span className={`jc-nav-badge ${dept.badge >= 8 ? "alert" : ""}`}>{dept.badge}</span>}
                </div>,
                dept.id
              );
            })}

            <div className="jc-section-label" style={{ marginTop: 8 }}>Sistema</div>
            {MENU_ITEMS.filter(m => m.show).map(item => {
              const activate = (source: "click" | "keyboard") => {
                trackUiEvent("nav_click", {
                  surface: "left_sidebar",
                  target_id: item.id,
                  target_label: item.label,
                  source,
                  collapsed: sidebarCollapsed,
                });
                item.action();
              };
              return withTooltip(item.label,
                <div
                  key={item.id}
                  className="jc-nav-item"
                  onClick={() => activate("click")}
                  role="button"
                  tabIndex={0}
                  onFocus={(e) => {
                    if (e.target.matches(":focus-visible")) {
                      trackUiEvent("tab_navigate", {
                        surface: "left_sidebar",
                        target_id: item.id,
                        target_label: item.label,
                        collapsed: sidebarCollapsed,
                      });
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      trackUiEvent("key_activate", {
                        surface: "left_sidebar",
                        target_id: item.id,
                        target_label: item.label,
                        source: "keyboard",
                      });
                      activate("keyboard");
                    }
                  }}
                >
                  <item.icon size={16} style={{ color: item.color, flexShrink: 0 }} />
                  <span className="jc-nav-label">{item.label}</span>
                </div>,
                item.id
              );
            })}
          </nav>

          {/* Agents in sidebar - filtered by role */}
          <div className="jc-agents-section" aria-label="Agentes ativos">
            <div className="jc-section-label">Agentes ({visibleAgents.length})</div>
            {visibleAgents.map(agent => {
              const statusLabel = agent.status === "active" ? "ativo" : agent.status === "alert" ? "em alerta" : "inativo";
              const dotActive = "#EAB308";
              const dotAlert = "#FACC15";
              const dotIdle = "rgba(255,255,255,0.28)";
              const fill = agent.status === "active" ? dotActive : agent.status === "alert" ? dotAlert : dotIdle;
              return (
                <DropdownMenu
                  key={agent.uuid ?? `ext-${agent.id}`}
                  onOpenChange={(open) => {
                    if (open) {
                      trackUiEvent("nav_click", {
                        surface: "left_sidebar",
                        target_id: `agent_menu_${agent.id}`,
                        target_label: agent.name,
                        collapsed: sidebarCollapsed,
                      });
                    }
                  }}
                >
                  {withTooltip(
                    `${agent.name} — ${statusLabel}`,
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="jc-agent-item"
                        aria-label={`${agent.name} (${statusLabel}). Abrir opções.`}
                      >
                        <div className="jc-agent-avatar" style={{ background: `${agent.color}18`, color: agent.color, border: `1px solid ${agent.color}25` }}>
                          {getInitials(agent.name)}
                        </div>
                        <div className="jc-agent-name">{agent.name}</div>
                        <Circle size={6} className="jc-agent-status-dot" fill={fill} style={{ color: fill }} />
                      </button>
                    </DropdownMenuTrigger>,
                    `agent_${agent.id}`
                  )}
                  <DropdownMenuContent
                    side="right"
                    align="start"
                    sideOffset={10}
                    className={cn(
                      "min-w-[220px] border border-neutral-800 bg-neutral-950 text-neutral-100 shadow-2xl",
                      "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
                      "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=right]:slide-in-from-left-2"
                    )}
                  >
                    <DropdownMenuItem
                      className="cursor-pointer gap-2 focus:bg-yellow-500/15 focus:text-yellow-50"
                      onSelect={() => {
                        if (!hasRole("admin")) {
                          toast.error("Apenas administradores podem configurar agentes.");
                          return;
                        }
                        if (!agent.uuid) {
                          toast.error("Aguarde a sincronização dos agentes com o servidor.");
                          return;
                        }
                        navigate(`/admin/agentes/${agent.uuid}`);
                      }}
                    >
                      <Settings size={14} className="opacity-80 shrink-0" />
                      Configurar agente
                    </DropdownMenuItem>
                    <DropdownMenuSeparator className="bg-neutral-800" />
                    <DropdownMenuItem
                      className="cursor-pointer gap-2 focus:bg-yellow-500/15 focus:text-yellow-50"
                      onSelect={() => navigate("/organograma")}
                    >
                      <Network size={14} className="opacity-80 shrink-0" />
                      Ver no organograma
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              );
            })}
          </div>
          </div>
        </aside>

        {/* MAIN */}
        <main className="jc-main">
          <header className="jc-topbar">
            <button type="button" className="jc-hamburger" onClick={() => setSidebarOpen(true)} aria-label="Abrir menu">
              <Menu size={20} />
            </button>
            <div className="jc-topbar-brand">
              <div className="jc-dept-title" style={{ color: activeDeptData?.color }}>
                <DeptIcon size={20} className="jc-dept-icon" aria-hidden />
                <span className="jc-dept-title-text">{activeDeptData?.label}</span>
              </div>
              <div className="jc-dept-sub">Sistema Operacional</div>
            </div>
            <div className="jc-topbar-trailing">
              {visibility.showAlertChips && ALERTS.slice(0, 2).map((a, i) => (
                <div key={i} className={`jc-alert-chip ${a.type}`}>
                  <AlertIcon type={a.type} />
                  <span>{a.text.slice(0, 28)}...</span>
                </div>
              ))}

              <NotificationCenter />

              <button type="button" onClick={() => navigate("/tokens")} title="Meus Tokens"
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 20,
                  background: "rgba(234,179,8,0.12)", border: "1px solid rgba(234,179,8,0.28)", cursor: "pointer", color: "#FACC15", fontSize: 12, fontWeight: 600, fontFamily: "var(--font-body)", flexShrink: 0 }}>
                <Coins size={14} />
                {tokenBalance.balance.toLocaleString()}
              </button>

              <button type="button" className="jc-theme-toggle" onClick={toggleTheme} title="Alternar tema"
                aria-label={`Alternar para tema ${theme === "dark" ? "claro" : "escuro"}`}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 12px", borderRadius: 20,
                  background: "var(--bg3)", border: "1px solid var(--border)", cursor: "pointer", color: "var(--text2)",
                  fontSize: 12, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", flexShrink: 0 }}>
                {theme === "dark" ? "Claro" : "Escuro"}
              </button>

              <button type="button" className="jc-right-toggle" onClick={() => setRightPanelOpen(!rightPanelOpen)}>
                {rightPanelOpen ? <><PanelRightClose size={14} /> Fechar</> : <><PanelRightOpen size={14} /> Operações</>}
              </button>

              <div className="jc-user-chip" onClick={() => navigate("/perfil")} title="Meu Perfil" role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate("/perfil"); } }}>
                <div className="jc-user-avatar">{(user?.email || "U")[0].toUpperCase()}</div>
                <div className="jc-user-name">{user?.user_metadata?.display_name || user?.email?.split("@")[0] || "Usuário"}</div>
                {userRoles.length > 0 && (
                  <span style={{ fontSize: 8, padding: "1px 5px", borderRadius: 3, background: "rgba(234,179,8,0.15)", color: "#FACC15", textTransform: "uppercase", fontFamily: "var(--font-body)" }}>
                    {userRoles[0]}
                  </span>
                )}
              </div>
            </div>
          </header>

          {!entryAgentId && !agentsLoading && !showWelcome && (
            <div className="jc-onboarding-banner" role="status">
              <AlertCircle size={18} style={{ flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong>Configure um agente antes da primeira mensagem.</strong>
                <span style={{ display: "block", fontSize: 12, color: "var(--text3)", marginTop: 2 }}>
                  Cadastre sua chave em Configurações → Provedores, depois vá em Admin → Agentes e ative provedor + modelo no CEO JurisAI.
                </span>
              </div>
              <button
                type="button"
                onClick={() => navigate("/configuracoes/providers")}
                className="jc-onboarding-cta"
              >
                Configurar agora
              </button>
            </div>
          )}

          {/* CONTENT */}
          {showWelcome ? (
            <div className="jc-messages"><WelcomeScreen onDismiss={() => setShowWelcome(false)} /></div>
          ) : (
            <div className="jc-messages">
              {messages.map(msg => <MessageBubble key={msg.id} msg={msg} />)}
              {thinking && <ThinkingBubble agent={AGENTS[Math.floor(Math.random() * 5)].name} />}
              <div ref={messagesEndRef} />
            </div>
          )}

          {/* INPUT */}
          <div className="jc-input-area">
            <div className="jc-commands">
              {visibleCommands.map((cmd, i) => {
                const { cost } = getTokenCost(cmd);
                return (
                  <button key={i} className="jc-cmd" onClick={() => handleSend(cmd)} title={`Custo: ${cost} token(s)`}>
                    <ChevronRight size={10} /> {cmd} <span style={{ opacity: 0.5, fontSize: 9, marginLeft: 4 }}>({cost}t)</span>
                  </button>
                );
              })}
            </div>
            <div className="jc-input-row">
              <textarea ref={textareaRef} className="jc-textarea"
                placeholder={`Fale com os agentes do ${activeDeptData?.label || "departamento"}...`}
                value={inputVal}
                onChange={e => { setInputVal(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px"; }}
                onKeyDown={handleKeyDown} rows={1} />
              <button className={`jc-mic-btn ${isRecording ? "recording" : ""}`} onClick={toggleRecording} title={isRecording ? "Parar gravação" : "Falar"}>
                {isRecording ? <MicOff size={16} /> : <Mic size={16} />}
              </button>
              <button className="jc-send-btn" onClick={() => handleSend()} disabled={thinking || !inputVal.trim()}>
                <Send size={16} />
              </button>
            </div>
            <div className="jc-input-hint">
              {isReadOnly && <span style={{ color: "#EAB308", marginRight: 8, display: "inline-flex", alignItems: "center", gap: 3 }}><Lock size={10} /> Modo leitura ({roleLabel})</span>}
              Enter para enviar · Shift+Enter para nova linha
            </div>
          </div>
        </main>

        {/* RIGHT PANEL */}
        <aside
          id="jc-right-panel"
          className={`jc-right-panel ${rightPanelOpen ? "mobile-visible" : ""} ${rightCollapsed ? "collapsed" : ""}`}
          aria-label="Central de operações"
        >
          <div className="jc-right-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>Central de Operações</span>
          </div>
          <div className="jc-right-tabs">
            {[
              { id: "filas", label: "Filas", icon: ListTodo },
              { id: "processos", label: "Processos", icon: FileText },
              { id: "alertas", label: "Alertas", icon: AlertTriangle },
              { id: "agentes", label: "Agentes", icon: Zap },
            ].map(tab => (
              <div key={tab.id} className={`jc-right-tab ${rightTab === tab.id ? "active" : ""}`} onClick={() => setRightTab(tab.id)}>
                <tab.icon size={12} /> {tab.label}
              </div>
            ))}
          </div>
          <div className="jc-right-body">
            {rightTab === "filas" && <TaskQueuesPanel />}

            {rightTab === "processos" && (
              <>
                <div style={{ fontSize: 10, color: "var(--text3)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>
                  {PROCESSES.length} processos ativos
                </div>
                {PROCESSES.map(p => (
                  <div className="jc-case-card" key={p.id}>
                    <div className="jc-case-num">Proc. #{p.id} · {p.tribunal}</div>
                    <div className="jc-case-name">{p.client}</div>
                    <div className="jc-case-row">
                      <span style={{
                        fontSize: 10, padding: "2px 7px", borderRadius: 4,
                        ...getCaseAreaChip(p.area),
                      }}>{p.area}</span>
                      <span style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "#FACC15", fontWeight: 600 }}>{p.value}</span>
                    </div>
                    <div className="jc-case-prazo-row">
                      <span style={{ color: p.prazo === "HOJE" ? "#FACC15" : "var(--text3)", display: "flex", alignItems: "center", gap: 3 }}>
                        {p.prazo === "HOJE" ? <><AlertTriangle size={10} /> Prazo HOJE</> : <>Prazo em {p.prazo}</>}
                      </span>
                      <div style={{ flex: 1 }} />
                      <span className={`jc-process-badge ${p.status}`}>{p.status}</span>
                    </div>
                  </div>
                ))}
              </>
            )}

            {rightTab === "alertas" && (
              <>
                <div style={{ fontSize: 10, color: "var(--text3)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>
                  {ALERTS.length} alertas
                </div>
                {ALERTS.map((a, i) => (
                  <div key={i} className={`jc-alert-item ${a.type}`}>
                    <AlertIcon type={a.type} />
                    <div className="jc-alert-text">{a.text}</div>
                    <div className="jc-alert-time">{a.time}</div>
                  </div>
                ))}
              </>
            )}

            {rightTab === "agentes" && (() => {
              const capacity = getTotalCapacity(AGENTS);
              return (
                <>
                  {visibility.showCapacityPanel && (
                    <div style={{ fontSize: 10, color: "var(--text2)", marginBottom: 8, padding: 8, background: "var(--bg4)", borderRadius: 6, border: "1px solid var(--border)" }}>
                      <div style={{ marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
                        <BarChart3 size={12} /> Capacidade: {capacity.used}/{capacity.total} ({capacity.percentage}%)
                      </div>
                      <div style={{ background: "var(--bg)", borderRadius: 4, height: 6, overflow: "hidden" }}>
                        <div style={{ width: `${capacity.percentage}%`, height: "100%", borderRadius: 4, background: capacity.percentage > 80 ? "#CA8A04" : capacity.percentage > 50 ? "#EAB308" : "#FACC15", transition: "width 0.55s var(--panel-ease)" }} />
                      </div>
                    </div>
                  )}
                  <div style={{ fontSize: 10, color: "var(--gold)", marginBottom: 8 }}>
                    {visibleAgents.length} agentes visíveis
                  </div>
                  {visibleAgents.map(agent => {
                    const load = getAgentLoad(agent);
                    const RoleIcon = ROLE_ICONS[agent.role] || Zap;
                    return (
                      <div key={agent.id} className="jc-agent-card-rp">

                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                          <div style={{
                            width: 36, height: 36, borderRadius: 9,
                            background: `${agent.color}18`, color: agent.color,
                            border: `1px solid ${agent.color}25`,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 11, fontWeight: 700, fontFamily: "var(--font-body)", flexShrink: 0
                          }}>{getInitials(agent.name)}</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text1)", marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{agent.name}</div>
                            <div style={{ fontSize: 9, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.08em", display: "flex", alignItems: "center", gap: 4 }}>
                              <RoleIcon size={10} /> {roleLabelsMap[agent.role] || agent.role}
                            </div>
                          </div>
                          <Circle size={8}
                            fill={agent.status === "active" ? "#EAB308" : agent.status === "alert" ? "#FACC15" : "rgba(255,255,255,0.28)"}
                            style={{ color: agent.status === "active" ? "#EAB308" : agent.status === "alert" ? "#FACC15" : "rgba(255,255,255,0.28)" }} />
                        </div>
                        <div style={{ background: "var(--bg)", borderRadius: 4, height: 4, marginBottom: 6, overflow: "hidden" }}>
                          <div style={{ width: `${load}%`, height: "100%", borderRadius: 4, background: load > 80 ? "#CA8A04" : load > 50 ? "#EAB308" : "#FACC15", transition: "width 0.55s var(--panel-ease)" }} />
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: 9, color: "var(--text3)" }}>Carga: {load}% · {agent.currentTasks}/{agent.maxConcurrentTasks}</span>
                        </div>
                      </div>
                    );
                  })}
                </>
              );
            })()}
          </div>
        </aside>

        {rightPanelOpen && (
          <div style={{ position: "fixed", inset: 0, zIndex: 45, background: "rgba(0,0,0,0.4)" }} onClick={() => setRightPanelOpen(false)} aria-hidden="true" />
        )}

        {/* TOGGLES — fora dos painéis para escapar overflow:hidden e ficarem sempre visíveis */}
        {withTooltip("Ctrl+B",
          <button
            className={`jc-sidebar-toggle ${sidebarCollapsed ? "is-collapsed" : ""}`}
            onClick={() => handleSidebarToggle("click")}
            aria-label={sidebarCollapsed ? "Expandir menu" : "Recolher menu"}
            aria-expanded={!sidebarCollapsed}
            aria-controls="jc-sidebar"
            aria-keyshortcuts="Control+B Meta+B"
            type="button"
          >
            <span className="jc-toggle-arrow" aria-hidden>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </span>
          </button>
        , "sidebar_toggle_btn")}

        {withTooltip("Ctrl+O",
          <button
            className={`jc-right-toggle-desk ${rightCollapsed ? "is-collapsed" : ""}`}
            onClick={() => handleRightToggle("click")}
            aria-label={rightCollapsed ? "Expandir painel" : "Recolher painel"}
            aria-expanded={!rightCollapsed}
            aria-controls="jc-right-panel"
            aria-keyshortcuts="Control+O Meta+O"
            type="button"
          >
            <span className="jc-toggle-arrow" aria-hidden>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </span>
          </button>,
          "right_panel_toggle_btn",
          { side: "left", surface: "right_panel", alwaysOn: true }
        )}

        {/* Live region for keyboard shortcut announcements (visually hidden, screen reader only) */}
        <div className="jc-sr-only" role="status" aria-live="polite" aria-atomic="true">
          {shortcutAnnouncement}
        </div>
      </div>
      </TooltipProvider>
    </div>
  );
}
