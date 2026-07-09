// Role-based visibility configuration
// Determines what each role can see: departments, commands, menu items, agent roles

export interface RoleVisibility {
  departments: string[] | "*";
  commands: string[];
  menuItems: string[];
  agentRolesVisible: string[] | "*";
  maxAgentsShown: number;
  showCapacityPanel: boolean;
  dashboardWidgets: string[];
  label: string;
}

export const ROLE_VISIBILITY: Record<string, RoleVisibility> = {
  admin: {
    departments: "*",
    commands: [
      "Gerar petição inicial", "Ver prazos fatais", "Resumir caso", "Avisar cliente",
      "Abrir fila de revisão", "Relatório do dia", "Ver gargalos", "Painel financeiro",
      "Gerenciar usuários", "Ver organograma", "Auditoria geral", "Status orquestração",
    ],
    menuItems: ["clientes", "agenda", "admin", "dashboard", "organograma", "eficiencia", "perfil", "site", "sair"],
    agentRolesVisible: "*",
    maxAgentsShown: 20,
    showCapacityPanel: true,
    dashboardWidgets: ["kpis", "alerts", "queues", "capacity", "bottlenecks"],
    label: "Administrador",
  },
  director: {
    departments: "*",
    commands: [
      "Gerar petição inicial", "Ver prazos fatais", "Resumir caso", "Avisar cliente",
      "Abrir fila de revisão", "Relatório do dia", "Ver gargalos", "Painel financeiro",
      "Ver organograma", "Status orquestração",
    ],
    menuItems: ["clientes", "dashboard", "organograma", "eficiencia", "perfil", "site", "sair"],
    agentRolesVisible: "*",
    maxAgentsShown: 15,
    showCapacityPanel: true,
    dashboardWidgets: ["kpis", "alerts", "queues", "capacity", "bottlenecks"],
    label: "Diretor",
  },
  manager: {
    departments: ["assistente", "recepcao", "civel", "trabalhista", "tributario", "protocolo", "calculos", "audiencias", "monitoramento", "cobrancas", "compliance", "familia"],
    commands: [
      "Ver prazos fatais", "Resumir caso", "Avisar cliente",
      "Abrir fila de revisão", "Relatório do dia", "Ver gargalos",
    ],
    menuItems: ["clientes", "dashboard", "eficiencia", "perfil", "sair"],
    agentRolesVisible: ["manager", "specialist", "reviewer", "executor", "monitor"],
    maxAgentsShown: 10,
    showCapacityPanel: true,
    dashboardWidgets: ["kpis", "alerts", "queues"],
    label: "Gerente",
  },
  lawyer: {
    departments: ["assistente", "civel", "trabalhista", "tributario", "audiencias", "monitoramento", "familia"],
    commands: [
      "Gerar petição inicial", "Ver prazos fatais", "Resumir caso",
      "Abrir fila de revisão", "Relatório do dia",
    ],
    menuItems: ["clientes", "agenda", "dashboard", "perfil", "sair"],
    agentRolesVisible: ["specialist", "reviewer", "executor", "monitor"],
    maxAgentsShown: 8,
    showCapacityPanel: false,
    dashboardWidgets: ["kpis", "alerts", "queues"],
    label: "Advogado",
  },
  receptionist: {
    departments: ["assistente", "recepcao"],
    commands: [
      "Avisar cliente", "Resumir caso", "Ver prazos fatais",
    ],
    menuItems: ["clientes", "agenda", "perfil", "sair"],
    agentRolesVisible: ["executor", "monitor"],
    maxAgentsShown: 5,
    showCapacityPanel: false,
    dashboardWidgets: ["kpis", "queues"],
    label: "Recepcionista",
  },
  intern: {
    departments: ["assistente", "recepcao", "civel", "trabalhista"],
    commands: [
      "Resumir caso", "Ver prazos fatais",
    ],
    menuItems: ["agenda", "perfil", "sair"],
    agentRolesVisible: ["executor"],
    maxAgentsShown: 4,
    showCapacityPanel: false,
    dashboardWidgets: ["kpis"],
    label: "Estagiário",
  },
  financial: {
    departments: ["assistente", "financeiro", "cobrancas"],
    commands: [
      "Painel financeiro", "Relatório do dia", "Ver gargalos",
    ],
    menuItems: ["dashboard", "perfil", "sair"],
    agentRolesVisible: ["manager", "specialist", "executor", "monitor"],
    maxAgentsShown: 8,
    showCapacityPanel: false,
    dashboardWidgets: ["kpis", "alerts"],
    label: "Financeiro",
  },
  marketing: {
    departments: ["assistente", "marketing", "criacao", "conversao"],
    commands: [
      "Relatório do dia", "Ver gargalos",
    ],
    menuItems: ["dashboard", "perfil", "sair"],
    agentRolesVisible: ["manager", "specialist", "executor", "monitor"],
    maxAgentsShown: 8,
    showCapacityPanel: false,
    dashboardWidgets: ["kpis", "alerts"],
    label: "Marketing",
  },
  protocol: {
    departments: ["assistente", "protocolo"],
    commands: [
      "Ver prazos fatais", "Relatório do dia",
    ],
    menuItems: ["perfil", "sair"],
    agentRolesVisible: ["executor", "reviewer"],
    maxAgentsShown: 6,
    showCapacityPanel: false,
    dashboardWidgets: ["kpis", "queues"],
    label: "Protocolo",
  },
  calculator: {
    departments: ["assistente", "calculos"],
    commands: [
      "Resumir caso", "Relatório do dia",
    ],
    menuItems: ["perfil", "sair"],
    agentRolesVisible: ["executor", "reviewer"],
    maxAgentsShown: 6,
    showCapacityPanel: false,
    dashboardWidgets: ["kpis", "queues"],
    label: "Calculista",
  },
  compliance: {
    departments: ["assistente", "compliance"],
    commands: [
      "Auditoria geral", "Relatório do dia",
    ],
    menuItems: ["perfil", "sair"],
    agentRolesVisible: ["specialist", "reviewer", "monitor"],
    maxAgentsShown: 5,
    showCapacityPanel: false,
    dashboardWidgets: ["kpis", "alerts"],
    label: "Compliance",
  },
  tech: {
    departments: "*",
    commands: [
      "Ver gargalos", "Relatório do dia", "Status orquestração", "Auditoria geral",
    ],
    menuItems: ["admin", "dashboard", "organograma", "eficiencia", "perfil", "sair"],
    agentRolesVisible: "*",
    maxAgentsShown: 20,
    showCapacityPanel: true,
    dashboardWidgets: ["kpis", "alerts", "queues", "capacity", "bottlenecks"],
    label: "Tecnologia",
  },
};

export function getRoleVisibility(role: string): RoleVisibility {
  return ROLE_VISIBILITY[role] || {
    departments: [],
    commands: [],
    menuItems: [],
    agentRolesVisible: [],
    maxAgentsShown: 0,
    showCapacityPanel: false,
    dashboardWidgets: [],
    label: "Desconhecido",
  };
}
