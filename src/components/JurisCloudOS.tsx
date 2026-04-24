import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { useRealtimeNotifications } from "@/hooks/useRealtimeNotifications";
import { useBottleneckDetection } from "@/hooks/useBottleneckDetection";
import { useTokenBalance } from "@/hooks/useTokenBalance";
import TaskQueuesPanel from "@/components/TaskQueuesPanel";
import WelcomeScreen from "@/components/WelcomeScreen";
import { NotificationCenter } from "@/components/NotificationCenter";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
  PanelLeftOpen, PanelLeftClose, Circle,
} from "lucide-react";

/* ─────────────────────────────────────────────────────────────
   LEXFORCE  –  Sua força de trabalho de IA jurídica
───────────────────────────────────────────────────────────── */

// ── Icon map for departments ──
const DEPT_ICONS: Record<string, React.ComponentType<any>> = {
  assistente: Sparkles, diretoria: Crown, eficiencia: Brain, conversao: RefreshCw,
  recepcao: Building2, marketing: Megaphone, criacao: Palette, civel: Scale,
  trabalhista: HardHat, tributario: Coins, protocolo: ClipboardList,
  calculos: Calculator, audiencias: Landmark, monitoramento: Eye,
  financeiro: DollarSign, cobrancas: CreditCard, tech: Settings,
  compliance: Shield, familia: Heart,
};

const ROLE_ICONS: Record<string, React.ComponentType<any>> = {
  ceo: Crown, director: Briefcase, orchestrator: Target, manager: ClipboardList,
  specialist: Microscope, reviewer: CheckCircle, executor: Zap, monitor: Radio,
};

const DEPARTMENTS = [
  { id: "assistente",    label: "Meu Assistente",          color: "#c9a84c", badge: 8  },
  { id: "diretoria",     label: "Diretoria / CEO",         color: "#c9a84c", badge: 0  },
  { id: "eficiencia",    label: "Central de Eficiência",    color: "#ff6b6b", badge: 5  },
  { id: "conversao",     label: "Conversão",                color: "#e74c3c", badge: 7  },
  { id: "recepcao",      label: "Recepção",                 color: "#3b82f6", badge: 6  },
  { id: "marketing",     label: "Marketing",                color: "#f59e0b", badge: 5  },
  { id: "criacao",       label: "Criação",                  color: "#e67e22", badge: 4  },
  { id: "civel",         label: "Contencioso Cível",        color: "#8b5cf6", badge: 12 },
  { id: "trabalhista",   label: "Contencioso Trabalhista",  color: "#ef4444", badge: 7  },
  { id: "tributario",    label: "Contencioso Tributário",    color: "#10b981", badge: 4  },
  { id: "protocolo",     label: "Protocolo",                color: "#6366f1", badge: 9  },
  { id: "calculos",      label: "Cálculos Jurídicos",       color: "#ec4899", badge: 3  },
  { id: "audiencias",    label: "Audiências",               color: "#14b8a6", badge: 11 },
  { id: "monitoramento", label: "Monitoramento Processual", color: "#f97316", badge: 15 },
  { id: "financeiro",    label: "Financeiro",               color: "#2ecc71", badge: 6  },
  { id: "cobrancas",     label: "Cobranças",                color: "#84cc16", badge: 2  },
  { id: "tech",          label: "Tecnologia",               color: "#9b59b6", badge: 3  },
  { id: "compliance",    label: "Compliance",               color: "#0ea5e9", badge: 1  },
  { id: "familia",       label: "Família e Sucessões",      color: "#a855f7", badge: 3  },
];

type AgentRole = "ceo" | "director" | "orchestrator" | "manager" | "specialist" | "reviewer" | "executor" | "monitor";
type AgentPermission = "read" | "write" | "approve" | "execute" | "admin" | "monitor" | "schedule" | "contact_client" | "protocol" | "calculate" | "review_calculation" | "petition" | "market_study";

interface Agent {
  id: number; name: string; status: "active" | "idle" | "alert";
  color: string; role: AgentRole; permissions: AgentPermission[];
  department: string[]; canOrchestrate: boolean;
  maxConcurrentTasks: number; currentTasks: number;
  description?: string; maxProcessesMonitored?: number; reportsTo?: number;
}

// Agents — avatars are now initials computed from name, no emojis
const AGENTS: Agent[] = [
  { id: 0, name: "CEO LexForce", status: "active", color: "#c9a84c", role: "ceo", permissions: ["read","write","approve","execute","admin"], department: ["*","diretoria"], canOrchestrate: true, maxConcurrentTasks: 20, currentTasks: 8, description: "Agente CEO — supervisiona todos os diretores e a operação global" },
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

function getAgentsForDepartment(deptId: string): Agent[] {
  return AGENTS.filter(a => a.department.includes("*") || a.department.includes(deptId));
}
function getAgentLoad(agent: Agent): number {
  return Math.round((agent.currentTasks / agent.maxConcurrentTasks) * 100);
}
function getAgentsByRole(role: AgentRole): Agent[] {
  return AGENTS.filter(a => a.role === role);
}
function getTotalCapacity() {
  const used = AGENTS.reduce((s, a) => s + a.currentTasks, 0);
  const total = AGENTS.reduce((s, a) => s + a.maxConcurrentTasks, 0);
  return { used, total, percentage: Math.round((used / total) * 100) };
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

const ALERTS = [
  { type: "fatal",   text: "Prazo fatal: caso #0023847 – Bancário",  time: "HOJE 17h" },
  { type: "warning", text: "4 clientes sem retorno há +48h",          time: "2h atrás"  },
  { type: "info",    text: "12 iniciais aguardam aprovação",          time: "Hoje"      },
  { type: "success", text: "Protocolo #0029991 confirmado no TJBA",  time: "09:42"     },
];

const INITIAL_MESSAGES = [
  {
    id: 1, role: "assistant", agent: "Meu Assistente",
    content: null,
    card: {
      type: "briefing",
      title: "Bom dia, Doutor(a)",
      summary: "Aqui está sua visão operacional de hoje",
      items: [
        { label: "Prazos críticos",      value: "3", accent: "#ef4444" },
        { label: "Revisões pendentes",    value: "12", accent: "#f59e0b" },
        { label: "Novos contratos",       value: "2", accent: "#2dd4a0" },
        { label: "Audiências esta semana",value: "7", accent: "#4f8ef7" },
        { label: "Leads qualificados",    value: "5", accent: "#c9a84c" },
        { label: "Protocolos em fila",   value: "9", accent: "#a78bfa" },
      ],
    },
    timestamp: "08:00",
  },
  {
    id: 2, role: "user", content: "Mostre os casos mais urgentes do bancário hoje", timestamp: "08:03",
  },
  {
    id: 3, role: "assistant", agent: "Pesquisador Jurídico",
    content: "Identifiquei **3 casos críticos** no departamento bancário. O caso #0023847 tem prazo fatal **hoje às 17h** para contestação.",
    card: { type: "process-list", processes: PROCESSES.filter(p => p.area === "Bancário" || p.area === "Cível") },
    timestamp: "08:03",
  },
];

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
    @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&family=DM+Sans:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --font-disp: 'Cormorant Garamond', Georgia, serif;
      --font-body: 'DM Sans', sans-serif;
      --font-mono: 'JetBrains Mono', monospace;
      --gold: #c9a84c; --gold2: #e8c96a;
      --blue: #4f8ef7; --teal: #2dd4a0; --purple: #a78bfa;
      --red: #ef4444; --amber: #f59e0b;
      --theme-transition: 0.4s cubic-bezier(0.4, 0, 0.2, 1);
    }
    [data-theme="dark"] {
      --bg: #09090f; --bg2: #111118; --bg3: #16161f; --bg4: #1d1d28;
      --border: #252534; --border2: #2e2e42;
      --card-border: rgba(255,255,255,0.14);
      --card-border-hover: rgba(255,255,255,0.24);
      --text1: #eeeef5; --text2: #9898b0; --text3: #5a5a72;
      --logo-text: #0a0a12;
      --user-bubble-bg: rgba(201,168,76,0.08); --user-bubble-border: rgba(201,168,76,0.2);
      --badge-bg: rgba(255,255,255,0.07);
    }
    [data-theme="light"] {
      --bg: #f5f5f7; --bg2: #ffffff; --bg3: #f0f0f4; --bg4: #e8e8ee;
      --border: #d8d8e0; --border2: #c8c8d4;
      --card-border: #d8d8e0;
      --card-border-hover: #b8b8c8;
      --text1: #1a1a2e; --text2: #5a5a72; --text3: #8888a0;
      --logo-text: #0a0a12;
      --user-bubble-bg: rgba(201,168,76,0.06); --user-bubble-border: rgba(201,168,76,0.25);
      --badge-bg: rgba(0,0,0,0.06);
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

    /* SIDEBAR */
    .jc-sidebar {
      width: 184px; min-width: 184px; background: var(--bg2);
      border-right: 1px solid var(--border);
      display: flex; flex-direction: column; overflow: hidden;
      transition: width 0.25s ease, min-width 0.25s ease, transform 0.3s ease;
      position: relative;
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

    .jc-sidebar-toggle {
      position: absolute; top: 18px; right: -12px; z-index: 10;
      width: 22px; height: 22px; border-radius: 50%;
      background: var(--bg3); border: 1px solid var(--border2);
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; color: var(--text2); transition: all 0.15s;
      box-shadow: 0 2px 6px rgba(0,0,0,0.18);
    }
    .jc-sidebar-toggle:hover { color: var(--gold); border-color: rgba(201,168,76,0.4); }
    .jc-sidebar-toggle:focus-visible,
    .jc-right-toggle-desk:focus-visible,
    .jc-nav-item:focus-visible,
    .jc-agent-item:focus-visible {
      outline: 2px solid var(--gold);
      outline-offset: 2px;
      box-shadow: 0 0 0 4px rgba(201,168,76,0.18);
    }
    .jc-sr-only {
      position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
      overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0;
    }

    .jc-logo {
      padding: 18px 14px 14px; border-bottom: 1px solid var(--border);
      display: flex; align-items: center; gap: 10px;
    }
    .jc-logo-mark {
      width: 30px; height: 30px;
      background: linear-gradient(135deg, var(--gold), var(--gold2));
      border-radius: 8px; display: flex; align-items: center; justify-content: center;
      font-size: 15px; font-weight: 700; color: var(--logo-text);
      font-family: var(--font-disp); box-shadow: 0 0 14px rgba(201,168,76,0.3);
      flex-shrink: 0;
    }
    .jc-logo-text {
      font-family: var(--font-disp); font-size: 17px; font-weight: 600;
      transition: color var(--theme-transition);
    }
    .jc-logo-text.online { color: #2dd4a0; text-shadow: 0 0 10px rgba(45,212,160,0.35); }
    .jc-logo-text.offline { color: #ef4444; text-shadow: 0 0 10px rgba(239,68,68,0.35); }
    .jc-logo-sub { font-size: 9px; color: var(--text3); letter-spacing: 0.12em; text-transform: uppercase; }

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
    .jc-nav-item.active { background: rgba(201,168,76,0.08); border: 1px solid rgba(201,168,76,0.15); }
    .jc-nav-label { font-size: 13px; font-weight: 400; color: var(--text1); flex: 1; }
    .jc-nav-badge {
      font-size: 10px; font-family: var(--font-mono);
      background: var(--badge-bg); border-radius: 10px;
      padding: 1px 7px; color: var(--text2); min-width: 22px; text-align: center;
    }
    .jc-nav-badge.alert { background: rgba(239,68,68,0.18); color: #ff8080; }

    .jc-agents-section { padding: 8px; border-top: 1px solid var(--border); }
    .jc-agent-item {
      display: flex; align-items: center; gap: 8px;
      padding: 6px 8px; border-radius: 6px; cursor: pointer; transition: background 0.15s;
    }
    .jc-agent-item:hover { background: var(--bg3); }
    .jc-agent-avatar {
      width: 26px; height: 26px; border-radius: 6px;
      display: flex; align-items: center; justify-content: center;
      font-size: 9px; font-weight: 700; font-family: var(--font-mono); flex-shrink: 0;
    }
    .jc-agent-name { font-size: 11px; color: var(--text2); flex: 1; line-height: 1.2; }

    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

    /* MAIN */
    .jc-main { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-width: 0; }
    .jc-topbar {
      height: 52px; min-height: 52px; background: var(--bg2);
      border-bottom: 1px solid var(--border);
      display: flex; align-items: center; padding: 0 20px; gap: 12px;
    }
    .jc-dept-title { font-family: var(--font-disp); font-size: 20px; font-weight: 600; color: var(--text1); }
    .jc-dept-sub { font-size: 11px; color: var(--text3); letter-spacing: 0.08em; text-transform: uppercase; }
    .jc-topbar-spacer { flex: 1; }
    .jc-alert-chip {
      display: flex; align-items: center; gap: 6px;
      padding: 5px 10px; border-radius: 20px; cursor: pointer;
      font-size: 11px; font-weight: 500; border: 1px solid; transition: opacity 0.15s;
    }
    .jc-alert-chip:hover { opacity: 0.8; }
    .jc-alert-chip.fatal { background: rgba(239,68,68,0.1); border-color: rgba(239,68,68,0.3); color: #ff8080; }
    .jc-alert-chip.warning { background: rgba(245,158,11,0.1); border-color: rgba(245,158,11,0.3); color: #fbbf24; }
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
      font-size: 11px; font-weight: 700; font-family: var(--font-mono);
    }
    .jc-msg-bubble {
      max-width: 75%; background: var(--bg3); border: 1px solid var(--border);
      border-radius: 12px; padding: 14px 16px; font-size: 14px; line-height: 1.7; color: var(--text1);
    }
    .jc-msg-wrap.user .jc-msg-bubble { background: var(--user-bubble-bg); border-color: var(--user-bubble-border); }
    .jc-msg-meta {
      font-size: 10px; color: var(--text3); margin-bottom: 4px;
      font-family: var(--font-mono); display: flex; align-items: center; gap: 6px;
    }
    .jc-msg-meta .agent-tag {
      font-size: 9px; padding: 2px 7px; border-radius: 4px;
      background: rgba(201,168,76,0.12); color: var(--gold); border: 1px solid rgba(201,168,76,0.2);
      font-family: var(--font-body); font-weight: 500;
    }
    .jc-msg-text b, .jc-msg-text strong { color: var(--gold2); font-weight: 600; }

    /* BRIEFING */
    .jc-card-briefing {
      background: linear-gradient(135deg, rgba(201,168,76,0.06), rgba(79,142,247,0.04));
      border: 1px solid rgba(201,168,76,0.2); border-radius: 14px; padding: 20px; margin-top: 2px;
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
    .jc-process-id { font-family: var(--font-mono); font-size: 10px; color: var(--text3); min-width: 72px; }
    .jc-process-client { font-size: 12.5px; font-weight: 500; flex: 1; color: var(--text1); }
    .jc-process-area { font-size: 10px; padding: 2px 8px; border-radius: 5px; }
    .jc-process-prazo { font-family: var(--font-mono); font-size: 10px; }
    .jc-process-badge {
      font-size: 9px; padding: 3px 8px; border-radius: 5px; font-weight: 600;
      text-transform: uppercase; letter-spacing: 0.06em;
    }
    .jc-process-badge.urgente { background: rgba(239,68,68,0.15); color: #ff8080; border: 1px solid rgba(239,68,68,0.25); }
    .jc-process-badge.normal { background: rgba(79,142,247,0.12); color: #93c5fd; border: 1px solid rgba(79,142,247,0.2); }
    .jc-process-badge.revisar { background: rgba(245,158,11,0.12); color: #fbbf24; border: 1px solid rgba(245,158,11,0.2); }
    .jc-process-value { font-family: var(--font-mono); font-size: 11px; color: var(--teal); min-width: 80px; text-align: right; }

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
    .jc-cmd:hover { background: rgba(201,168,76,0.08); border-color: rgba(201,168,76,0.25); color: var(--gold2); }
    .jc-input-row {
      display: flex; align-items: flex-end; gap: 10px;
      background: var(--bg3); border: 1px solid var(--border2);
      border-radius: 14px; padding: 10px 14px; transition: border-color 0.2s;
    }
    .jc-input-row:focus-within { border-color: rgba(201,168,76,0.4); }
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
    .jc-send-btn:hover { transform: scale(1.05); box-shadow: 0 0 16px rgba(201,168,76,0.4); }
    .jc-send-btn:disabled { opacity: 0.4; cursor: default; transform: none; }
    .jc-mic-btn {
      background: var(--bg4); color: var(--text2); border: 1px solid var(--border);
    }
    .jc-mic-btn:hover { border-color: var(--gold); color: var(--gold); }
    .jc-mic-btn.recording { background: rgba(239,68,68,0.15); border-color: var(--red); color: var(--red); animation: pulse 1s infinite; }
    .jc-input-hint { font-size: 10px; color: var(--text3); text-align: center; margin-top: 6px; }

    /* RIGHT PANEL */
    .jc-right-panel {
      width: 320px; min-width: 320px; background: var(--bg2);
      border-left: 1px solid var(--border); display: flex; flex-direction: column; overflow: hidden;
      transition: width 0.25s ease, min-width 0.25s ease;
      position: relative;
    }
    .jc-right-panel.collapsed { width: 0; min-width: 0; border-left: none; }
    .jc-right-panel.collapsed > *:not(.jc-right-toggle-desk) { display: none; }

    .jc-right-toggle-desk {
      position: absolute; top: 14px; left: -12px; z-index: 10;
      width: 22px; height: 22px; border-radius: 50%;
      background: var(--bg3); border: 1px solid var(--border2);
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; color: var(--text2); transition: all 0.15s;
      box-shadow: -2px 2px 6px rgba(0,0,0,0.18);
    }
    .jc-right-panel.collapsed .jc-right-toggle-desk {
      left: auto; right: 8px; position: fixed; top: 64px;
    }
    .jc-right-toggle-desk:hover { color: var(--gold); border-color: rgba(201,168,76,0.4); }

    .jc-right-header {
      padding: 16px 16px 12px; border-bottom: 1px solid var(--border);
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
    .jc-case-num { font-family: var(--font-mono); font-size: 10px; color: var(--text3); margin-bottom: 4px; }
    .jc-case-name { font-size: 13px; font-weight: 500; color: var(--text1); margin-bottom: 6px; }
    .jc-case-row { display: flex; justify-content: space-between; align-items: center; }
    .jc-case-prazo-row { display: flex; align-items: center; gap: 4px; font-size: 10px; color: var(--text3); margin-top: 6px; }

    .jc-alert-item {
      display: flex; gap: 10px; align-items: flex-start;
      padding: 10px; border-radius: 8px; margin-bottom: 6px; border: 1px solid; cursor: pointer;
    }
    .jc-alert-item.fatal { background: rgba(239,68,68,0.07); border-color: rgba(239,68,68,0.2); }
    .jc-alert-item.warning { background: rgba(245,158,11,0.07); border-color: rgba(245,158,11,0.2); }
    .jc-alert-item.info { background: rgba(79,142,247,0.07); border-color: rgba(79,142,247,0.2); }
    .jc-alert-item.success { background: rgba(45,212,160,0.07); border-color: rgba(45,212,160,0.2); }
    .jc-alert-text { font-size: 11.5px; color: var(--text1); line-height: 1.4; flex: 1; }
    .jc-alert-time { font-size: 9px; color: var(--text3); font-family: var(--font-mono); white-space: nowrap; }

    .jc-sidebar-overlay { display: none; position: fixed; inset: 0; z-index: 40; background: rgba(0,0,0,0.5); }
    .jc-sidebar-overlay.visible { display: block; }
    .jc-hamburger { display: none; background: none; border: none; cursor: pointer; color: var(--text1); padding: 4px; }
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
      .jc-topbar { padding: 0 12px; gap: 8px; }
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
function BriefingCard({ card }: { card: any }) {
  return (
    <div className="jc-card-briefing">
      <div className="jc-card-briefing-title">{card.title}</div>
      <div className="jc-card-briefing-sub">{card.summary}</div>
      <div className="jc-card-grid">
        {card.items.map((item: any, i: number) => (
          <div className="jc-kpi" key={i} style={{ borderLeftColor: item.accent, borderLeftWidth: 2 }}>
            <div className="jc-kpi-value" style={{ color: item.accent }}>{item.value}</div>
            <div className="jc-kpi-label">{item.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProcessListCard({ processes }: { processes: any[] }) {
  const areaColors: Record<string, string> = { "Bancário": "#2dd4a0", "Cível": "#a78bfa", "Previdência": "#f59e0b", "Contratos": "#4f8ef7" };
  return (
    <div className="jc-card-processes">
      {processes.map((p: any) => (
        <div className="jc-process-row" key={p.id}>
          <div className="jc-process-id">#{p.id}</div>
          <div className="jc-process-client">{p.client}</div>
          <div className="jc-process-area" style={{
            background: `${areaColors[p.area] || "#4f8ef7"}18`,
            color: areaColors[p.area] || "#4f8ef7",
            border: `1px solid ${areaColors[p.area] || "#4f8ef7"}30`
          }}>{p.area}</div>
          <div className="jc-process-prazo" style={{ color: p.prazo === "HOJE" ? "#ff8080" : "var(--text2)" }}>
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

function MessageBubble({ msg }: { msg: any }) {
  const agentColors: Record<string, string> = {
    "Meu Assistente": "#c9a84c", "Pesquisador Jurídico": "#2dd4a0",
    "Redator Processual": "#a78bfa", "Controlador de Prazos": "#ef4444",
  };
  const isUser = msg.role === "user";
  const color = agentColors[msg.agent] || "#4f8ef7";

  return (
    <div className={`jc-msg-wrap ${isUser ? "user" : ""}`}>
      <div className="jc-msg-avatar" style={{
        background: isUser ? "rgba(201,168,76,0.15)" : `${color}20`,
        color: isUser ? "#c9a84c" : color,
        border: `1px solid ${isUser ? "rgba(201,168,76,0.25)" : `${color}30`}`,
        fontFamily: isUser ? "'Cormorant Garamond', serif" : "var(--font-mono)",
        fontSize: isUser ? 14 : 11,
      }}>
        {isUser ? "U" : (msg.agent ? getInitials(msg.agent) : "AI")}
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
            <div className="jc-msg-text" dangerouslySetInnerHTML={{
              __html: msg.content.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
            }} />
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
      <div className="jc-msg-avatar" style={{ background: "rgba(201,168,76,0.1)", color: "#c9a84c", border: "1px solid rgba(201,168,76,0.2)", fontSize: 11 }}>
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
  if (type === "fatal") return <AlertTriangle size={size} style={{ color: "#ff8080" }} />;
  if (type === "warning") return <AlertCircle size={size} style={{ color: "#fbbf24" }} />;
  if (type === "success") return <CheckCircle size={size} style={{ color: "#6ee7b7" }} />;
  return <Info size={size} style={{ color: "#93c5fd" }} />;
}

// ── MAIN COMPONENT ───────────────────────────────────────────
export default function JurisCloudOS() {
  const navigate = useNavigate();
  const { user, userRoles, signOut } = useAuth();
  const { canAccessDepartment, canSeeCommand, canSeeMenuItem, canSeeAgentRole, canAccessAdmin, canAccessClients, isReadOnly, roleLabel, visibility } = usePermissions();
  useRealtimeNotifications();
  useBottleneckDetection();
  const { tokenBalance, consumeTokens } = useTokenBalance();

  const [showWelcome, setShowWelcome]     = useState(true);
  const [activeDept, setActiveDept]       = useState("assistente");
  const [messages, setMessages]           = useState<any[]>(INITIAL_MESSAGES);
  const [inputVal, setInputVal]           = useState("");
  const [thinking, setThinking]           = useState(false);
  const [rightTab, setRightTab]           = useState("processos");
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [theme, setTheme]                 = useState<Theme>(() => {
    if (typeof window !== "undefined") return (localStorage.getItem("jc-theme") as Theme) || "dark";
    return "dark";
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
  const recognitionRef = useRef<any>(null);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, thinking]);
  useEffect(() => { localStorage.setItem("jc-theme", theme); }, [theme]);

  // System health: online if no agents in alert state and no fatal alerts
  const systemOnline = !AGENTS.some(a => a.status === "alert") && !ALERTS.some(a => a.type === "fatal");

  const toggleTheme = () => setTheme(t => t === "dark" ? "light" : "dark");

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
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const recognition = new SR();
    recognition.lang = "pt-BR";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (e: any) => {
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
    const success = await consumeTokens(cost, `${label}: ${val.slice(0, 50)}`);
    if (!success) {
      setMessages(prev => [...prev, { id: Date.now(), role: "assistant", agent: "Sistema", content: `⚠️ **Saldo insuficiente.** Este comando custa **${cost} token(s)** (${label}). Recarregue seus tokens para continuar.`, timestamp: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) }]);
      return;
    }
    const userMsg = { id: Date.now(), role: "user", content: val, timestamp: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) };
    setMessages(prev => [...prev, userMsg]);
    setInputVal("");
    setThinking(true);
    setTimeout(() => {
      setThinking(false);
      const responses = [
        { agent: "Pesquisador Jurídico", content: "Encontrei **3 precedentes relevantes** no TJBA. O mais recente fortalece a tese de revisão contratual." },
        { agent: "Controlador de Prazos", content: "Detectei **2 prazos críticos** nos próximos 3 dias úteis. O caso #0023847 vence **hoje às 17h**." },
        { agent: "Redator Processual", content: "Posso gerar a **petição inicial** com base nos documentos. Qual a vara e tribunal de destino?" },
        { agent: "Meu Assistente", content: "Estou **orquestrando os agentes** para atender sua solicitação. Pesquisador mapeando jurisprudência." },
      ];
      const r = responses[Math.floor(Math.random() * responses.length)];
      setMessages(prev => [...prev, {
        id: Date.now() + 1, role: "assistant", agent: r.agent, content: r.content,
        timestamp: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      }]);
    }, 1800 + Math.random() * 600);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const activeDeptData = DEPARTMENTS.find(d => d.id === activeDept);
  const areaColors: Record<string, string> = { "Bancário": "#2dd4a0", "Cível": "#a78bfa", "Previdenciário": "#f59e0b", "Contratos": "#4f8ef7" };

  // Filter departments by role
  const visibleDepts = DEPARTMENTS.filter(d => canAccessDepartment(d.id));
  // Filter commands by role
  const visibleCommands = ALL_COMMANDS.filter(c => canSeeCommand(c));
  // Filter agents by role + department
  const visibleAgents = (() => {
    const deptAgents = activeDept === "assistente" ? AGENTS : getAgentsForDepartment(activeDept);
    return deptAgents.filter(a => canSeeAgentRole(a.role)).slice(0, visibility.maxAgentsShown);
  })();

  const DeptIcon = DEPT_ICONS[activeDept] || Sparkles;

  // Menu items config
  const MENU_ITEMS = [
    { id: "clientes", label: "Clientes", icon: Users, color: "#2dd4a0", action: () => navigate("/clientes"), show: canSeeMenuItem("clientes") && canAccessClients },
    { id: "admin", label: "Administração", icon: Crown, color: "#c9a84c", action: () => navigate("/admin"), show: canSeeMenuItem("admin") && canAccessAdmin },
    { id: "dashboard", label: "Dashboard", icon: BarChart3, color: "#c9a84c", action: () => navigate("/dashboard"), show: canSeeMenuItem("dashboard") },
    { id: "organograma", label: "Organograma", icon: Network, color: "#a78bfa", action: () => navigate("/organograma"), show: canSeeMenuItem("organograma") },
    { id: "eficiencia", label: "KPIs Eficiência", icon: Activity, color: "#ff6b6b", action: () => navigate("/eficiencia"), show: canSeeMenuItem("eficiencia") },
    { id: "perfil", label: "Meu Perfil", icon: User, color: "#a78bfa", action: () => navigate("/perfil"), show: canSeeMenuItem("perfil") },
    { id: "site", label: "Voltar ao Site", icon: Globe, color: "#06b6d4", action: () => navigate("/"), show: canSeeMenuItem("site") },
    { id: "sair", label: "Sair", icon: LogOut, color: "#ef4444", action: () => signOut(), show: canSeeMenuItem("sair") },
  ];

  const roleLabelsMap: Record<string, string> = {
    ceo: "CEO", director: "Diretor", orchestrator: "Orquestrador", manager: "Gerente",
    specialist: "Especialista", reviewer: "Revisor", executor: "Executor", monitor: "Monitor",
  };

  // Wrap in tooltip when sidebar is collapsed (desktop). Plain element otherwise.
  // - Tracks tooltip_open
  // - Closes on Escape (Radix default behavior when trigger has focus)
  // - Returns focus to the trigger automatically (Radix default), so Tab order is preserved.
  const withTooltip = (label: string, node: React.ReactElement, targetId?: string) => {
    if (!sidebarCollapsed) return node;
    return (
      <Tooltip
        delayDuration={150}
        onOpenChange={(open) => {
          if (open) {
            trackUiEvent("tooltip_open", {
              surface: "left_sidebar",
              target_id: targetId,
              target_label: label,
            });
          }
        }}
      >
        <TooltipTrigger asChild>{node}</TooltipTrigger>
        <TooltipContent
          side="right"
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

        {/* SIDEBAR */}
        <aside
          id="jc-sidebar"
          className={`jc-sidebar ${sidebarOpen ? "mobile-open" : ""} ${sidebarCollapsed ? "collapsed" : ""}`}
          aria-label="Menu lateral de navegação"
        >
          {withTooltip(`${sidebarCollapsed ? "Expandir" : "Recolher"} menu (Ctrl+B)`,
            <button
              className="jc-sidebar-toggle"
              onClick={() => handleSidebarToggle("click")}
              aria-label={sidebarCollapsed ? "Expandir menu lateral" : "Recolher menu lateral"}
              aria-expanded={!sidebarCollapsed}
              aria-controls="jc-sidebar"
              aria-keyshortcuts="Control+B Meta+B"
              type="button"
            >
              {sidebarCollapsed ? <PanelLeftOpen size={12} /> : <PanelLeftClose size={12} />}
            </button>
          )}

          <div className="jc-logo" title={systemOnline ? "LexForce — sistema ativo" : "LexForce — sistema inativo"}>
            <div className="jc-logo-mark">L</div>
            <div className="jc-logo-info">
              <div className={`jc-logo-text ${systemOnline ? "online" : "offline"}`}>LexForce</div>
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
              const RoleIcon = ROLE_ICONS[agent.role] || Zap;
              const statusLabel = agent.status === "active" ? "ativo" : agent.status === "alert" ? "em alerta" : "inativo";
              return withTooltip(`${agent.name} — ${statusLabel}`,
                <div className="jc-agent-item" key={agent.id} aria-label={`${agent.name} (${statusLabel})`}>
                  <div className="jc-agent-avatar" style={{ background: `${agent.color}18`, color: agent.color, border: `1px solid ${agent.color}25` }}>
                    {getInitials(agent.name)}
                  </div>
                  <div className="jc-agent-name">{agent.name}</div>
                  <Circle size={6} className="jc-agent-status-dot"
                    fill={agent.status === "active" ? "#2dd4a0" : agent.status === "alert" ? "#ef4444" : "#5a5a72"}
                    style={{ color: agent.status === "active" ? "#2dd4a0" : agent.status === "alert" ? "#ef4444" : "#5a5a72" }} />
                </div>,
                `agent_${agent.id}`
              );
            })}
          </div>
        </aside>

        {/* MAIN */}
        <main className="jc-main">
          <header className="jc-topbar">
            <button className="jc-hamburger" onClick={() => setSidebarOpen(true)}>
              <Menu size={20} />
            </button>
            <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
              <div className="jc-dept-title" style={{ color: activeDeptData?.color, display: "flex", alignItems: "center", gap: 8 }}>
                <DeptIcon size={20} />
                {activeDeptData?.label}
              </div>
              <div className="jc-dept-sub">Sistema Operacional</div>
            </div>
            <div className="jc-topbar-spacer" />

            {visibility.showAlertChips && ALERTS.slice(0, 2).map((a, i) => (
              <div key={i} className={`jc-alert-chip ${a.type}`}>
                <AlertIcon type={a.type} />
                <span>{a.text.slice(0, 28)}...</span>
              </div>
            ))}

            <NotificationCenter />

            <button onClick={() => navigate("/tokens")} title="Meus Tokens"
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 20,
                background: "rgba(201,168,76,0.12)", border: "1px solid rgba(201,168,76,0.25)", cursor: "pointer", color: "#c9a84c", fontSize: 12, fontWeight: 600, fontFamily: "var(--font-mono)" }}>
              <Coins size={14} />
              {tokenBalance.balance.toLocaleString()}
            </button>

            <button className="jc-theme-toggle" onClick={toggleTheme} title="Alternar tema"
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 20,
                background: "var(--bg3)", border: "1px solid var(--border)", cursor: "pointer", color: "var(--text2)" }}>
              {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
            </button>

            <button className="jc-right-toggle" onClick={() => setRightPanelOpen(!rightPanelOpen)}>
              {rightPanelOpen ? <><PanelRightClose size={14} /> Fechar</> : <><PanelRightOpen size={14} /> Operações</>}
            </button>

            <div className="jc-user-chip" onClick={() => navigate("/perfil")} title="Meu Perfil">
              <div className="jc-user-avatar">{(user?.email || "U")[0].toUpperCase()}</div>
              <div className="jc-user-name">{user?.user_metadata?.display_name || user?.email?.split("@")[0] || "Usuário"}</div>
              {userRoles.length > 0 && (
                <span style={{ fontSize: 8, padding: "1px 5px", borderRadius: 3, background: "rgba(201,168,76,0.15)", color: "#c9a84c", textTransform: "uppercase", fontFamily: "var(--font-mono)" }}>
                  {userRoles[0]}
                </span>
              )}
            </div>
          </header>

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
              {isReadOnly && <span style={{ color: "#f59e0b", marginRight: 8, display: "inline-flex", alignItems: "center", gap: 3 }}><Lock size={10} /> Modo leitura ({roleLabel})</span>}
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
          <Tooltip delayDuration={150}>
            <TooltipTrigger asChild>
              <button
                className="jc-right-toggle-desk"
                onClick={() => handleRightToggle("click")}
                aria-label={rightCollapsed ? "Expandir painel de operações" : "Recolher painel de operações"}
                aria-expanded={!rightCollapsed}
                aria-controls="jc-right-panel"
                aria-keyshortcuts="Control+O Meta+O"
                type="button"
              >
                {rightCollapsed ? <PanelRightOpen size={12} /> : <PanelRightClose size={12} />}
              </button>
            </TooltipTrigger>
            <TooltipContent side="left" sideOffset={8}>
              {rightCollapsed ? "Expandir Operações (Ctrl+O)" : "Recolher Operações (Ctrl+O)"}
            </TooltipContent>
          </Tooltip>
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
                        background: `${areaColors[p.area] || "#4f8ef7"}18`,
                        color: areaColors[p.area] || "#4f8ef7",
                        border: `1px solid ${areaColors[p.area] || "#4f8ef7"}30`
                      }}>{p.area}</span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--teal)" }}>{p.value}</span>
                    </div>
                    <div className="jc-case-prazo-row">
                      <span style={{ color: p.prazo === "HOJE" ? "#ff8080" : "var(--text3)", display: "flex", alignItems: "center", gap: 3 }}>
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
              const capacity = getTotalCapacity();
              return (
                <>
                  {visibility.showCapacityPanel && (
                    <div style={{ fontSize: 10, color: "var(--text2)", marginBottom: 8, padding: 8, background: "var(--bg4)", borderRadius: 6, border: "1px solid var(--border)" }}>
                      <div style={{ marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
                        <BarChart3 size={12} /> Capacidade: {capacity.used}/{capacity.total} ({capacity.percentage}%)
                      </div>
                      <div style={{ background: "var(--bg)", borderRadius: 4, height: 6, overflow: "hidden" }}>
                        <div style={{ width: `${capacity.percentage}%`, height: "100%", borderRadius: 4, background: capacity.percentage > 80 ? "var(--red)" : capacity.percentage > 50 ? "var(--amber)" : "var(--teal)", transition: "width 0.5s" }} />
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
                            fontSize: 11, fontWeight: 700, fontFamily: "var(--font-mono)", flexShrink: 0
                          }}>{getInitials(agent.name)}</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text1)", marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{agent.name}</div>
                            <div style={{ fontSize: 9, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.08em", display: "flex", alignItems: "center", gap: 4 }}>
                              <RoleIcon size={10} /> {roleLabelsMap[agent.role] || agent.role}
                            </div>
                          </div>
                          <Circle size={8}
                            fill={agent.status === "active" ? "#2dd4a0" : agent.status === "alert" ? "#ef4444" : "#5a5a72"}
                            style={{ color: agent.status === "active" ? "#2dd4a0" : agent.status === "alert" ? "#ef4444" : "#5a5a72" }} />
                        </div>
                        <div style={{ background: "var(--bg)", borderRadius: 4, height: 4, marginBottom: 6, overflow: "hidden" }}>
                          <div style={{ width: `${load}%`, height: "100%", borderRadius: 4, background: load > 80 ? "var(--red)" : load > 50 ? "var(--amber)" : "var(--teal)", transition: "width 0.5s" }} />
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

        {/* Live region for keyboard shortcut announcements (visually hidden, screen reader only) */}
        <div className="jc-sr-only" role="status" aria-live="polite" aria-atomic="true">
          {shortcutAnnouncement}
        </div>
      </div>
      </TooltipProvider>
    </div>
  );
}
