export interface ToolDef {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

const READ_TOOLS = new Set([
  "consultar_cliente", "consultar_usuario", "consultar_tarefas", "consultar_processo", "consultar_documentos",
]);

export function isWriteTool(name: string): boolean {
  return !READ_TOOLS.has(name);
}

const str = (description: string) => ({ type: "string", description });

export const TOOLS: Record<string, ToolDef> = {
  consultar_cliente: { type: "function", function: {
    name: "consultar_cliente",
    description: "Busca clientes por nome ou CPF. Use antes de cadastrar (evita duplicata) ou para responder dados do cliente.",
    parameters: { type: "object", properties: { busca: str("nome ou CPF do cliente") }, required: ["busca"] },
  }},
  consultar_usuario: { type: "function", function: {
    name: "consultar_usuario",
    description: "Busca usuários/colaboradores do escritório por nome. Use para resolver 'para quem' antes de criar um card.",
    parameters: { type: "object", properties: { busca: str("nome do colaborador") }, required: ["busca"] },
  }},
  consultar_tarefas: { type: "function", function: {
    name: "consultar_tarefas",
    description: "Lista tarefas/cards. Filtros opcionais por cliente, responsável ou status.",
    parameters: { type: "object", properties: {
      client_id: str("id do cliente (opcional)"),
      assignee_user_id: str("id do responsável (opcional)"),
      status: str("status (opcional)"),
    }, required: [] },
  }},
  consultar_processo: { type: "function", function: {
    name: "consultar_processo",
    description: "Busca processos por número ou nome do cliente.",
    parameters: { type: "object", properties: { busca: str("número do processo ou nome") }, required: ["busca"] },
  }},
  consultar_documentos: { type: "function", function: {
    name: "consultar_documentos",
    description: "Lista os documentos já anexados de um cliente.",
    parameters: { type: "object", properties: { client_id: str("id do cliente") }, required: ["client_id"] },
  }},
  cadastrar_cliente: { type: "function", function: {
    name: "cadastrar_cliente",
    description: "Cria um novo cliente. Confirme os dados com o usuário; deixe [A PREENCHER] o que faltar.",
    parameters: { type: "object", properties: {
      full_name: str("nome completo / razão social"),
      cpf: str("CPF (pessoa física)"),
      cnpj: str("CNPJ (pessoa jurídica)"),
      tipo_pessoa: { type: "string", enum: ["fisica", "juridica"], description: "tipo de pessoa" },
      email: str("e-mail"),
      phone: str("telefone/celular"),
    }, required: ["full_name"] },
  }},
  criar_card_tarefa: { type: "function", function: {
    name: "criar_card_tarefa",
    description: "Cria um card/tarefa atribuído a um colaborador. Resolva 'assignee_user_id' com consultar_usuario antes.",
    parameters: { type: "object", properties: {
      title: str("o que deve ser feito"),
      assignee_user_id: str("id do responsável (de consultar_usuario)"),
      deadline_at: str("prazo em ISO 8601 (ex.: 2026-07-03T18:00:00-03:00)"),
      area: str("área jurídica (opcional)"),
      prioridade: { type: "string", enum: ["critical","high","medium","low"], description: "prioridade" },
      client_id: str("id do cliente (opcional)"),
      task_type_id: str("id do tipo de tarefa"),
      descricao: str("detalhes (opcional)"),
    }, required: ["title", "assignee_user_id", "task_type_id"] },
  }},
  solicitar_documentos: { type: "function", function: {
    name: "solicitar_documentos",
    description: "Solicita documentos a outro assistente/colaborador.",
    parameters: { type: "object", properties: {
      to_user_id: str("id de quem recebe a solicitação"),
      client_id: str("id do cliente relacionado"),
      documentos: { type: "array", items: { type: "string" }, description: "lista de documentos pedidos" },
    }, required: ["to_user_id", "documentos"] },
  }},
  pedir_acesso_arquivos: { type: "function", function: {
    name: "pedir_acesso_arquivos",
    description: "Pede acesso a arquivos a outro colaborador.",
    parameters: { type: "object", properties: {
      to_user_id: str("id de quem concede acesso"),
      descricao: str("quais arquivos"),
      motivo: str("por que precisa"),
    }, required: ["to_user_id", "descricao"] },
  }},
  criar_pendencia: { type: "function", function: {
    name: "criar_pendencia",
    description: "Cria uma pendência interna (documentação, senha INSS, comprovante, etc.). Atribuída ao responsável indicado ou a quem cria.",
    parameters: { type: "object", properties: {
      tipo: { type: "string", enum: ["documentacao","comprovante_endereco","senha_inss","reset_inss","extratos","falta_documentacao","audiencia","reuniao","andamento","whatsapp","outro"], description: "tipo da pendência" },
      titulo: str("título / o que está pendente"),
      cliente_id: str("id do cliente (opcional)"),
      descricao: str("detalhes (opcional)"),
      responsavel_user_id: str("id do responsável (opcional; default = quem cria)"),
      prazo: str("prazo em ISO 8601 (opcional)"),
      data_fatal: str("data fatal AAAA-MM-DD (opcional)"),
    }, required: ["tipo", "titulo"] },
  }},
  transferir_pendencia: { type: "function", function: {
    name: "transferir_pendencia",
    description: "Transfere uma pendência para outro departamento e/ou responsável.",
    parameters: { type: "object", properties: {
      pendencia_id: str("id da pendência"),
      departamento_destino: str("departamento destino (org_stage, opcional)"),
      responsavel_destino: str("id do novo responsável (opcional)"),
    }, required: ["pendencia_id"] },
  }},
  resolver_pendencia: { type: "function", function: {
    name: "resolver_pendencia",
    description: "Marca uma pendência como resolvida; devolve ao gerador automaticamente quando aplicável.",
    parameters: { type: "object", properties: {
      pendencia_id: str("id da pendência"),
      resolucao: str("descrição da resolução (opcional)"),
    }, required: ["pendencia_id"] },
  }},
  agendar_reuniao: { type: "function", function: {
    name: "agendar_reuniao",
    description: "Agenda uma reunião com o cliente (presencial ou no Meet). Registrada como pendência do tipo reunião.",
    parameters: { type: "object", properties: {
      cliente_id: str("id do cliente (opcional)"),
      titulo: str("título da reunião"),
      data_hora_iso: str("data/hora em ISO 8601 (ex.: 2026-07-03T14:00:00-03:00)"),
      modalidade: { type: "string", enum: ["presencial","meet"], description: "modalidade" },
    }, required: ["titulo", "data_hora_iso"] },
  }},
};

export function toolsFor(allowed: string[] | null | undefined): ToolDef[] {
  if (!allowed || allowed.length === 0) return [];
  return allowed.filter((n) => TOOLS[n]).map((n) => TOOLS[n]);
}
