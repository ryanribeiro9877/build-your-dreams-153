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
  "consultar_cep", "get_revisao_peca_context", "minha_agenda",
];
const READ_TOOLS = new Set(READ_TOOL_NAMES);

export function isWriteTool(name: string): boolean {
  return !READ_TOOLS.has(name);
}

// `delegate` é NATIVA (nem leitura nem escrita comum): o orquestrador a trata
// diretamente no ramo `delegating` (não vai a runReadTool/runWriteTool).
export function isDelegateTool(name: string): boolean {
  return name === "delegate";
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
    description: "Resolve o DESTINATÁRIO (colaborador do escritório) por papel/cargo ('o sócio', 'a recepção', 'o tech', 'o previdenciário'), nome, e-mail, 'admin' ou app_role. Use SEMPRE antes de distribuir_caso/criar_card_tarefa para obter o user_id. Passe o termo do pedido cru (ex.: 'sócio'). Regras de resolução: NENHUM resultado → diga que não encontrou usuário para o termo e NÃO invente destinatário; UM resultado → siga com esse user_id; MAIS DE UM → LISTE os candidatos (nome + cargo) e PERGUNTE qual, nunca escolha sozinho.",
    parameters: { type: "object", properties: { busca: str("papel/cargo, nome, e-mail, 'admin' ou app_role do destinatário (ex.: 'o sócio', 'Ana', 'laura@...')") }, required: ["busca"] },
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
    description: "Localiza o processo/caso por número do processo/protocolo (tolerante a pontuação e prefixo), nome do cliente ou termo do caso (ex.: réu). Use SEMPRE antes de distribuir_caso — o retorno traz process_id e tipo_acao_id.",
    parameters: { type: "object", properties: { busca: str("número do processo/protocolo, nome do cliente ou termo do caso (ex.: réu 'Agibank')") }, required: ["busca"] },
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
    description: "Distribui um caso ao Kanban do seu tipo de ação: cria e placa o card na coluna inicial do board correspondente. Resolva o processo com consultar_processo ANTES e passe process_id. Informe tipo_acao_id quando o processo ainda não tem tipo definido. Quando o pedido indicar um destinatário ('ao sócio', 'para a Ana'), resolva-o com consultar_usuario ANTES e passe o user_id em responsible_lawyer_user_id — nunca invente destinatário; se houver mais de um candidato, pergunte qual antes de distribuir. Sem responsible_lawyer_user_id, o caso vai ao responsável da área. Bloqueado se o caso tiver pendência aberta.",
    parameters: { type: "object", properties: {
      process_id: str("id do processo/caso (de consultar_processo)"),
      tipo_acao_id: str("id do tipo de ação (opcional se o processo já tem tipo_acao_id definido)"),
      task_type_id: str("id do tipo de tarefa do card (opcional; default = configurado no tipo de ação)"),
      title: str("título do card (opcional; default = 'Caso: <número/cliente>')"),
      responsible_lawyer_user_id: str("id do destinatário resolvido via consultar_usuario (opcional; default = responsável da área)"),
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
  agendar_atendimento: { type: "function", function: {
    name: "agendar_atendimento",
    description: "Agenda um ATENDIMENTO/consulta de um CLIENTE com um ADVOGADO (cria a reunião na Agenda). NÃO use para reunião INTERNA entre colaboradores (isso é criar_pendencia tipo 'reuniao') nem para distribuir caso. Regras que o sistema IMPÕE (repasse os erros como estão): só recepção/sócio/admin podem agendar; ADVOGADO RESPONSÁVEL é obrigatório; expediente seg–sex 08:00–11:00 e 13:00–16:00, slots de 15min; não agenda no passado (fuso America/Bahia). Resolva o advogado com consultar_usuario ANTES (passe lawyer_user_id e lawyer_name) e, se houver, o cliente com consultar_cliente (passe client_id); se o cliente não estiver cadastrado, informe client_name e phone.",
    parameters: { type: "object", properties: {
      scheduled_date: str("data do atendimento no formato AAAA-MM-DD"),
      start_time: str("horário de início HH:MM (08:00–11:00 ou 13:00–16:00, dia útil)"),
      end_time: str("horário de término HH:MM (opcional; default = início + 15min)"),
      lawyer_user_id: str("id do advogado responsável, resolvido via consultar_usuario (obrigatório)"),
      lawyer_name: str("nome do advogado (apenas para exibição na confirmação, ex.: 'Dra. Laura')"),
      client_id: str("id do cliente, resolvido via consultar_cliente (opcional)"),
      client_name: str("nome do cliente (quando não cadastrado)"),
      phone: str("telefone do cliente (opcional)"),
      type: str("tipo do atendimento (ex.: 'Consulta inicial') — opcional"),
      summary: str("resumo/assunto do atendimento (opcional)"),
      create_task: { type: "boolean", description: "se true, também gera a tarefa vinculada à reunião" },
    }, required: ["scheduled_date", "start_time", "lawyer_user_id"] },
  }},
  salvar_peca: { type: "function", function: {
    name: "salvar_peca",
    description: "Salva a peça que VOCÊ redigiu (texto integral em `conteudo`) e a envia para revisão humana. Resolva o cliente (e o processo, se houver) ANTES. NÃO é para respostas curtas — é a peça final. Após salvar, a peça fica pendente e uma tarefa de revisão é criada para o revisor.",
    parameters: { type: "object", properties: {
      client_id: str("id do cliente (resolvido via consultar_cliente)"),
      process_id: str("id do processo (opcional)"),
      document_name: str("nome da peça (ex.: 'Contestação — Fulano x Banco')"),
      document_type: str("tipo do documento (default 'peca')"),
      conteudo: str("TEXTO INTEGRAL da peça em markdown"),
    }, required: ["client_id", "document_name", "conteudo"] },
  }},
  anexar_documento_cliente: { type: "function", function: {
    name: "anexar_documento_cliente",
    description: "Anexa UM documento JÁ ENVIADO nesta conversa ao dossiê (aba Documentos) de um cliente CADASTRADO e dá baixa no checklist documental. Use quando o usuário pede/confirma mover um anexo do chat para o cadastro do cliente. Resolva o cliente ANTES com consultar_cliente e passe client_id. O documento precisa ter sido anexado NESTA conversa — NUNCA invente. Para vários documentos, chame a tool UMA VEZ POR DOCUMENTO.",
    parameters: { type: "object", properties: {
      client_id: str("id do cliente (resolvido via consultar_cliente)"),
      document_type: str("tipo do documento — quando aplicável, use um destes para fechar o item do checklist: procuracao, contrato_honorarios, declaracao_hipossuficiencia, termo_cooperado, rg, cpf, comprovante, certidao, contrato. Se não souber, use 'outro'."),
      file_name: str("nome do arquivo anexado a vincular, exatamente como aparece na lista de anexos desta conversa (ex.: 'procuracao.pdf'). Se houver só um anexo, pode omitir."),
    }, required: ["client_id", "document_type"] },
  }},
  atualizar_tarefa: { type: "function", function: {
    name: "atualizar_tarefa",
    description: "Move ou edita um card/tarefa do Kanban que JÁ existe (status, prazo, prioridade ou título). Resolva o card ANTES com consultar_tarefas e passe task_id. NÃO cria tarefa nova (criar é criar_pendencia).",
    parameters: { type: "object", properties: {
      task_id: str("id do card (obtido via consultar_tarefas)"),
      task_titulo: str("título do card — apenas para exibição na confirmação"),
      status: str("novo status: a fazer, em andamento, bloqueada, aguardando validação, concluída ou cancelada"),
      prazo: str("novo prazo em ISO 8601 (fuso America/Bahia); não pode ser passado"),
      prioridade: str("nova prioridade: crítica, alta, média ou baixa"),
      novo_titulo: str("novo título do card (renomear)"),
    }, required: ["task_id"] },
  }},
  comentar_card: { type: "function", function: {
    name: "comentar_card",
    description: "Adiciona um comentário a um card/tarefa do Kanban. Resolva o card ANTES com consultar_tarefas e passe task_id.",
    parameters: { type: "object", properties: {
      task_id: str("id do card (obtido via consultar_tarefas)"),
      task_titulo: str("título do card — apenas para exibição na confirmação"),
      comentario: str("texto do comentário"),
    }, required: ["task_id", "comentario"] },
  }},
  atualizar_cliente: { type: "function", function: {
    name: "atualizar_cliente",
    description: "Corrige/atualiza dados de cadastro de um cliente que JÁ existe (telefone, email, endereço, data de nascimento, origem, tipo, status). NÃO cria cliente novo (isso é cadastrar_cliente) e NUNCA altera CPF/CNPJ/nome. Resolva o cliente ANTES com consultar_cliente e passe client_id.",
    parameters: { type: "object", properties: {
      client_id: str("id do cliente (via consultar_cliente)"),
      client_nome: str("nome do cliente — apenas para exibição na confirmação"),
      phone: str("telefone"), email: str("email"),
      address: str("logradouro"), address_number: str("número"), neighborhood: str("bairro"),
      city: str("cidade"), state: str("UF"), zip_code: str("CEP"),
      birth_date: str("data de nascimento AAAA-MM-DD"),
      client_origin: str("origem do cliente"), tipo_pessoa: str("pf ou pj"), status: str("status do cliente"),
    }, required: ["client_id"] },
  }},
  minha_agenda: { type: "function", function: {
    name: "minha_agenda",
    description: "Consulta a agenda do PRÓPRIO usuário (atendimentos, audiências e prazos) num intervalo de datas. Sem intervalo = hoje. Resposta direta, sem confirmação.",
    parameters: { type: "object", properties: {
      de: str("data inicial AAAA-MM-DD (opcional; default = hoje)"),
      ate: str("data final AAAA-MM-DD (opcional; default = mesmo dia de 'de')"),
    }, required: [] },
  }},
  delegate: { type: "function", function: {
    name: "delegate",
    description: "Delega esta demanda a um SUB-AGENTE seu (diretor ou executor) e recebe de volta o resultado dele. Use quando a ação exige um nível abaixo: o Assistente delega ao Diretor; o Diretor delega ao Executor que produz. Informe `target` (papel/área/nome do sub-agente, ex.: 'diretor jurídico', 'executor previdenciário') e um `objetivo` claro. Passe `resumo`/`client_id`/`process_id` já apurados para o sub-agente não recomeçar do zero.",
    parameters: { type: "object", properties: {
      target: str("papel/área/nome do sub-agente destino (ex.: 'diretor de área', 'executor previdenciário', 'Especialista Cadastro')"),
      objetivo: str("o que o sub-agente deve fazer (imperativo, 1 frase)"),
      resumo: str("contexto relevante já apurado (opcional)"),
      client_id: str("uuid do cliente já resolvido (opcional)"),
      process_id: str("uuid do processo já resolvido (opcional)"),
    }, required: ["target", "objetivo"] },
  }},
  get_revisao_peca_context: { type: "function", function: {
    name: "get_revisao_peca_context",
    description: "Lê o contexto de uma tarefa de revisão de peça (revisar_peca): a peça redigida e os metadados, para você avaliar antes de decidir. Passe o task_id da revisão.",
    parameters: { type: "object", properties: { task_id: str("id da tarefa revisar_peca") }, required: ["task_id"] },
  }},
  decidir_revisao_peca: { type: "function", function: {
    name: "decidir_revisao_peca",
    description: "Decide uma revisão de peça: 'aprovar' ou 'devolver'. APROVAR exige aceite=true (o revisor assume a RESPONSABILIDADE pela peça) — só aprove após o revisor humano confirmar o aceite; nunca aprove por conta própria. DEVOLVER reabre a confecção para o redator refazer; use observacoes para dizer o que corrigir.",
    parameters: { type: "object", properties: {
      task_id: str("id da tarefa revisar_peca"),
      decisao: { type: "string", enum: ["aprovar", "devolver"], description: "decisão da revisão" },
      observacoes: str("o que corrigir (obrigatório ao devolver; opcional ao aprovar)"),
      aceite: { type: "boolean", description: "true confirma o aceite de responsabilidade (obrigatório para aprovar)" },
    }, required: ["task_id", "decisao"] },
  }},
};

export function toolsFor(allowed: string[] | null | undefined): ToolDef[] {
  if (!allowed || allowed.length === 0) return [];
  return allowed.filter((n) => TOOLS[n]).map((n) => TOOLS[n]);
}
