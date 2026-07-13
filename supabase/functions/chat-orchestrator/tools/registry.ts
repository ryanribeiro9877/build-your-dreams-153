export interface ToolDef {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

// Ferramentas de LEITURA (consulta a dado já cadastrado). Distintas das de
// ESCRITA: leitura roda no gate CHAT_READ_TOOLS_ENABLED (default ON) e a de
// cliente re-checa papel (is_recepcao_or_socio) na RPC; escrita segue no gate
// de 3 camadas (CHAT_TOOLS_ENABLED, default OFF).
export const READ_TOOL_NAMES: string[] = [
  "consultar_cliente", "consultar_usuario", "consultar_tarefas", "consultar_processo", "consultar_documentos",
  "consultar_cep",
];
const READ_TOOLS = new Set(READ_TOOL_NAMES);

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
  consultar_cep: { type: "function", function: {
    name: "consultar_cep",
    description: "Consulta um CEP (ViaCEP→BrasilAPI→OpenCEP) e retorna logradouro, bairro, cidade e UF. Use no cadastro quando o usuário informar o CEP: consulte, MOSTRE o endereço encontrado e peça a confirmação do usuário ANTES de gravar. Nunca invente endereço.",
    parameters: { type: "object", properties: { cep: str("CEP com 8 dígitos (com ou sem máscara)") }, required: ["cep"] },
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
      zip_code: str("CEP (só dígitos ou com máscara)"),
      address: str("logradouro (rua/avenida)"),
      address_number: str("número"),
      address_complement: str("complemento (opcional)"),
      neighborhood: str("bairro"),
      city: str("cidade"),
      state: str("UF (sigla do estado, ex.: MG)"),
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
  distribuir_caso: { type: "function", function: {
    name: "distribuir_caso",
    description: "Distribui um caso ao Kanban do seu tipo de ação: cria e placa o card na coluna inicial do board correspondente. Resolva o processo com consultar_processo ANTES e passe process_id. Informe tipo_acao_id quando o processo ainda não tem tipo definido. Bloqueado se o caso tiver pendência aberta.",
    parameters: { type: "object", properties: {
      process_id: str("id do processo/caso (de consultar_processo)"),
      tipo_acao_id: str("id do tipo de ação (opcional se o processo já tem tipo_acao_id definido)"),
      task_type_id: str("id do tipo de tarefa do card (opcional; default = configurado no tipo de ação)"),
      title: str("título do card (opcional; default = 'Caso: <número/cliente>')"),
    }, required: ["process_id"] },
  }},
  solicitar_checklist_documental: { type: "function", function: {
    name: "solicitar_checklist_documental",
    description: "Registra como PENDENTES os documentos que faltam de um cliente para uma ação/réu (ex.: 'Para Crefisa, solicite extrato e contrato'). Resolva o cliente com consultar_cliente ANTES e passe cliente_id. Cria UMA pendência documental por documento.",
    parameters: { type: "object", properties: {
      cliente_id: str("id do cliente (resolvido via consultar_cliente)"),
      documentos: { type: "array", items: { type: "string" }, description: "documentos a solicitar (ex.: extrato, contrato)" },
      reu: str("réu/banco/credor da ação (ex.: Crefisa, Agibank) — opcional"),
      responsavel_user_id: str("id do responsável pela cobrança (opcional; default = quem cria)"),
      prazo: str("prazo em ISO 8601 (opcional)"),
    }, required: ["cliente_id", "documentos"] },
  }},
};

export function toolsFor(allowed: string[] | null | undefined): ToolDef[] {
  if (!allowed || allowed.length === 0) return [];
  return allowed.filter((n) => TOOLS[n]).map((n) => TOOLS[n]);
}
