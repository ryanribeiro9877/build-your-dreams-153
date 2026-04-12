import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/integrations/supabase/client";

/* ─────────────────────────────────────────────────────────────
   AGENT JUS IA  –  Sistema Operacional Empresarial Conversacional
───────────────────────────────────────────────────────────── */

// ── DATA ────────────────────────────────────────────────────
const DEPARTMENTS = [
  { id: "assistente",    label: "Meu Assistente",          icon: "◈",  color: "#c9a84c", badge: 8  },
  { id: "diretoria",     label: "Diretoria / CEO",         icon: "👑", color: "#c9a84c", badge: 0  },
  { id: "recepcao",      label: "Recepção",                icon: "🏢", color: "#3b82f6", badge: 6  },
  { id: "marketing",     label: "Marketing",               icon: "📢", color: "#f59e0b", badge: 5  },
  { id: "civel",         label: "Contencioso Cível",       icon: "⚖️", color: "#8b5cf6", badge: 12 },
  { id: "trabalhista",   label: "Contencioso Trabalhista", icon: "👷", color: "#ef4444", badge: 7  },
  { id: "tributario",    label: "Contencioso Tributário",  icon: "💰", color: "#10b981", badge: 4  },
  { id: "protocolo",     label: "Protocolo",               icon: "📋", color: "#6366f1", badge: 9  },
  { id: "calculos",      label: "Cálculos Jurídicos",     icon: "🔢", color: "#ec4899", badge: 3  },
  { id: "audiencias",    label: "Audiências",              icon: "🏛️", color: "#14b8a6", badge: 11 },
  { id: "monitoramento", label: "Monitoramento Processual",icon: "🔍", color: "#f97316", badge: 15 },
  { id: "cobrancas",     label: "Cobranças",               icon: "💳", color: "#84cc16", badge: 2  },
  { id: "compliance",    label: "Compliance",              icon: "🛡️", color: "#0ea5e9", badge: 1  },
  { id: "familia",       label: "Família e Sucessões",     icon: "👨‍👩‍👧‍👦", color: "#a855f7", badge: 3  },
];

type AgentRole = "ceo" | "director" | "orchestrator" | "manager" | "specialist" | "reviewer" | "executor" | "monitor";
type AgentPermission = "read" | "write" | "approve" | "execute" | "admin" | "monitor" | "schedule" | "contact_client" | "protocol" | "calculate" | "review_calculation" | "petition" | "market_study";

interface Agent {
  id: number;
  name: string;
  status: "active" | "idle" | "alert";
  avatar: string;
  color: string;
  role: AgentRole;
  permissions: AgentPermission[];
  department: string[];
  canOrchestrate: boolean;
  maxConcurrentTasks: number;
  currentTasks: number;
  description?: string;
  maxProcessesMonitored?: number;
  reportsTo?: number; // id do agente superior
}

const AGENTS: Agent[] = [
  // ══════════════════════════════════════════════════════════════
  // ── CEO (1 agente) ── Topo da hierarquia, supervisiona TODOS
  // ══════════════════════════════════════════════════════════════
  { id: 0, name: "CEO Agent Jus IA", status: "active", avatar: "👑", color: "#c9a84c", role: "ceo", permissions: ["read","write","approve","execute","admin"], department: ["*","diretoria"], canOrchestrate: true, maxConcurrentTasks: 20, currentTasks: 8, description: "Agente CEO — supervisiona todos os diretores e a operação global do escritório" },

  // ══════════════════════════════════════════════════════════════
  // ── RECEPÇÃO (9 agentes) ── Diretor → Gerentes → Times
  // ══════════════════════════════════════════════════════════════
  { id: 1, name: "Diretor de Recepção", status: "active", avatar: "👔", color: "#3b82f6", role: "director", permissions: ["read","write","approve","admin"], department: ["recepcao","diretoria"], canOrchestrate: true, maxConcurrentTasks: 10, currentTasks: 3, reportsTo: 0 },
  { id: 2, name: "Gerente de Atendimento", status: "active", avatar: "📞", color: "#3b82f6", role: "manager", permissions: ["read","write","approve","schedule"], department: ["recepcao"], canOrchestrate: true, maxConcurrentTasks: 8, currentTasks: 4, reportsTo: 1 },
  { id: 100, name: "Gerente de Intake", status: "active", avatar: "📥", color: "#3b82f6", role: "manager", permissions: ["read","write","approve","contact_client","schedule"], department: ["recepcao"], canOrchestrate: true, maxConcurrentTasks: 8, currentTasks: 5, reportsTo: 1 },
  { id: 3, name: "Agente Agendador", status: "active", avatar: "📅", color: "#60a5fa", role: "executor", permissions: ["read","write","schedule"], department: ["recepcao"], canOrchestrate: false, maxConcurrentTasks: 15, currentTasks: 7, reportsTo: 2 },
  { id: 4, name: "Confirmação de Audiências", status: "active", avatar: "✅", color: "#60a5fa", role: "executor", permissions: ["read","write","contact_client","schedule"], department: ["recepcao","audiencias"], canOrchestrate: false, maxConcurrentTasks: 20, currentTasks: 12, reportsTo: 2 },
  { id: 5, name: "Coletor de Documentos", status: "active", avatar: "📄", color: "#93c5fd", role: "executor", permissions: ["read","write","contact_client"], department: ["recepcao"], canOrchestrate: false, maxConcurrentTasks: 10, currentTasks: 5, reportsTo: 100 },
  { id: 6, name: "Atendente WhatsApp", status: "active", avatar: "💬", color: "#93c5fd", role: "executor", permissions: ["read","write","contact_client"], department: ["recepcao","marketing"], canOrchestrate: false, maxConcurrentTasks: 25, currentTasks: 15, reportsTo: 100 },
  { id: 7, name: "Monitor de Novos Clientes", status: "active", avatar: "🔔", color: "#3b82f6", role: "monitor", permissions: ["read","monitor","schedule"], department: ["recepcao"], canOrchestrate: false, maxConcurrentTasks: 20, currentTasks: 8, reportsTo: 100 },
  { id: 8, name: "Agente de Triagem", status: "active", avatar: "🔀", color: "#3b82f6", role: "specialist", permissions: ["read","write","execute"], department: ["recepcao"], canOrchestrate: false, maxConcurrentTasks: 10, currentTasks: 4, reportsTo: 2 },

  // ══════════════════════════════════════════════════════════════
  // ── MARKETING (12 agentes) ── Diretor → Gerentes → Times
  // ══════════════════════════════════════════════════════════════
  { id: 9, name: "Diretor de Marketing", status: "active", avatar: "🎯", color: "#f59e0b", role: "director", permissions: ["read","write","approve","admin","market_study"], department: ["marketing","diretoria"], canOrchestrate: true, maxConcurrentTasks: 10, currentTasks: 5, reportsTo: 0 },
  { id: 10, name: "Gerente de Campanhas", status: "active", avatar: "📊", color: "#f59e0b", role: "manager", permissions: ["read","write","approve","execute"], department: ["marketing"], canOrchestrate: true, maxConcurrentTasks: 8, currentTasks: 6, reportsTo: 9 },
  { id: 101, name: "Gerente de Conteúdo", status: "active", avatar: "📝", color: "#f59e0b", role: "manager", permissions: ["read","write","approve","execute"], department: ["marketing"], canOrchestrate: true, maxConcurrentTasks: 8, currentTasks: 5, reportsTo: 9 },
  { id: 11, name: "Monitor de Resultados", status: "active", avatar: "📈", color: "#fbbf24", role: "monitor", permissions: ["read","monitor","market_study"], department: ["marketing"], canOrchestrate: false, maxConcurrentTasks: 15, currentTasks: 10, reportsTo: 10 },
  { id: 12, name: "Especialista Copywriting", status: "active", avatar: "✍️", color: "#fbbf24", role: "specialist", permissions: ["read","write","execute"], department: ["marketing"], canOrchestrate: false, maxConcurrentTasks: 8, currentTasks: 5, reportsTo: 101 },
  { id: 13, name: "Especialista Copyright", status: "active", avatar: "©️", color: "#fcd34d", role: "specialist", permissions: ["read","write","approve"], department: ["marketing"], canOrchestrate: false, maxConcurrentTasks: 6, currentTasks: 3, reportsTo: 101 },
  { id: 14, name: "Criador Imagem Estática", status: "active", avatar: "🖼️", color: "#fcd34d", role: "executor", permissions: ["read","write","execute"], department: ["marketing"], canOrchestrate: false, maxConcurrentTasks: 10, currentTasks: 7, reportsTo: 101 },
  { id: 15, name: "Criador Vídeo/Animação", status: "active", avatar: "🎬", color: "#f59e0b", role: "executor", permissions: ["read","write","execute"], department: ["marketing"], canOrchestrate: false, maxConcurrentTasks: 5, currentTasks: 3, reportsTo: 101 },
  { id: 16, name: "Especialista Tráfego Pago", status: "active", avatar: "💰", color: "#f59e0b", role: "specialist", permissions: ["read","write","execute","market_study"], department: ["marketing"], canOrchestrate: false, maxConcurrentTasks: 8, currentTasks: 6, reportsTo: 10 },
  { id: 17, name: "Analista de Concorrência", status: "active", avatar: "🔎", color: "#fbbf24", role: "specialist", permissions: ["read","market_study"], department: ["marketing"], canOrchestrate: false, maxConcurrentTasks: 5, currentTasks: 2, reportsTo: 10 },
  { id: 18, name: "Analista de Mercado", status: "active", avatar: "🌍", color: "#fbbf24", role: "specialist", permissions: ["read","market_study"], department: ["marketing"], canOrchestrate: false, maxConcurrentTasks: 5, currentTasks: 2, reportsTo: 10 },
  { id: 19, name: "Automação de Marketing", status: "active", avatar: "⚙️", color: "#fcd34d", role: "executor", permissions: ["read","write","execute"], department: ["marketing"], canOrchestrate: false, maxConcurrentTasks: 12, currentTasks: 8, reportsTo: 10 },

  // ══════════════════════════════════════════════════════════════
  // ── CONTENCIOSO CÍVEL (10 agentes) ── Diretor → Gerentes → Times
  // ══════════════════════════════════════════════════════════════
  { id: 102, name: "Diretor Contencioso Cível", status: "active", avatar: "⚖️", color: "#8b5cf6", role: "director", permissions: ["read","write","approve","admin","petition"], department: ["civel","diretoria"], canOrchestrate: true, maxConcurrentTasks: 10, currentTasks: 4, reportsTo: 0 },
  { id: 20, name: "Gerente Processual Cível", status: "active", avatar: "📋", color: "#8b5cf6", role: "manager", permissions: ["read","write","approve","petition"], department: ["civel"], canOrchestrate: true, maxConcurrentTasks: 10, currentTasks: 6, reportsTo: 102 },
  { id: 103, name: "Gerente de Análise Cível", status: "active", avatar: "🔬", color: "#8b5cf6", role: "manager", permissions: ["read","write","approve"], department: ["civel"], canOrchestrate: true, maxConcurrentTasks: 8, currentTasks: 5, reportsTo: 102 },
  { id: 21, name: "Pesquisador Jurisprudencial", status: "active", avatar: "📚", color: "#8b5cf6", role: "specialist", permissions: ["read","write","execute"], department: ["civel","trabalhista","tributario"], canOrchestrate: false, maxConcurrentTasks: 8, currentTasks: 5, reportsTo: 103 },
  { id: 22, name: "Redator de Petições", status: "active", avatar: "📝", color: "#a78bfa", role: "executor", permissions: ["read","write","execute","petition"], department: ["civel"], canOrchestrate: false, maxConcurrentTasks: 5, currentTasks: 3, reportsTo: 20 },
  { id: 23, name: "Analista de Contratos", status: "active", avatar: "🔍", color: "#a78bfa", role: "reviewer", permissions: ["read","write","approve"], department: ["civel"], canOrchestrate: false, maxConcurrentTasks: 6, currentTasks: 4, reportsTo: 103 },
  { id: 24, name: "Monitor de Prazos Cível", status: "alert", avatar: "⏰", color: "#c4b5fd", role: "monitor", permissions: ["read","monitor"], department: ["civel"], canOrchestrate: false, maxConcurrentTasks: 50, currentTasks: 35, maxProcessesMonitored: 50, reportsTo: 20 },
  { id: 25, name: "Estrategista Processual", status: "active", avatar: "🧠", color: "#8b5cf6", role: "specialist", permissions: ["read","write","approve"], department: ["civel"], canOrchestrate: false, maxConcurrentTasks: 5, currentTasks: 3, reportsTo: 103 },
  { id: 26, name: "Agente Recursal", status: "active", avatar: "📑", color: "#a78bfa", role: "specialist", permissions: ["read","write","execute","petition"], department: ["civel"], canOrchestrate: false, maxConcurrentTasks: 5, currentTasks: 2, reportsTo: 20 },
  { id: 27, name: "Comunicador Interdepartamental", status: "active", avatar: "🔗", color: "#c4b5fd", role: "executor", permissions: ["read","write","execute"], department: ["civel","*"], canOrchestrate: false, maxConcurrentTasks: 15, currentTasks: 8, reportsTo: 102 },

  // ══════════════════════════════════════════════════════════════
  // ── CONTENCIOSO TRABALHISTA (8 agentes) ── Diretor → Gerentes → Times
  // ══════════════════════════════════════════════════════════════
  { id: 104, name: "Diretor Contencioso Trabalhista", status: "active", avatar: "👷", color: "#ef4444", role: "director", permissions: ["read","write","approve","admin"], department: ["trabalhista","diretoria"], canOrchestrate: true, maxConcurrentTasks: 10, currentTasks: 3, reportsTo: 0 },
  { id: 28, name: "Gerente Processual Trabalhista", status: "active", avatar: "📋", color: "#ef4444", role: "manager", permissions: ["read","write","approve"], department: ["trabalhista"], canOrchestrate: true, maxConcurrentTasks: 10, currentTasks: 5, reportsTo: 104 },
  { id: 105, name: "Gerente de Audiências Trab.", status: "active", avatar: "🏛️", color: "#ef4444", role: "manager", permissions: ["read","write","approve","schedule"], department: ["trabalhista","audiencias"], canOrchestrate: true, maxConcurrentTasks: 8, currentTasks: 4, reportsTo: 104 },
  { id: 29, name: "Pesquisador Trabalhista", status: "active", avatar: "📚", color: "#ef4444", role: "specialist", permissions: ["read","write","execute"], department: ["trabalhista"], canOrchestrate: false, maxConcurrentTasks: 8, currentTasks: 4, reportsTo: 28 },
  { id: 30, name: "Redator Trabalhista", status: "active", avatar: "📝", color: "#f87171", role: "executor", permissions: ["read","write","petition"], department: ["trabalhista"], canOrchestrate: false, maxConcurrentTasks: 5, currentTasks: 3, reportsTo: 28 },
  { id: 31, name: "Analista de Verbas", status: "active", avatar: "💵", color: "#f87171", role: "specialist", permissions: ["read","write","calculate"], department: ["trabalhista","calculos"], canOrchestrate: false, maxConcurrentTasks: 8, currentTasks: 5, reportsTo: 28 },
  { id: 32, name: "Monitor Prazos Trabalhista", status: "alert", avatar: "⏰", color: "#fca5a5", role: "monitor", permissions: ["read","monitor"], department: ["trabalhista"], canOrchestrate: false, maxConcurrentTasks: 50, currentTasks: 30, maxProcessesMonitored: 50, reportsTo: 28 },
  { id: 33, name: "Preparador Audiência Trab.", status: "active", avatar: "🏛️", color: "#fca5a5", role: "executor", permissions: ["read","write","schedule"], department: ["trabalhista","audiencias"], canOrchestrate: false, maxConcurrentTasks: 8, currentTasks: 4, reportsTo: 105 },

  // ══════════════════════════════════════════════════════════════
  // ── CONTENCIOSO TRIBUTÁRIO (8 agentes) ── Diretor → Gerentes → Times
  // ══════════════════════════════════════════════════════════════
  { id: 106, name: "Diretor Contencioso Tributário", status: "active", avatar: "💰", color: "#10b981", role: "director", permissions: ["read","write","approve","admin"], department: ["tributario","diretoria"], canOrchestrate: true, maxConcurrentTasks: 10, currentTasks: 3, reportsTo: 0 },
  { id: 34, name: "Gerente Processual Tributário", status: "active", avatar: "📋", color: "#10b981", role: "manager", permissions: ["read","write","approve"], department: ["tributario"], canOrchestrate: true, maxConcurrentTasks: 10, currentTasks: 4, reportsTo: 106 },
  { id: 107, name: "Gerente de Planejamento Fiscal", status: "active", avatar: "📊", color: "#10b981", role: "manager", permissions: ["read","write","approve","calculate"], department: ["tributario"], canOrchestrate: true, maxConcurrentTasks: 8, currentTasks: 3, reportsTo: 106 },
  { id: 35, name: "Pesquisador Tributário", status: "active", avatar: "📚", color: "#10b981", role: "specialist", permissions: ["read","write","execute"], department: ["tributario"], canOrchestrate: false, maxConcurrentTasks: 8, currentTasks: 3, reportsTo: 34 },
  { id: 36, name: "Redator Tributário", status: "active", avatar: "📝", color: "#34d399", role: "executor", permissions: ["read","write","petition"], department: ["tributario"], canOrchestrate: false, maxConcurrentTasks: 5, currentTasks: 2, reportsTo: 34 },
  { id: 37, name: "Analista Fiscal", status: "active", avatar: "📊", color: "#34d399", role: "specialist", permissions: ["read","write","calculate"], department: ["tributario"], canOrchestrate: false, maxConcurrentTasks: 6, currentTasks: 3, reportsTo: 107 },
  { id: 38, name: "Monitor Tributário", status: "active", avatar: "⏰", color: "#6ee7b7", role: "monitor", permissions: ["read","monitor"], department: ["tributario"], canOrchestrate: false, maxConcurrentTasks: 50, currentTasks: 25, maxProcessesMonitored: 50, reportsTo: 34 },
  { id: 39, name: "Planejador Tributário", status: "active", avatar: "🧠", color: "#6ee7b7", role: "specialist", permissions: ["read","write","approve"], department: ["tributario"], canOrchestrate: false, maxConcurrentTasks: 5, currentTasks: 2, reportsTo: 107 },

  // ══════════════════════════════════════════════════════════════
  // ── PROTOCOLO (7 agentes) ── Diretor → Gerente → Times
  // ══════════════════════════════════════════════════════════════
  { id: 108, name: "Diretor de Protocolo", status: "active", avatar: "📋", color: "#6366f1", role: "director", permissions: ["read","write","approve","admin","protocol"], department: ["protocolo","diretoria"], canOrchestrate: true, maxConcurrentTasks: 10, currentTasks: 4, reportsTo: 0 },
  { id: 40, name: "Gerente de Protocolo", status: "active", avatar: "📋", color: "#6366f1", role: "manager", permissions: ["read","write","approve","protocol"], department: ["protocolo"], canOrchestrate: true, maxConcurrentTasks: 10, currentTasks: 6, reportsTo: 108 },
  { id: 41, name: "Coletor de Documentos Proto.", status: "active", avatar: "📎", color: "#6366f1", role: "executor", permissions: ["read","write","protocol"], department: ["protocolo"], canOrchestrate: false, maxConcurrentTasks: 15, currentTasks: 10, reportsTo: 40 },
  { id: 42, name: "Uploader de Sistema", status: "active", avatar: "⬆️", color: "#818cf8", role: "executor", permissions: ["read","write","execute","protocol"], department: ["protocolo"], canOrchestrate: false, maxConcurrentTasks: 10, currentTasks: 7, reportsTo: 40 },
  { id: 43, name: "Verificador de Envio", status: "active", avatar: "✔️", color: "#818cf8", role: "reviewer", permissions: ["read","approve","protocol"], department: ["protocolo"], canOrchestrate: false, maxConcurrentTasks: 15, currentTasks: 9, reportsTo: 40 },
  { id: 44, name: "Consultor de Datas", status: "active", avatar: "📅", color: "#a5b4fc", role: "specialist", permissions: ["read","write","schedule"], department: ["protocolo","audiencias"], canOrchestrate: false, maxConcurrentTasks: 10, currentTasks: 5, reportsTo: 40 },
  { id: 45, name: "Confirmador de Protocolo", status: "active", avatar: "✅", color: "#a5b4fc", role: "reviewer", permissions: ["read","approve","protocol"], department: ["protocolo"], canOrchestrate: false, maxConcurrentTasks: 15, currentTasks: 8, reportsTo: 40 },

  // ══════════════════════════════════════════════════════════════
  // ── CÁLCULOS JURÍDICOS (6 agentes) ── Diretor → Gerente → Cadeia de 4 revisores
  // ══════════════════════════════════════════════════════════════
  { id: 109, name: "Diretor de Cálculos", status: "active", avatar: "🔢", color: "#ec4899", role: "director", permissions: ["read","write","approve","admin","calculate"], department: ["calculos","diretoria"], canOrchestrate: true, maxConcurrentTasks: 8, currentTasks: 3, reportsTo: 0 },
  { id: 46, name: "Gerente de Cálculos", status: "active", avatar: "🔢", color: "#ec4899", role: "manager", permissions: ["read","write","approve","calculate","review_calculation"], department: ["calculos"], canOrchestrate: true, maxConcurrentTasks: 8, currentTasks: 5, reportsTo: 109 },
  { id: 47, name: "Calculista Principal", status: "active", avatar: "🧮", color: "#ec4899", role: "executor", permissions: ["read","write","execute","calculate"], department: ["calculos"], canOrchestrate: false, maxConcurrentTasks: 5, currentTasks: 3, reportsTo: 46 },
  { id: 48, name: "Revisor de Cálculos 1", status: "active", avatar: "🔍", color: "#f472b6", role: "reviewer", permissions: ["read","review_calculation"], department: ["calculos"], canOrchestrate: false, maxConcurrentTasks: 5, currentTasks: 3, reportsTo: 46 },
  { id: 49, name: "Revisor de Cálculos 2", status: "active", avatar: "🔎", color: "#f472b6", role: "reviewer", permissions: ["read","review_calculation"], department: ["calculos"], canOrchestrate: false, maxConcurrentTasks: 5, currentTasks: 2, reportsTo: 46 },
  { id: 50, name: "Revisor de Cálculos 3", status: "active", avatar: "🧐", color: "#f9a8d4", role: "reviewer", permissions: ["read","review_calculation","approve"], department: ["calculos"], canOrchestrate: false, maxConcurrentTasks: 5, currentTasks: 2, reportsTo: 46 },

  // ══════════════════════════════════════════════════════════════
  // ── AUDIÊNCIAS (7 agentes) ── Diretor → Gerente → Times escalonados
  // ══════════════════════════════════════════════════════════════
  { id: 110, name: "Diretor de Audiências", status: "active", avatar: "🏛️", color: "#14b8a6", role: "director", permissions: ["read","write","approve","admin","schedule"], department: ["audiencias","diretoria"], canOrchestrate: true, maxConcurrentTasks: 10, currentTasks: 4, reportsTo: 0 },
  { id: 51, name: "Gerente de Audiências", status: "active", avatar: "🏛️", color: "#14b8a6", role: "manager", permissions: ["read","write","approve","schedule"], department: ["audiencias"], canOrchestrate: true, maxConcurrentTasks: 10, currentTasks: 6, reportsTo: 110 },
  { id: 52, name: "Lembrete 7 Dias", status: "active", avatar: "📢", color: "#14b8a6", role: "executor", permissions: ["read","contact_client","schedule"], department: ["audiencias"], canOrchestrate: false, maxConcurrentTasks: 30, currentTasks: 15, reportsTo: 51 },
  { id: 53, name: "Lembrete 3 Dias", status: "active", avatar: "📣", color: "#2dd4bf", role: "executor", permissions: ["read","contact_client","schedule"], department: ["audiencias"], canOrchestrate: false, maxConcurrentTasks: 30, currentTasks: 18, reportsTo: 51 },
  { id: 54, name: "Lembrete 2 Dias", status: "active", avatar: "🔔", color: "#2dd4bf", role: "executor", permissions: ["read","contact_client","schedule"], department: ["audiencias"], canOrchestrate: false, maxConcurrentTasks: 30, currentTasks: 20, reportsTo: 51 },
  { id: 55, name: "Lembrete Dia D", status: "alert", avatar: "🚨", color: "#5eead4", role: "executor", permissions: ["read","contact_client","schedule"], department: ["audiencias"], canOrchestrate: false, maxConcurrentTasks: 30, currentTasks: 22, reportsTo: 51 },
  { id: 56, name: "Agente Pós-Audiência", status: "active", avatar: "📋", color: "#5eead4", role: "specialist", permissions: ["read","write","execute"], department: ["audiencias"], canOrchestrate: false, maxConcurrentTasks: 10, currentTasks: 5, reportsTo: 51 },

  // ══════════════════════════════════════════════════════════════
  // ── MONITORAMENTO PROCESSUAL (6 agentes) ── Diretor → Gerente → Scanners
  // ══════════════════════════════════════════════════════════════
  { id: 111, name: "Diretor de Monitoramento", status: "active", avatar: "🔍", color: "#f97316", role: "director", permissions: ["read","write","approve","admin","monitor"], department: ["monitoramento","diretoria"], canOrchestrate: true, maxConcurrentTasks: 10, currentTasks: 4, reportsTo: 0 },
  { id: 57, name: "Gerente de Monitoramento", status: "active", avatar: "🔍", color: "#f97316", role: "manager", permissions: ["read","write","approve","monitor"], department: ["monitoramento"], canOrchestrate: true, maxConcurrentTasks: 10, currentTasks: 7, reportsTo: 111 },
  { id: 58, name: "Scanner de Movimentações", status: "active", avatar: "📡", color: "#f97316", role: "executor", permissions: ["read","monitor"], department: ["monitoramento"], canOrchestrate: false, maxConcurrentTasks: 50, currentTasks: 40, maxProcessesMonitored: 50, reportsTo: 57 },
  { id: 59, name: "Analisador Deferimento", status: "active", avatar: "✅", color: "#fb923c", role: "specialist", permissions: ["read","monitor","execute"], department: ["monitoramento"], canOrchestrate: false, maxConcurrentTasks: 50, currentTasks: 35, maxProcessesMonitored: 50, reportsTo: 57 },
  { id: 60, name: "Preparador Razões/Contrarrazões", status: "active", avatar: "⚔️", color: "#fb923c", role: "executor", permissions: ["read","write","execute","petition"], department: ["monitoramento","civel"], canOrchestrate: false, maxConcurrentTasks: 10, currentTasks: 6, reportsTo: 57 },
  { id: 61, name: "Gerador de Relatórios", status: "idle", avatar: "📊", color: "#fdba74", role: "executor", permissions: ["read","write"], department: ["monitoramento","assistente"], canOrchestrate: false, maxConcurrentTasks: 8, currentTasks: 4, reportsTo: 57 },

  // ══════════════════════════════════════════════════════════════
  // ── COBRANÇAS (5 agentes) ── Diretor → Gerente → Times
  // ══════════════════════════════════════════════════════════════
  { id: 112, name: "Diretor Financeiro", status: "active", avatar: "💳", color: "#84cc16", role: "director", permissions: ["read","write","approve","admin","calculate"], department: ["cobrancas","diretoria"], canOrchestrate: true, maxConcurrentTasks: 10, currentTasks: 3, reportsTo: 0 },
  { id: 62, name: "Gerente de Cobranças", status: "active", avatar: "💳", color: "#84cc16", role: "manager", permissions: ["read","write","approve"], department: ["cobrancas"], canOrchestrate: true, maxConcurrentTasks: 8, currentTasks: 4, reportsTo: 112 },
  { id: 63, name: "Controlador Financeiro", status: "active", avatar: "📉", color: "#84cc16", role: "specialist", permissions: ["read","write","calculate"], department: ["cobrancas"], canOrchestrate: false, maxConcurrentTasks: 10, currentTasks: 6, reportsTo: 62 },
  { id: 64, name: "Negociador de Honorários", status: "active", avatar: "🤝", color: "#a3e635", role: "executor", permissions: ["read","write","contact_client"], department: ["cobrancas"], canOrchestrate: false, maxConcurrentTasks: 15, currentTasks: 8, reportsTo: 62 },
  { id: 65, name: "Relatórios Financeiros", status: "active", avatar: "📊", color: "#a3e635", role: "executor", permissions: ["read","write"], department: ["cobrancas"], canOrchestrate: false, maxConcurrentTasks: 5, currentTasks: 2, reportsTo: 62 },

  // ══════════════════════════════════════════════════════════════
  // ── COMPLIANCE (5 agentes) ── Diretor → Gerente → Times
  // ══════════════════════════════════════════════════════════════
  { id: 113, name: "Diretor de Compliance", status: "active", avatar: "🛡️", color: "#0ea5e9", role: "director", permissions: ["read","write","approve","admin"], department: ["compliance","diretoria"], canOrchestrate: true, maxConcurrentTasks: 10, currentTasks: 3, reportsTo: 0 },
  { id: 66, name: "Gerente de Compliance", status: "active", avatar: "🛡️", color: "#0ea5e9", role: "manager", permissions: ["read","write","approve"], department: ["compliance"], canOrchestrate: true, maxConcurrentTasks: 8, currentTasks: 3, reportsTo: 113 },
  { id: 67, name: "Auditor Interno", status: "active", avatar: "🔬", color: "#0ea5e9", role: "reviewer", permissions: ["read","approve"], department: ["compliance"], canOrchestrate: false, maxConcurrentTasks: 10, currentTasks: 5, reportsTo: 66 },
  { id: 68, name: "Agente LGPD", status: "active", avatar: "🔒", color: "#38bdf8", role: "specialist", permissions: ["read","write","approve"], department: ["compliance"], canOrchestrate: false, maxConcurrentTasks: 8, currentTasks: 4, reportsTo: 66 },
  { id: 69, name: "Monitor Regulatório", status: "active", avatar: "📜", color: "#38bdf8", role: "monitor", permissions: ["read","monitor"], department: ["compliance"], canOrchestrate: false, maxConcurrentTasks: 15, currentTasks: 7, reportsTo: 66 },

  // ══════════════════════════════════════════════════════════════
  // ── FAMÍLIA E SUCESSÕES (6 agentes) ── Diretor → Gerente → Times
  // ══════════════════════════════════════════════════════════════
  { id: 114, name: "Diretor de Família e Sucessões", status: "active", avatar: "👨‍👩‍👧‍👦", color: "#a855f7", role: "director", permissions: ["read","write","approve","admin"], department: ["familia","diretoria"], canOrchestrate: true, maxConcurrentTasks: 10, currentTasks: 3, reportsTo: 0 },
  { id: 70, name: "Gerente de Família", status: "active", avatar: "👨‍👩‍👧‍👦", color: "#a855f7", role: "manager", permissions: ["read","write","approve"], department: ["familia"], canOrchestrate: true, maxConcurrentTasks: 10, currentTasks: 5, reportsTo: 114 },
  { id: 71, name: "Pesquisador Família", status: "active", avatar: "📚", color: "#a855f7", role: "specialist", permissions: ["read","write","execute"], department: ["familia"], canOrchestrate: false, maxConcurrentTasks: 8, currentTasks: 4, reportsTo: 70 },
  { id: 72, name: "Redator Família", status: "active", avatar: "📝", color: "#c084fc", role: "executor", permissions: ["read","write","petition"], department: ["familia"], canOrchestrate: false, maxConcurrentTasks: 5, currentTasks: 3, reportsTo: 70 },
  { id: 73, name: "Mediador Familiar", status: "active", avatar: "🤝", color: "#c084fc", role: "specialist", permissions: ["read","write","contact_client"], department: ["familia"], canOrchestrate: false, maxConcurrentTasks: 6, currentTasks: 2, reportsTo: 70 },
  { id: 74, name: "Especialista Inventários", status: "active", avatar: "📜", color: "#d8b4fe", role: "specialist", permissions: ["read","write","calculate"], department: ["familia"], canOrchestrate: false, maxConcurrentTasks: 5, currentTasks: 3, reportsTo: 70 },

  // ══════════════════════════════════════════════════════════════
  // ── CONSULTA PROCESSUAL & COMUNICAÇÃO AO CLIENTE (8 agentes)
  // ── Time que consulta processos e gera respostas fáceis para clientes leigos via recepção
  // ══════════════════════════════════════════════════════════════
  { id: 115, name: "Diretor de Comunicação ao Cliente", status: "active", avatar: "📨", color: "#06b6d4", role: "director", permissions: ["read","write","approve","admin","contact_client"], department: ["recepcao","diretoria"], canOrchestrate: true, maxConcurrentTasks: 10, currentTasks: 4, reportsTo: 0, description: "Dirige o time que traduz linguagem jurídica em linguagem acessível ao cliente" },
  { id: 75, name: "Gerente de Consulta Processual", status: "active", avatar: "🔎", color: "#06b6d4", role: "manager", permissions: ["read","write","approve","contact_client"], department: ["recepcao","monitoramento"], canOrchestrate: true, maxConcurrentTasks: 8, currentTasks: 5, reportsTo: 115, description: "Gerencia o fluxo de consulta de processos e geração de respostas simplificadas" },
  { id: 76, name: "Consultor de Andamento", status: "active", avatar: "📋", color: "#22d3ee", role: "specialist", permissions: ["read","monitor","execute"], department: ["recepcao","monitoramento"], canOrchestrate: false, maxConcurrentTasks: 50, currentTasks: 30, maxProcessesMonitored: 50, reportsTo: 75, description: "Consulta o andamento processual nos tribunais e extrai informações relevantes" },
  { id: 77, name: "Simplificador Jurídico", status: "active", avatar: "💡", color: "#22d3ee", role: "specialist", permissions: ["read","write","execute"], department: ["recepcao"], canOrchestrate: false, maxConcurrentTasks: 15, currentTasks: 8, reportsTo: 75, description: "Traduz decisões judiciais e termos jurídicos em linguagem simples e acessível" },
  { id: 78, name: "Redator de Respostas ao Cliente", status: "active", avatar: "✏️", color: "#67e8f9", role: "executor", permissions: ["read","write","contact_client"], department: ["recepcao"], canOrchestrate: false, maxConcurrentTasks: 20, currentTasks: 12, reportsTo: 75, description: "Redige mensagens claras e humanizadas para enviar ao cliente via recepção" },
  { id: 79, name: "Revisor de Comunicação", status: "active", avatar: "✅", color: "#67e8f9", role: "reviewer", permissions: ["read","approve","contact_client"], department: ["recepcao"], canOrchestrate: false, maxConcurrentTasks: 15, currentTasks: 7, reportsTo: 75, description: "Revisa respostas antes do envio ao cliente para garantir precisão e clareza" },
  { id: 80, name: "Agente de Envio via Recepção", status: "active", avatar: "📤", color: "#06b6d4", role: "executor", permissions: ["read","write","contact_client","schedule"], department: ["recepcao"], canOrchestrate: false, maxConcurrentTasks: 25, currentTasks: 14, reportsTo: 75, description: "Envia a resposta final ao cliente via WhatsApp/email pela recepção" },
  { id: 81, name: "Monitor de Satisfação", status: "active", avatar: "⭐", color: "#a5f3fc", role: "monitor", permissions: ["read","monitor","contact_client"], department: ["recepcao"], canOrchestrate: false, maxConcurrentTasks: 30, currentTasks: 10, reportsTo: 115, description: "Monitora se o cliente entendeu a resposta e se precisa de esclarecimentos adicionais" },
];

// ── ORCHESTRATION ENGINE ────────────────────────────────────
function getAgentsForDepartment(deptId: string): Agent[] {
  return AGENTS.filter(a => a.department.includes("*") || a.department.includes(deptId));
}

function getAgentLoad(agent: Agent): number {
  return Math.round((agent.currentTasks / agent.maxConcurrentTasks) * 100);
}

function canAgentPerform(agent: Agent, permission: AgentPermission): boolean {
  return agent.permissions.includes(permission) || agent.permissions.includes("admin");
}

function getOrchestrators(): Agent[] {
  return AGENTS.filter(a => a.canOrchestrate && a.status !== "idle");
}

function getAvailableAgents(): Agent[] {
  return AGENTS.filter(a => a.currentTasks < a.maxConcurrentTasks);
}

function getAgentsByRole(role: AgentRole): Agent[] {
  return AGENTS.filter(a => a.role === role);
}

function getTotalCapacity(): { used: number; total: number; percentage: number } {
  const used = AGENTS.reduce((s, a) => s + a.currentTasks, 0);
  const total = AGENTS.reduce((s, a) => s + a.maxConcurrentTasks, 0);
  return { used, total, percentage: Math.round((used / total) * 100) };
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
      title: "Bom dia, Dr. Agent Jus IA ✦",
      summary: "Aqui está sua visão operacional de hoje",
      items: [
        { icon: "⚠", label: "Prazos críticos",      value: "3", accent: "#ef4444" },
        { icon: "✦", label: "Revisões pendentes",    value: "12", accent: "#f59e0b" },
        { icon: "◈", label: "Novos contratos",       value: "2", accent: "#2dd4a0" },
        { icon: "⬡", label: "Audiências esta semana",value: "7", accent: "#4f8ef7" },
        { icon: "◉", label: "Leads qualificados",    value: "5", accent: "#c9a84c" },
        { icon: "⬠", label: "Protocolos em fila",   value: "9", accent: "#a78bfa" },
      ],
    },
    timestamp: "08:00",
  },
  {
    id: 2, role: "user",
    content: "Mostre os casos mais urgentes do bancário hoje",
    timestamp: "08:03",
  },
  {
    id: 3, role: "assistant", agent: "Pesquisador Jurídico",
    content: "Identifiquei **3 casos críticos** no departamento bancário. O caso #0023847 tem prazo fatal **hoje às 17h** para contestação. Recomendo acionar o Redator Processual imediatamente.",
    card: {
      type: "process-list",
      processes: PROCESSES.filter(p => p.area === "Bancário" || p.area === "Cível"),
    },
    timestamp: "08:03",
  },
];

const TASK_QUEUES = [
  { id: "confeccao", label: "📝 Confecção de Peças", color: "#8b5cf6", items: [
    { id: "t1", title: "Petição inicial – Caso #0023847", client: "Marcos V.", priority: "critical" as const, agent: "Redator de Petições", status: "em andamento" },
    { id: "t2", title: "Contestação – Caso #0019234", client: "Ana Paula F.", priority: "high" as const, agent: "Redator Trabalhista", status: "aguardando" },
    { id: "t3", title: "Recurso de apelação – Caso #0031102", client: "Roberto M.", priority: "medium" as const, agent: "Agente Recursal", status: "em andamento" },
    { id: "t4", title: "Razões finais – Caso #0041887", client: "Clínica São Lucas", priority: "low" as const, agent: "Redator de Petições", status: "aguardando" },
  ]},
  { id: "protocolar", label: "📋 A Protocolar", color: "#6366f1", items: [
    { id: "t5", title: "Protocolar inicial #0023847", client: "Marcos V.", priority: "critical" as const, agent: "Uploader de Sistema", status: "pronto" },
    { id: "t6", title: "Protocolar contestação #0019234", client: "Ana Paula F.", priority: "high" as const, agent: "Coletor de Documentos Proto.", status: "aguardando docs" },
    { id: "t7", title: "Protocolar recurso #0031102", client: "Roberto M.", priority: "medium" as const, agent: "Verificador de Envio", status: "verificando" },
  ]},
  { id: "revisao", label: "🔍 Em Revisão", color: "#f59e0b", items: [
    { id: "t8", title: "Revisar cálculos – Caso #0031102", client: "Roberto M.", priority: "high" as const, agent: "Revisor de Cálculos 1", status: "revisão 1/3" },
    { id: "t9", title: "Revisar petição – Caso #0023847", client: "Marcos V.", priority: "critical" as const, agent: "Analista de Contratos", status: "aprovação pendente" },
  ]},
  { id: "comunicacao", label: "💬 Comunicação ao Cliente", color: "#06b6d4", items: [
    { id: "t10", title: "Informar andamento – Caso #0019234", client: "Ana Paula F.", priority: "medium" as const, agent: "Simplificador Jurídico", status: "redigindo" },
    { id: "t11", title: "Confirmar audiência – Caso #0031102", client: "Roberto M.", priority: "high" as const, agent: "Agente de Envio via Recepção", status: "aguardando aprovação" },
    { id: "t12", title: "Enviar resultado – Caso #0041887", client: "Clínica São Lucas", priority: "low" as const, agent: "Redator de Respostas ao Cliente", status: "redigindo" },
  ]},
  { id: "audiencias_fila", label: "🏛️ Preparação de Audiências", color: "#14b8a6", items: [
    { id: "t13", title: "Preparar docs – Audiência 15/04", client: "Marcos V.", priority: "critical" as const, agent: "Preparador Audiência Trab.", status: "em andamento" },
    { id: "t14", title: "Lembrete 3 dias – Audiência 17/04", client: "Ana Paula F.", priority: "high" as const, agent: "Lembrete 3 Dias", status: "agendado" },
  ]},
  { id: "monitoramento_fila", label: "🔍 Monitoramento de Resultados", color: "#f97316", items: [
    { id: "t15", title: "Verificar deferimento – Caso #0019234", client: "Ana Paula F.", priority: "medium" as const, agent: "Analisador Deferimento", status: "consultando" },
    { id: "t16", title: "Verificar movimentação – Caso #0031102", client: "Roberto M.", priority: "medium" as const, agent: "Scanner de Movimentações", status: "monitorando" },
  ]},
];

const QUICK_COMMANDS = [
  "Gerar petição inicial",
  "Ver prazos fatais",
  "Resumir caso",
  "Avisar cliente",
  "Abrir fila de revisão",
  "Relatório do dia",
];

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
      --gold:     #c9a84c;
      --gold2:    #e8c96a;
      --blue:     #4f8ef7;
      --teal:     #2dd4a0;
      --purple:   #a78bfa;
      --red:      #ef4444;
      --amber:    #f59e0b;
      --theme-transition: 0.4s cubic-bezier(0.4, 0, 0.2, 1);
    }

    /* DARK THEME */
    [data-theme="dark"] {
      --bg:       #09090f;
      --bg2:      #111118;
      --bg3:      #16161f;
      --bg4:      #1d1d28;
      --border:   #252534;
      --border2:  #2e2e42;
      --text1:    #eeeef5;
      --text2:    #9898b0;
      --text3:    #5a5a72;
      --logo-text: #0a0a12;
      --user-bubble-bg: rgba(201,168,76,0.08);
      --user-bubble-border: rgba(201,168,76,0.2);
      --scrollbar-thumb: var(--border2);
      --badge-bg: rgba(255,255,255,0.07);
    }

    /* LIGHT THEME */
    [data-theme="light"] {
      --bg:       #f5f5f7;
      --bg2:      #ffffff;
      --bg3:      #f0f0f4;
      --bg4:      #e8e8ee;
      --border:   #d8d8e0;
      --border2:  #c8c8d4;
      --text1:    #1a1a2e;
      --text2:    #5a5a72;
      --text3:    #8888a0;
      --logo-text: #0a0a12;
      --user-bubble-bg: rgba(201,168,76,0.06);
      --user-bubble-border: rgba(201,168,76,0.25);
      --scrollbar-thumb: var(--border2);
      --badge-bg: rgba(0,0,0,0.06);
    }

    /* SMOOTH THEME TRANSITIONS */
    body, .jc-root, .jc-sidebar, .jc-main, .jc-topbar, .jc-right-panel,
    .jc-input-area, .jc-msg-bubble, .jc-card-briefing, .jc-kpi,
    .jc-case-card, .jc-alert-item, .jc-nav-item, .jc-search,
    .jc-input-row, .jc-cmd, .jc-user-chip, .jc-theme-toggle,
    .jc-agent-item, .jc-process-row, .jc-right-tab, .jc-agents-section {
      transition: background-color var(--theme-transition),
                  border-color var(--theme-transition),
                  color var(--theme-transition),
                  box-shadow var(--theme-transition);
    }

    body { background: var(--bg); color: var(--text1); font-family: var(--font-body); }

    .jc-root { display: flex; height: 100vh; overflow: hidden; background: var(--bg); }

    /* ── SIDEBAR ── */
    .jc-sidebar {
      width: 260px; min-width: 260px;
      background: var(--bg2);
      border-right: 1px solid var(--border);
      display: flex; flex-direction: column;
      overflow: hidden;
      transition: transform 0.3s ease, opacity 0.3s ease;
    }
    .jc-logo {
      padding: 20px 20px 16px;
      border-bottom: 1px solid var(--border);
      display: flex; align-items: center; gap: 10px;
    }
    .jc-logo-mark {
      width: 32px; height: 32px;
      background: linear-gradient(135deg, var(--gold), var(--gold2));
      border-radius: 8px;
      display: flex; align-items: center; justify-content: center;
      font-size: 16px; font-weight: 700; color: var(--logo-text);
      font-family: var(--font-disp);
      box-shadow: 0 0 16px rgba(201,168,76,0.35);
    }
    .jc-logo-text { font-family: var(--font-disp); font-size: 18px; font-weight: 600; letter-spacing: 0.02em; color: var(--text1); }
    .jc-logo-sub  { font-size: 9px; color: var(--text3); letter-spacing: 0.12em; text-transform: uppercase; }

    .jc-search {
      margin: 12px 12px 8px;
      background: var(--bg3); border: 1px solid var(--border);
      border-radius: 8px; padding: 8px 12px;
      display: flex; align-items: center; gap: 8px;
      cursor: text; transition: border-color 0.2s;
    }
    .jc-search:hover { border-color: var(--border2); }
    .jc-search input {
      background: none; border: none; outline: none;
      font-family: var(--font-body); font-size: 12px; color: var(--text2);
      width: 100%;
    }
    .jc-search input::placeholder { color: var(--text3); }

    .jc-nav { flex: 1; overflow-y: auto; padding: 4px 8px 8px; }
    .jc-nav::-webkit-scrollbar { width: 4px; }
    .jc-nav::-webkit-scrollbar-thumb { background: var(--scrollbar-thumb); border-radius: 4px; }

    .jc-section-label {
      font-size: 9px; letter-spacing: 0.14em; text-transform: uppercase;
      color: var(--text3); padding: 12px 8px 4px; font-weight: 600;
    }
    .jc-nav-item {
      display: flex; align-items: center; gap: 10px;
      padding: 8px 10px; border-radius: 8px; cursor: pointer;
      transition: background 0.15s; position: relative;
      margin-bottom: 1px;
    }
    .jc-nav-item:hover { background: var(--bg4); }
    .jc-nav-item.active { background: rgba(201,168,76,0.08); border: 1px solid rgba(201,168,76,0.15); }
    .jc-nav-icon { font-size: 14px; width: 20px; text-align: center; opacity: 0.85; }
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
      padding: 6px 8px; border-radius: 6px; cursor: pointer;
      transition: background 0.15s;
    }
    .jc-agent-item:hover { background: var(--bg3); }
    .jc-agent-avatar {
      width: 26px; height: 26px; border-radius: 6px;
      display: flex; align-items: center; justify-content: center;
      font-size: 9px; font-weight: 700; font-family: var(--font-mono);
      flex-shrink: 0;
    }
    .jc-agent-name { font-size: 11px; color: var(--text2); flex: 1; line-height: 1.2; }
    .jc-agent-dot {
      width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0;
    }
    .jc-agent-dot.active  { background: var(--teal); box-shadow: 0 0 6px rgba(45,212,160,0.6); animation: pulse 2s infinite; }
    .jc-agent-dot.idle    { background: var(--border2); }
    .jc-agent-dot.alert   { background: var(--red); box-shadow: 0 0 6px rgba(239,68,68,0.6); animation: pulse 1s infinite; }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }

    /* ── MAIN ── */
    .jc-main { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-width: 0; }

    /* TOPBAR */
    .jc-topbar {
      height: 52px; min-height: 52px;
      background: var(--bg2); border-bottom: 1px solid var(--border);
      display: flex; align-items: center; padding: 0 20px; gap: 12px;
    }
    .jc-dept-title { font-family: var(--font-disp); font-size: 20px; font-weight: 600; color: var(--text1); letter-spacing: 0.01em; }
    .jc-dept-sub   { font-size: 11px; color: var(--text3); letter-spacing: 0.08em; text-transform: uppercase; margin-top: 1px; }
    .jc-topbar-spacer { flex: 1; }
    .jc-alert-chip {
      display: flex; align-items: center; gap: 6px;
      padding: 5px 10px; border-radius: 20px; cursor: pointer;
      font-size: 11px; font-weight: 500; border: 1px solid;
      transition: opacity 0.15s;
    }
    .jc-alert-chip:hover { opacity: 0.8; }
    .jc-alert-chip.fatal   { background: rgba(239,68,68,0.1); border-color: rgba(239,68,68,0.3); color: #ff8080; }
    .jc-alert-chip.warning { background: rgba(245,158,11,0.1); border-color: rgba(245,158,11,0.3); color: #fbbf24; }
    .jc-alert-chip.info    { background: rgba(79,142,247,0.1); border-color: rgba(79,142,247,0.3); color: #93c5fd; }
    .jc-alert-chip.success { background: rgba(45,212,160,0.1); border-color: rgba(45,212,160,0.3); color: #6ee7b7; }
    .jc-user-chip {
      display: flex; align-items: center; gap: 8px;
      padding: 4px 12px 4px 4px;
      background: var(--bg3); border: 1px solid var(--border);
      border-radius: 20px; cursor: pointer;
    }
    .jc-user-avatar {
      width: 26px; height: 26px; border-radius: 50%;
      background: linear-gradient(135deg, var(--gold), var(--gold2));
      display: flex; align-items: center; justify-content: center;
      font-size: 11px; font-weight: 700; color: var(--logo-text); font-family: var(--font-disp);
    }
    .jc-user-name { font-size: 12px; color: var(--text1); }

    /* THEME TOGGLE */
    .jc-theme-toggle {
      display: flex; align-items: center; gap: 6px;
      padding: 4px 10px; border-radius: 20px;
      background: var(--bg3); border: 1px solid var(--border);
      cursor: pointer; font-size: 14px;
      transition: all 0.2s;
      user-select: none;
    }
    .jc-theme-toggle:hover { border-color: var(--border2); }

    /* MESSAGES */
    .jc-messages {
      flex: 1; overflow-y: auto;
      padding: 24px 0;
      scroll-behavior: smooth;
    }
    .jc-messages::-webkit-scrollbar { width: 4px; }
    .jc-messages::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }

    .jc-msg-wrap {
      display: flex; gap: 12px;
      padding: 8px 24px; max-width: 860px; margin: 0 auto;
      animation: fadeUp 0.3s ease both;
    }
    @keyframes fadeUp {
      from { opacity: 0; transform: translateY(8px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    .jc-msg-wrap.user { flex-direction: row-reverse; }

    .jc-msg-avatar {
      width: 32px; height: 32px; min-width: 32px; border-radius: 8px;
      display: flex; align-items: center; justify-content: center;
      font-size: 11px; font-weight: 700; font-family: var(--font-mono);
    }
    .jc-msg-bubble {
      max-width: 72%; background: var(--bg3); border: 1px solid var(--border);
      border-radius: 12px; padding: 12px 14px;
      font-size: 13.5px; line-height: 1.65; color: var(--text1);
    }
    .jc-msg-wrap.user .jc-msg-bubble {
      background: var(--user-bubble-bg); border-color: var(--user-bubble-border);
    }
    .jc-msg-meta {
      font-size: 10px; color: var(--text3); margin-bottom: 4px;
      font-family: var(--font-mono); display: flex; align-items: center; gap: 6px;
    }
    .jc-msg-meta .agent-tag {
      font-size: 9px; padding: 2px 7px; border-radius: 4px;
      background: rgba(201,168,76,0.12); color: var(--gold); border: 1px solid rgba(201,168,76,0.2);
      font-family: var(--font-body); font-weight: 500; letter-spacing: 0.04em;
    }
    .jc-msg-text b, .jc-msg-text strong { color: var(--gold2); font-weight: 600; }

    /* BRIEFING CARD */
    .jc-card-briefing {
      background: linear-gradient(135deg, rgba(201,168,76,0.06), rgba(79,142,247,0.04));
      border: 1px solid rgba(201,168,76,0.2);
      border-radius: 14px; padding: 20px; margin-top: 2px;
    }
    .jc-card-briefing-title {
      font-family: var(--font-disp); font-size: 22px; font-weight: 600;
      color: var(--gold2); margin-bottom: 4px; letter-spacing: 0.01em;
    }
    .jc-card-briefing-sub { font-size: 12px; color: var(--text3); margin-bottom: 16px; }
    .jc-card-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
    .jc-kpi {
      background: var(--bg2); border: 1px solid var(--border);
      border-radius: 10px; padding: 12px; display: flex; flex-direction: column; gap: 4px;
      transition: border-color 0.2s;
    }
    .jc-kpi:hover { border-color: var(--border2); }
    .jc-kpi-icon { font-size: 16px; }
    .jc-kpi-value { font-family: var(--font-disp); font-size: 26px; font-weight: 600; line-height: 1; }
    .jc-kpi-label { font-size: 10px; color: var(--text3); text-transform: uppercase; letter-spacing: 0.08em; }

    /* PROCESS LIST CARD */
    .jc-card-processes { margin-top: 8px; display: flex; flex-direction: column; gap: 6px; }
    .jc-process-row {
      background: var(--bg2); border: 1px solid var(--border);
      border-radius: 10px; padding: 11px 14px;
      display: flex; align-items: center; gap: 12px; cursor: pointer;
      transition: all 0.2s;
    }
    .jc-process-row:hover { border-color: var(--border2); background: var(--bg3); transform: translateX(2px); }
    .jc-process-id { font-family: var(--font-mono); font-size: 10px; color: var(--text3); min-width: 72px; }
    .jc-process-client { font-size: 12.5px; font-weight: 500; flex: 1; color: var(--text1); }
    .jc-process-area { font-size: 10px; padding: 2px 8px; border-radius: 5px; }
    .jc-process-prazo { font-family: var(--font-mono); font-size: 10px; }
    .jc-process-badge {
      font-size: 9px; padding: 3px 8px; border-radius: 5px; font-weight: 600;
      text-transform: uppercase; letter-spacing: 0.06em;
    }
    .jc-process-badge.urgente { background: rgba(239,68,68,0.15); color: #ff8080; border: 1px solid rgba(239,68,68,0.25); }
    .jc-process-badge.normal  { background: rgba(79,142,247,0.12); color: #93c5fd; border: 1px solid rgba(79,142,247,0.2); }
    .jc-process-badge.revisar { background: rgba(245,158,11,0.12); color: #fbbf24; border: 1px solid rgba(245,158,11,0.2); }
    .jc-process-value { font-family: var(--font-mono); font-size: 11px; color: var(--teal); min-width: 80px; text-align: right; }

    /* THINKING INDICATOR */
    .jc-thinking {
      display: flex; align-items: center; gap: 4px; padding: 4px 0;
    }
    .jc-thinking span {
      width: 6px; height: 6px; border-radius: 50%; background: var(--gold);
      animation: thinking 1.2s infinite; display: inline-block;
    }
    .jc-thinking span:nth-child(2) { animation-delay: 0.2s; }
    .jc-thinking span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes thinking {
      0%, 60%, 100% { opacity: 0.2; transform: scale(0.8); }
      30% { opacity: 1; transform: scale(1.2); }
    }

    /* INPUT BAR */
    .jc-input-area {
      background: var(--bg2); border-top: 1px solid var(--border);
      padding: 12px 24px 16px;
    }
    .jc-commands { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; }
    .jc-cmd {
      font-size: 11px; padding: 4px 10px; border-radius: 16px;
      background: var(--bg3); border: 1px solid var(--border2);
      color: var(--text2); cursor: pointer; white-space: nowrap;
      transition: all 0.15s; font-family: var(--font-body);
    }
    .jc-cmd:hover { background: rgba(201,168,76,0.08); border-color: rgba(201,168,76,0.25); color: var(--gold2); }
    .jc-input-row {
      display: flex; align-items: flex-end; gap: 10px;
      background: var(--bg3); border: 1px solid var(--border2);
      border-radius: 14px; padding: 10px 14px;
      transition: border-color 0.2s;
    }
    .jc-input-row:focus-within { border-color: rgba(201,168,76,0.4); }
    .jc-textarea {
      flex: 1; background: none; border: none; outline: none; resize: none;
      font-family: var(--font-body); font-size: 14px; color: var(--text1);
      line-height: 1.5; max-height: 120px; min-height: 22px;
    }
    .jc-textarea::placeholder { color: var(--text3); }
    .jc-send-btn {
      width: 34px; height: 34px; border-radius: 9px;
      background: linear-gradient(135deg, var(--gold), var(--gold2));
      border: none; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      color: #0a0a12; font-size: 15px; font-weight: 700;
      transition: all 0.2s; flex-shrink: 0;
    }
    .jc-send-btn:hover { transform: scale(1.05); box-shadow: 0 0 16px rgba(201,168,76,0.4); }
    .jc-send-btn:disabled { opacity: 0.4; cursor: default; transform: none; }
    .jc-input-hint { font-size: 10px; color: var(--text3); text-align: center; margin-top: 6px; letter-spacing: 0.04em; }

    /* RIGHT PANEL */
    .jc-right-panel {
      width: 300px; min-width: 300px;
      background: var(--bg2); border-left: 1px solid var(--border);
      display: flex; flex-direction: column; overflow: hidden;
    }
    .jc-right-header {
      padding: 16px 16px 12px;
      border-bottom: 1px solid var(--border);
      font-family: var(--font-disp); font-size: 16px; font-weight: 600; color: var(--text1);
    }
    .jc-right-tabs {
      display: flex; border-bottom: 1px solid var(--border); padding: 0 12px;
    }
    .jc-right-tab {
      font-size: 11px; padding: 9px 12px; cursor: pointer; color: var(--text3);
      border-bottom: 2px solid transparent; transition: all 0.15s; white-space: nowrap;
      font-weight: 500;
    }
    .jc-right-tab.active { color: var(--gold); border-color: var(--gold); }
    .jc-right-body { flex: 1; overflow-y: auto; padding: 12px; }
    .jc-right-body::-webkit-scrollbar { width: 3px; }
    .jc-right-body::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }

    /* CASE CARD right panel */
    .jc-case-card {
      background: var(--bg3); border: 1px solid var(--border);
      border-radius: 10px; padding: 12px; margin-bottom: 8px;
      cursor: pointer; transition: all 0.2s;
    }
    .jc-case-card:hover { border-color: var(--border2); background: var(--bg4); }
    .jc-case-num { font-family: var(--font-mono); font-size: 10px; color: var(--text3); margin-bottom: 4px; }
    .jc-case-name { font-size: 13px; font-weight: 500; color: var(--text1); margin-bottom: 6px; }
    .jc-case-row { display: flex; justify-content: space-between; align-items: center; }
    .jc-case-area-tag { font-size: 10px; padding: 2px 7px; border-radius: 4px; font-weight: 500; }
    .jc-case-prazo-row { display: flex; align-items: center; gap: 4px; font-size: 10px; color: var(--text3); margin-top: 6px; }

    /* ALERT LIST */
    .jc-alert-item {
      display: flex; gap: 10px; align-items: flex-start;
      padding: 10px; border-radius: 8px; margin-bottom: 6px;
      border: 1px solid; cursor: pointer; transition: opacity 0.15s;
    }
    .jc-alert-item:hover { opacity: 0.8; }
    .jc-alert-item.fatal   { background: rgba(239,68,68,0.07); border-color: rgba(239,68,68,0.2); }
    .jc-alert-item.warning { background: rgba(245,158,11,0.07); border-color: rgba(245,158,11,0.2); }
    .jc-alert-item.info    { background: rgba(79,142,247,0.07); border-color: rgba(79,142,247,0.2); }
    .jc-alert-item.success { background: rgba(45,212,160,0.07); border-color: rgba(45,212,160,0.2); }
    .jc-alert-dot { width: 7px; height: 7px; border-radius: 50%; margin-top: 4px; flex-shrink: 0; }
    .jc-alert-item.fatal .jc-alert-dot   { background: var(--red); }
    .jc-alert-item.warning .jc-alert-dot { background: var(--amber); }
    .jc-alert-item.info .jc-alert-dot    { background: var(--blue); }
    .jc-alert-item.success .jc-alert-dot { background: var(--teal); }
    .jc-alert-text { font-size: 11.5px; color: var(--text1); line-height: 1.4; flex: 1; }
    .jc-alert-time { font-size: 9px; color: var(--text3); font-family: var(--font-mono); white-space: nowrap; }

    /* MOBILE OVERLAY */
    .jc-sidebar-overlay {
      display: none;
      position: fixed; inset: 0; z-index: 40;
      background: rgba(0,0,0,0.5);
    }
    .jc-sidebar-overlay.visible { display: block; }

    /* HAMBURGER */
    .jc-hamburger {
      display: none;
      background: none; border: none; cursor: pointer;
      font-size: 20px; color: var(--text1); padding: 4px;
      line-height: 1;
    }

    /* MOBILE RIGHT PANEL TOGGLE */
    .jc-right-toggle {
      display: none;
      background: var(--bg3); border: 1px solid var(--border);
      border-radius: 8px; padding: 6px 10px; cursor: pointer;
      font-size: 11px; color: var(--text2);
      transition: all 0.15s;
    }
    .jc-right-toggle:hover { border-color: var(--border2); color: var(--text1); }

    /* SCROLLBAR global tweak */
    * { scrollbar-color: var(--border) transparent; scrollbar-width: thin; }

    /* ── RESPONSIVE ── */
    @media (max-width: 1024px) {
      .jc-right-panel { display: none; }
      .jc-right-panel.mobile-visible {
        display: flex;
        position: fixed; right: 0; top: 0; bottom: 0; z-index: 50;
        width: 300px;
        box-shadow: -4px 0 24px rgba(0,0,0,0.3);
      }
      .jc-right-toggle { display: block; }
    }

    @media (max-width: 768px) {
      .jc-sidebar {
        position: fixed; left: 0; top: 0; bottom: 0; z-index: 50;
        transform: translateX(-100%);
        box-shadow: 4px 0 24px rgba(0,0,0,0.3);
      }
      .jc-sidebar.mobile-open { transform: translateX(0); }
      .jc-sidebar-overlay.visible { display: block; }
      .jc-hamburger { display: block; }

      .jc-topbar { padding: 0 12px; gap: 8px; }
      .jc-alert-chip { display: none; }
      .jc-dept-title { font-size: 16px; }
      .jc-dept-sub { font-size: 9px; }

      .jc-msg-wrap { padding: 8px 12px; }
      .jc-msg-bubble { max-width: 85%; font-size: 13px; }
      .jc-card-grid { grid-template-columns: 1fr 1fr; }

      .jc-input-area { padding: 8px 12px 12px; }
      .jc-commands { gap: 4px; }
      .jc-cmd { font-size: 10px; padding: 3px 8px; }

      .jc-process-row { flex-wrap: wrap; gap: 6px; padding: 10px; }
      .jc-process-id { min-width: auto; }
      .jc-process-value { min-width: auto; }
    }

    @media (max-width: 480px) {
      .jc-card-grid { grid-template-columns: 1fr 1fr; gap: 6px; }
      .jc-kpi { padding: 8px; }
      .jc-kpi-value { font-size: 20px; }
      .jc-card-briefing { padding: 14px; }
      .jc-card-briefing-title { font-size: 18px; }
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
            <div className="jc-kpi-icon" style={{ color: item.accent }}>{item.icon}</div>
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
            {p.prazo === "HOJE" ? "⚠ HOJE" : `⏱ ${p.prazo}`}
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
    "Gerador de Relatórios": "#34d399",
  };
  const isUser = msg.role === "user";
  const color = agentColors[msg.agent] || "#4f8ef7";

  return (
    <div className={`jc-msg-wrap ${isUser ? "user" : ""}`}>
      {!isUser && (
        <div className="jc-msg-avatar" style={{ background: `${color}20`, color, border: `1px solid ${color}30`, fontSize: 11 }}>
          {msg.agent ? msg.agent.split(" ").map((w: string) => w[0]).join("").slice(0, 2) : "AI"}
        </div>
      )}
      {isUser && (
        <div className="jc-msg-avatar" style={{ background: "rgba(201,168,76,0.15)", color: "#c9a84c", border: "1px solid rgba(201,168,76,0.25)", fontFamily: "'Cormorant Garamond', serif", fontSize: 14 }}>
          JC
        </div>
      )}
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
        {agent.split(" ").map((w: string) => w[0]).join("").slice(0, 2)}
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

// ── MAIN COMPONENT ───────────────────────────────────────────
export default function JurisCloudOS() {
  const navigate = useNavigate();
  const { user, userRoles, signOut } = useAuth();
  const { canAccessDepartment, canAccessAdmin, canAccessClients, canEdit, isReadOnly, roleLabel } = usePermissions();
  const [activeDept, setActiveDept]     = useState("assistente");
  const [messages, setMessages]         = useState<any[]>(INITIAL_MESSAGES);
  const [inputVal, setInputVal]         = useState("");
  const [thinking, setThinking]         = useState(false);
  const [rightTab, setRightTab]         = useState("processos");
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [theme, setTheme]               = useState<Theme>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("jc-theme") as Theme) || "dark";
    }
    return "dark";
  });
  const [sidebarOpen, setSidebarOpen]   = useState(false);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef    = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, thinking]);

  useEffect(() => {
    localStorage.setItem("jc-theme", theme);
  }, [theme]);

  const toggleTheme = () => setTheme(t => t === "dark" ? "light" : "dark");

  const handleSend = (text?: string) => {
    const val = (text || inputVal).trim();
    if (!val) return;
    const userMsg = { id: Date.now(), role: "user", content: val, timestamp: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) };
    setMessages(prev => [...prev, userMsg]);
    setInputVal("");
    setThinking(true);

    setTimeout(() => {
      setThinking(false);
      const agentResponses = [
        { agent: "Pesquisador Jurídico", content: "Encontrei **3 precedentes relevantes** no TJBA relacionados à sua consulta. O mais recente é de março/2026 e fortalece a tese de revisão contratual. Deseja que eu prepare uma minuta com essas citações?" },
        { agent: "Controlador de Prazos", content: "⚠ Atenção: detectei **2 prazos críticos** para os próximos 3 dias úteis. O caso #0023847 (Bancário) vence **hoje às 17h**. Recomendo acionar o Redator Processual imediatamente." },
        { agent: "Redator Processual",   content: "Posso gerar a **petição inicial** ou **contestação** com base nos documentos do cliente. Para iniciar, preciso confirmar: qual a vara e tribunal de destino?" },
        { agent: "Meu Assistente",       content: "Entendido. Estou **orquestrando os agentes necessários** para atender sua solicitação. O Pesquisador Jurídico está mapeando jurisprudência e o Controlador de Prazos verificando impactos." },
      ];
      const response = agentResponses[Math.floor(Math.random() * agentResponses.length)];
      const asstMsg = {
        id: Date.now() + 1, role: "assistant", agent: response.agent,
        content: response.content,
        timestamp: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages(prev => [...prev, asstMsg]);
    }, 1800 + Math.random() * 600);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const activeDeptData = DEPARTMENTS.find(d => d.id === activeDept);
  const areaColors: Record<string, string> = { "Bancário": "#2dd4a0", "Cível": "#a78bfa", "Previdenciário": "#f59e0b", "Contratos": "#4f8ef7" };

  return (
    <div data-theme={theme}>
      <GlobalStyles theme={theme} />
      <div className="jc-root">

        {/* MOBILE SIDEBAR OVERLAY */}
        <div
          className={`jc-sidebar-overlay ${sidebarOpen ? "visible" : ""}`}
          onClick={() => setSidebarOpen(false)}
        />

        {/* ── SIDEBAR ── */}
        <aside className={`jc-sidebar ${sidebarOpen ? "mobile-open" : ""}`}>
          <div className="jc-logo">
            <div className="jc-logo-mark">A</div>
            <div>
              <div className="jc-logo-text">Agent Jus IA</div>
              <div className="jc-logo-sub">Sistema Inteligente · OAB/BA 12.345</div>
            </div>
          </div>

          <div className="jc-search">
            <span style={{ fontSize: 12, color: "var(--text3)" }}>⌕</span>
            <input
              placeholder="Buscar processo, cliente..."
              value={sidebarSearch}
              onChange={e => setSidebarSearch(e.target.value)}
            />
          </div>

          <nav className="jc-nav">
            <div className="jc-section-label">Departamentos</div>
            {DEPARTMENTS.filter(dept => canAccessDepartment(dept.id)).map(dept => (
              <div
                key={dept.id}
                className={`jc-nav-item ${activeDept === dept.id ? "active" : ""}`}
                onClick={() => { setActiveDept(dept.id); setSidebarOpen(false); }}
              >
                <span className="jc-nav-icon" style={{ color: dept.color }}>{dept.icon}</span>
                <span className="jc-nav-label">{dept.label}</span>
                {dept.badge > 0 && (
                  <span className={`jc-nav-badge ${dept.badge >= 8 ? "alert" : ""}`}>{dept.badge}</span>
                )}
              </div>
            ))}

            <div className="jc-section-label" style={{ marginTop: 8 }}>Sistema</div>
            {canAccessClients && (
              <div className="jc-nav-item" onClick={() => navigate("/clientes")}>
                <span className="jc-nav-icon" style={{ color: "#2dd4a0" }}>👥</span>
                <span className="jc-nav-label">Clientes</span>
              </div>
            )}
            {canAccessAdmin && (
              <div className="jc-nav-item" onClick={() => navigate("/admin")}>
                <span className="jc-nav-icon" style={{ color: "#c9a84c" }}>👑</span>
                <span className="jc-nav-label">Administração</span>
              </div>
            )}
            <div className="jc-nav-item" onClick={() => navigate("/perfil")}>
              <span className="jc-nav-icon" style={{ color: "#a78bfa" }}>👤</span>
              <span className="jc-nav-label">Meu Perfil</span>
            </div>
            <div className="jc-nav-item" onClick={() => signOut()}>
              <span className="jc-nav-icon" style={{ color: "#ef4444" }}>🚪</span>
              <span className="jc-nav-label">Sair</span>
            </div>
          </nav>

          <div className="jc-agents-section">
            <div className="jc-section-label">Agentes do {activeDeptData?.label || "Departamento"} ({getAgentsForDepartment(activeDept).length})</div>
            {getAgentsForDepartment(activeDept).slice(0, 8).map(agent => (
              <div className="jc-agent-item" key={agent.id}>
                <div className="jc-agent-avatar" style={{ background: `${agent.color}18`, color: agent.color, border: `1px solid ${agent.color}25`, fontSize: 14 }}>
                  {agent.avatar}
                </div>
                <div className="jc-agent-name">{agent.name}</div>
                <div className={`jc-agent-dot ${agent.status}`} />
              </div>
            ))}
            {getAgentsForDepartment(activeDept).length > 8 && (
              <div style={{ fontSize: 10, color: "var(--text3)", padding: "4px 8px", textAlign: "center" }}>
                +{getAgentsForDepartment(activeDept).length - 8} agentes
              </div>
            )}
          </div>
        </aside>

        {/* ── MAIN COLUMN ── */}
        <main className="jc-main">

          {/* TOPBAR */}
          <header className="jc-topbar">
            <button className="jc-hamburger" onClick={() => setSidebarOpen(true)}>☰</button>
            <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
              <div className="jc-dept-title" style={{ color: activeDeptData?.color }}>
                {activeDeptData?.icon} {activeDeptData?.label}
              </div>
              <div className="jc-dept-sub">Sistema Operacional Conversacional</div>
            </div>
            <div className="jc-topbar-spacer" />
            {ALERTS.slice(0, 2).map((a, i) => (
              <div key={i} className={`jc-alert-chip ${a.type}`}>
                <span>{a.type === "fatal" ? "⚠" : a.type === "warning" ? "◈" : a.type === "success" ? "✓" : "ℹ"}</span>
                <span>{a.text.slice(0, 28)}...</span>
              </div>
            ))}
            <button className="jc-theme-toggle" onClick={toggleTheme} title="Alternar tema">
              {theme === "dark" ? "☀️" : "🌙"}
            </button>
            <button className="jc-right-toggle" onClick={() => setRightPanelOpen(!rightPanelOpen)}>
              {rightPanelOpen ? "✕ Fechar" : "📋 Operações"}
            </button>
            <div className="jc-user-chip" onClick={() => signOut()} style={{ cursor: "pointer" }} title="Clique para sair">
              <div className="jc-user-avatar">{(user?.email || "U")[0].toUpperCase()}</div>
              <div className="jc-user-name">{user?.user_metadata?.display_name || user?.email?.split("@")[0] || "Usuário"}</div>
              {userRoles.length > 0 && (
                <span style={{ fontSize: 8, padding: "1px 5px", borderRadius: 3, background: "rgba(201,168,76,0.15)", color: "#c9a84c", textTransform: "uppercase", fontFamily: "var(--font-mono)" }}>
                  {userRoles[0]}
                </span>
              )}
            </div>
          </header>

          {/* MESSAGES */}
          <div className="jc-messages">
            {messages.map(msg => <MessageBubble key={msg.id} msg={msg} />)}
            {thinking && <ThinkingBubble agent={AGENTS[Math.floor(Math.random() * AGENTS.length)].name} />}
            <div ref={messagesEndRef} />
          </div>

          {/* INPUT */}
          <div className="jc-input-area">
            <div className="jc-commands">
              {QUICK_COMMANDS.map((cmd, i) => (
                <button key={i} className="jc-cmd" onClick={() => handleSend(cmd)}>/{cmd}</button>
              ))}
            </div>
            <div className="jc-input-row">
              <textarea
                ref={textareaRef}
                className="jc-textarea"
                placeholder={`Fale com os agentes do ${activeDeptData?.label || "departamento"}...`}
                value={inputVal}
                onChange={e => {
                  setInputVal(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
                }}
                onKeyDown={handleKeyDown}
                rows={1}
              />
              <button className="jc-send-btn" onClick={() => handleSend()} disabled={thinking || !inputVal.trim()}>
                ↑
              </button>
            </div>
            <div className="jc-input-hint">
              {isReadOnly && <span style={{ color: "#f59e0b", marginRight: 8 }}>🔒 Modo leitura ({roleLabel})</span>}
              Enter para enviar · Shift+Enter para nova linha · Use / para comandos rápidos
            </div>
          </div>
        </main>

        {/* ── RIGHT PANEL ── */}
        <aside className={`jc-right-panel ${rightPanelOpen ? "mobile-visible" : ""}`}>
          <div className="jc-right-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>Central de Operações</span>
          </div>
          <div className="jc-right-tabs">
            {["filas", "processos", "alertas", "agentes"].map(tab => (
              <div key={tab} className={`jc-right-tab ${rightTab === tab ? "active" : ""}`} onClick={() => setRightTab(tab)}>
                {tab === "filas" ? "Filas" : tab.charAt(0).toUpperCase() + tab.slice(1)}
              </div>
            ))}
          </div>
          <div className="jc-right-body">
            {rightTab === "filas" && (
              <>
                <div style={{ fontSize: 10, color: "var(--text3)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>
                  {TASK_QUEUES.reduce((s, q) => s + q.items.length, 0)} tarefas em fila
                </div>
                {TASK_QUEUES.map(queue => (
                  <div key={queue.id} style={{ marginBottom: 14 }}>
                    <div style={{
                      fontSize: 11, fontWeight: 600, color: queue.color, marginBottom: 6,
                      display: "flex", alignItems: "center", justifyContent: "space-between"
                    }}>
                      <span>{queue.label}</span>
                      <span style={{
                        fontSize: 9, padding: "2px 8px", borderRadius: 10,
                        background: `${queue.color}18`, color: queue.color,
                        border: `1px solid ${queue.color}30`, fontFamily: "var(--font-mono)"
                      }}>{queue.items.length}</span>
                    </div>
                    {queue.items.map(item => {
                      const prioColors: Record<string, string> = { critical: "#ef4444", high: "#f59e0b", medium: "#3b82f6", low: "#6b7280" };
                      const prioLabels: Record<string, string> = { critical: "CRÍTICO", high: "ALTA", medium: "MÉDIA", low: "BAIXA" };
                      return (
                        <div key={item.id} style={{
                          background: "var(--bg3)", border: "1px solid var(--border)",
                          borderLeft: `3px solid ${prioColors[item.priority]}`,
                          borderRadius: "0 8px 8px 0", padding: "10px 12px", marginBottom: 6,
                          transition: "background-color var(--theme-transition)"
                        }}>
                          <div style={{ fontSize: 11, fontWeight: 500, color: "var(--text1)", marginBottom: 4, lineHeight: 1.3 }}>
                            {item.title}
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                            <span style={{ fontSize: 9, color: "var(--text3)" }}>👤 {item.client}</span>
                            <span style={{ fontSize: 7, padding: "1px 5px", borderRadius: 3, background: `${prioColors[item.priority]}18`, color: prioColors[item.priority], fontWeight: 600, textTransform: "uppercase", fontFamily: "var(--font-mono)" }}>
                              {prioLabels[item.priority]}
                            </span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <span style={{ fontSize: 8, color: "var(--text3)" }}>🤖 {item.agent}</span>
                            <span style={{
                              fontSize: 8, padding: "2px 6px", borderRadius: 4,
                              background: item.status === "pronto" ? "rgba(45,212,160,0.15)" : item.status.includes("andamento") ? "rgba(59,130,246,0.15)" : "var(--badge-bg)",
                              color: item.status === "pronto" ? "var(--teal)" : item.status.includes("andamento") ? "#3b82f6" : "var(--text3)",
                              fontFamily: "var(--font-mono)"
                            }}>{item.status}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </>
            )}

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
                      <span className="jc-case-area-tag" style={{
                        background: `${areaColors[p.area] || "#4f8ef7"}18`,
                        color: areaColors[p.area] || "#4f8ef7",
                        border: `1px solid ${areaColors[p.area] || "#4f8ef7"}30`
                      }}>{p.area}</span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--teal)" }}>{p.value}</span>
                    </div>
                    <div className="jc-case-prazo-row">
                      <span style={{ color: p.prazo === "HOJE" ? "#ff8080" : "var(--text3)" }}>
                        {p.prazo === "HOJE" ? "⚠ Prazo HOJE" : `⏱ Prazo em ${p.prazo}`}
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
                    <div className="jc-alert-dot" />
                    <div className="jc-alert-text">{a.text}</div>
                    <div className="jc-alert-time">{a.time}</div>
                  </div>
                ))}
              </>
            )}

            {rightTab === "agentes" && (() => {
              const deptAgents = activeDept === "assistente" ? AGENTS : getAgentsForDepartment(activeDept);
              const capacity = getTotalCapacity();
              const roleLabels: Record<AgentRole, string> = { ceo: "👑 CEO", director: "👔 Diretor", orchestrator: "🎯 Orquestrador", manager: "📋 Gerente", specialist: "🔬 Especialista", reviewer: "✅ Revisor", executor: "⚡ Executor", monitor: "📡 Monitor" };
              const roleCounts = (["ceo","director","orchestrator","manager","specialist","reviewer","executor","monitor"] as AgentRole[]).map(r => ({ role: r, label: roleLabels[r], count: getAgentsByRole(r).length }));
              return (
                <>
                  <div style={{ fontSize: 10, color: "var(--text3)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>
                    {AGENTS.length} agentes total · {AGENTS.filter(a => a.status === "active").length} ativos
                  </div>
                  <div style={{ fontSize: 10, color: "var(--text2)", marginBottom: 8, padding: "8px", background: "var(--bg4)", borderRadius: 6, border: "1px solid var(--border)" }}>
                    <div style={{ marginBottom: 4 }}>📊 Capacidade Global: {capacity.used}/{capacity.total} tarefas ({capacity.percentage}%)</div>
                    <div style={{ background: "var(--bg)", borderRadius: 4, height: 6, overflow: "hidden", marginBottom: 6 }}>
                      <div style={{ width: `${capacity.percentage}%`, height: "100%", borderRadius: 4, background: capacity.percentage > 80 ? "var(--red)" : capacity.percentage > 50 ? "var(--amber)" : "var(--teal)", transition: "width 0.5s" }} />
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {roleCounts.map(r => (
                        <span key={r.role} style={{ fontSize: 8, padding: "2px 6px", borderRadius: 4, background: "var(--badge-bg)", color: "var(--text2)" }}>
                          {r.label}: {r.count}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div style={{ fontSize: 10, color: "var(--gold)", marginBottom: 8 }}>
                    {activeDept === "assistente" ? "Todos os departamentos" : `${activeDeptData?.icon} ${activeDeptData?.label}`} · {deptAgents.length} agentes
                  </div>
                  {deptAgents.map(agent => {
                    const load = getAgentLoad(agent);
                    return (
                      <div key={agent.id} style={{
                        background: "var(--bg3)", border: "1px solid var(--border)",
                        borderRadius: 10, padding: "12px", marginBottom: 8,
                        cursor: "pointer", transition: "border-color 0.2s, background-color var(--theme-transition)"
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                          <div style={{
                            width: 36, height: 36, borderRadius: 9,
                            background: `${agent.color}18`, color: agent.color,
                            border: `1px solid ${agent.color}25`,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 16, flexShrink: 0
                          }}>{agent.avatar}</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text1)", marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{agent.name}</div>
                            <div style={{ fontSize: 9, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                              {roleLabels[agent.role]} · {agent.status === "active" ? "● Ativo" : agent.status === "alert" ? "⚠ Alerta" : "○ Ocioso"}
                            </div>
                            {agent.reportsTo !== undefined && (() => {
                              const superior = AGENTS.find(a => a.id === agent.reportsTo);
                              return superior ? (
                                <div style={{ fontSize: 8, color: "var(--text3)", marginTop: 1 }}>
                                  ↳ reporta a: {superior.name}
                                </div>
                              ) : null;
                            })()}
                          </div>
                          <div className={`jc-agent-dot ${agent.status}`} />
                        </div>
                        <div style={{ background: "var(--bg)", borderRadius: 4, height: 4, marginBottom: 6, overflow: "hidden" }}>
                          <div style={{
                            width: `${load}%`, height: "100%", borderRadius: 4,
                            background: load > 80 ? "var(--red)" : load > 50 ? "var(--amber)" : "var(--teal)",
                            transition: "width 0.5s ease"
                          }} />
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div style={{ fontSize: 9, color: "var(--text3)" }}>
                            Carga: {load}% · {agent.currentTasks}/{agent.maxConcurrentTasks}
                          </div>
                          <div style={{ display: "flex", gap: 3, flexWrap: "wrap", justifyContent: "flex-end" }}>
                            {agent.permissions.slice(0, 4).map(p => (
                              <span key={p} style={{
                                fontSize: 7, padding: "1px 4px", borderRadius: 3,
                                background: p === "admin" ? "rgba(201,168,76,0.15)" : p === "approve" ? "rgba(45,212,160,0.15)" : "var(--badge-bg)",
                                color: p === "admin" ? "var(--gold)" : p === "approve" ? "var(--teal)" : "var(--text3)",
                                textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: "var(--font-mono)"
                              }}>{p}</span>
                            ))}
                            {agent.permissions.length > 4 && (
                              <span style={{ fontSize: 7, padding: "1px 4px", borderRadius: 3, background: "var(--badge-bg)", color: "var(--text3)", fontFamily: "var(--font-mono)" }}>+{agent.permissions.length - 4}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </>
              );
            })()}
          </div>
        </aside>

        {/* RIGHT PANEL OVERLAY (mobile) */}
        {rightPanelOpen && (
          <div
            style={{ position: "fixed", inset: 0, zIndex: 45, background: "rgba(0,0,0,0.4)" }}
            onClick={() => setRightPanelOpen(false)}
          />
        )}
      </div>
    </div>
  );
}
