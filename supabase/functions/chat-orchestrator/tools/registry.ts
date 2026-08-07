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
  "consultar_cep", "get_revisao_peca_context", "minha_agenda", "consultar_audiencias", "resumo_do_dia",
  "consultar_documentos_obrigatorios",
  "listar_permissoes_menu", "kpi_ligacoes",
  // Motores 2 e 3 (Cards 6/8/7). Cada RPC re-checa o papel internamente: as de
  // execução exigem advogado/sócio/admin (recepção leva 42501), então a tool ser
  // "de leitura" não afrouxa nada.
  "consultar_reclamacoes", "consultar_execucoes", "fila_credenciais_gov",
  // P2 (Cards 11/13/14/15). `preparar_audiencia` é LEITURA apesar do verbo:
  // ela só MONTA o parecer do que falta (nenhum INSERT/UPDATE no corpo da RPC).
  "consultar_diligencias", "consultar_apolices", "consultar_procuracoes", "preparar_audiencia",
];
const READ_TOOLS = new Set(READ_TOOL_NAMES);

// Tools de ROTEAMENTO: mecanismo interno de encaminhar o turno a outro agente —
// não são ações executáveis e NUNCA podem entrar num plano de escrita.
// (Reteste 3, item 1): isWriteTool era por EXCLUSÃO (tudo que não é leitura é
// escrita), então `delegate` virava writeCall → o ActionCard exibia "Executar
// delegate" e o confirm morria em "ferramenta de escrita desconhecida: delegate".
export const ROUTING_TOOL_NAMES: string[] = ["delegate"];
const ROUTING_TOOLS = new Set(ROUTING_TOOL_NAMES);

export function isWriteTool(name: string): boolean {
  return !READ_TOOLS.has(name) && !ROUTING_TOOLS.has(name);
}

// `delegate` é NATIVA (nem leitura nem escrita comum): o orquestrador a trata
// diretamente no ramo `delegating` (não vai a runReadTool/runWriteTool).
export function isDelegateTool(name: string): boolean {
  return ROUTING_TOOLS.has(name);
}

export function isReadTool(name: string): boolean {
  return READ_TOOLS.has(name);
}

/**
 * Quais ferramentas ficam na mesa NESTE turno, dado o objeto já classificado.
 *
 * CARD FANTASMA (item 2 de 06/08, 4 ocorrências). Sequência que reproduzia:
 * registrar uma ligação, confirmar, e então PERGUNTAR "quantas ligações fizemos
 * hoje?" — vinha um cartão novo propondo registrar a MESMA ligação, com o texto
 * levemente diferente ("Ligação realizada em 06/08/2026; não atendeu"), porque o
 * modelo remontava os argumentos a partir do histórico.
 *
 * O diagnóstico corrente era "o classificador re-classifica a consulta como ação".
 * Os dados do banco dizem o contrário: às 19:28:49 o objeto saiu CERTO
 * (`KPI_LIGACOES` → tool `kpi_ligacoes`, estágio "somando as ligações") e cinco
 * segundos depois o especialista propôs `registrar_ligacao`. Quem contaminou não
 * foi o roteador — foi o EXECUTOR, que recebeu a tool de escrita na mesa e o
 * histórico da ligação anterior no contexto.
 *
 * Regra: quando o turno já foi classificado como CONSULTA, escrita não fica na
 * mesa. Uma pergunta não pode produzir um cartão de gravação. O filtro só REMOVE
 * ferramenta — nunca acrescenta — então nenhum caminho ganha permissão nova.
 */
export function toolsPermitidasNoTurno(gated: string[], objetoTool?: string | null): string[] {
  if (!objetoTool) return gated;
  // Objeto decidido: roteamento sai da mesa (senão o agente tenta "encaminhar" a
  // ação em vez de executá-la, e o cartão vira "Executar delegate").
  const semRoteamento = gated.filter((n) => !isDelegateTool(n));
  if (!isReadTool(objetoTool)) return semRoteamento;
  return semRoteamento.filter((n) => !isWriteTool(n));
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
    description: "Move ou edita uma tarefa/pendência que JÁ existe, na tela Tarefas (prazo, prioridade, título ou status intermediário). Resolva a tarefa ANTES com consultar_tarefas e passe task_id. NÃO cria tarefa nova (criar é criar_pendencia) e NÃO serve para CONCLUIR: para dar baixa use concluir_pendencia, porque esta tool grava só o status e deixaria a pendência viva na tela.",
    parameters: { type: "object", properties: {
      task_id: str("id do card (obtido via consultar_tarefas)"),
      task_titulo: str("título do card — apenas para exibição na confirmação"),
      status: str("novo status: a fazer, em andamento, bloqueada, aguardando validação, concluída ou cancelada"),
      prazo: str("novo prazo em ISO 8601 (fuso America/Bahia); não pode ser passado"),
      prioridade: str("nova prioridade: crítica, alta, média ou baixa"),
      novo_titulo: str("novo título do card (renomear)"),
    }, required: ["task_id"] },
  }},
  concluir_pendencia: { type: "function", function: {
    name: "concluir_pendencia",
    description: "Dá BAIXA em uma pendência ou tarefa que já existe — o equivalente ao botão \"✔ Concluir\" da tela, com observação. Use quando disserem que resolveram/fizeram/terminaram a pendência (\"já resolvi a pendência da procuração do Adalberto\", \"conclui essa tarefa\", \"a pendência do contrato está feita\"). Vale para QUALQUER tipo, inclusive pendência genérica. Resolva a pendência ANTES com consultar_tarefas e passe o task_id; NUNCA peça UUID ao usuário. ATENÇÃO ao relatar: se a pendência veio de OUTRO setor, ela é resolvida e DEVOLVIDA à origem (não encerra na sua fila), e se o tipo exigir validação ela vai para AGUARDANDO VALIDAÇÃO em vez de concluir — a tool devolve em `notas` o que de fato ficou gravado; repasse essas notas em vez de afirmar que encerrou. NÃO use para mudar prazo/prioridade/título (isso é atualizar_tarefa).",
    parameters: { type: "object", properties: {
      task_id: str("id da pendência/tarefa (obtido via consultar_tarefas; nunca peça ao usuário)."),
      task_titulo: str("título da pendência — apenas para exibição no cartão de confirmação."),
      observacao: str("como foi resolvida, em uma frase (vai para as notas e para a auditoria da pendência)."),
    }, required: ["task_id"] },
  }},
  comentar_card: { type: "function", function: {
    name: "comentar_card",
    description: "Adiciona um comentário a uma tarefa/pendência da tela Tarefas. Resolva a tarefa ANTES com consultar_tarefas e passe task_id.",
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
    description: "Consulta a agenda do PRÓPRIO usuário (atendimentos, audiências e prazos) num intervalo de datas. Sem intervalo = hoje. Resposta direta, sem confirmação. IMPORTANTE: para LOCALIZAR um atendimento que será reagendado ou cancelado quando o usuário NÃO disse a data, consulte um intervalo FUTURO amplo (de=hoje, ate=hoje+60 dias) e pegue o PRÓXIMO atendimento do cliente — o default de hoje esconde atendimentos de amanhã em diante. Só pergunte qual é se houver mais de um candidato no período.",
    parameters: { type: "object", properties: {
      de: str("data inicial AAAA-MM-DD (opcional; default = hoje)"),
      ate: str("data final AAAA-MM-DD (opcional; default = mesmo dia de 'de')"),
    }, required: [] },
  }},
  reagendar_atendimento: { type: "function", function: {
    name: "reagendar_atendimento",
    description: "Reagenda um atendimento/reunião de cliente que JÁ existe para nova data/hora. Resolva o atendimento ANTES com minha_agenda e passe meeting_id. Valida expediente (seg–sex 08–11/13–16, fuso Bahia).",
    parameters: { type: "object", properties: {
      meeting_id: str("id do atendimento (via minha_agenda)"),
      atendimento_desc: str("descrição do atendimento (cliente/data atual) — só para exibição"),
      nova_data: str("nova data AAAA-MM-DD"),
      nova_hora: str("novo horário HH:MM"),
    }, required: ["meeting_id", "nova_data", "nova_hora"] },
  }},
  cancelar_atendimento: { type: "function", function: {
    name: "cancelar_atendimento",
    description: "Cancela um atendimento/reunião de cliente que JÁ existe. Resolva o atendimento ANTES com minha_agenda e passe meeting_id.",
    parameters: { type: "object", properties: {
      meeting_id: str("id do atendimento (via minha_agenda)"),
      atendimento_desc: str("descrição do atendimento — só para exibição"),
      motivo: str("motivo do cancelamento (opcional)"),
    }, required: ["meeting_id"] },
  }},
  criar_audiencia: { type: "function", function: {
    name: "criar_audiencia",
    description: "Marca uma audiência para um processo. Resolva o processo ANTES com consultar_processo e passe process_id. Data futura. Gate: advogado do processo, sócio ou admin.",
    parameters: { type: "object", properties: {
      process_id: str("id do processo (via consultar_processo)"),
      processo_desc: str("número/descrição do processo — só para exibição"),
      data: str("data AAAA-MM-DD"),
      hora: str("horário HH:MM"),
      tipo: str("tipo da audiência (ex.: Instrução, Conciliação, Una)"),
      local: str("local/link (opcional)"),
      notes: str("observações (opcional)"),
    }, required: ["process_id", "data", "hora", "tipo"] },
  }},
  /* A tool existia no tool_catalog (ativa, 13 agentes) mas NÃO aqui — e `toolsFor`
     filtra por TOOLS[n], então ela era descartada em silêncio e o LLM nunca a via.
     Era essa a causa de "o que preciso pedir pro cliente na tese de RMC?" cair no
     questionário de peça: não era classificação nem permissão, era ferramenta
     invisível. Contrato lido do banco: (p_tese, p_client_id, p_cliente_nome). */
  consultar_documentos_obrigatorios: { type: "function", function: {
    name: "consultar_documentos_obrigatorios",
    description: "Responde \"o que preciso pedir para o cliente nessa tese?\" / \"o que falta de documento?\" / \"quais documentos a tese X exige?\". Informe a tese (aceita apelidos como RMC, SUSEP, fraude bancária) e, se souber, o cliente — aí a resposta separa o que já está no dossiê do que falta. Sem tese, devolve quais teses já têm matriz cadastrada. NÃO é pedido de peça: nunca peça fatos, valores ou réu para responder isto. OBRIGATÓRIO: se `matriz_configurada` vier false, avise que a checagem usou só o documento âncora e NÃO garante o kit completo da tese.",
    parameters: { type: "object", properties: {
      tese: str("Nome ou apelido da tese (ex.: RMC, SUSEP, fraude bancária). Opcional: sem ela vem o panorama das teses com matriz."),
      cliente_nome: str("Nome do cliente, para dizer o que já tem e o que falta no dossiê dele."),
      client_id: str("ID do cliente, se já resolvido."),
    }, required: [] },
  }},
  consultar_audiencias: { type: "function", function: {
    name: "consultar_audiencias",
    description: "Consulta audiências num intervalo de datas. Escopo por papel (advogado vê as suas; sócio/admin/recepção todas). Cada item traz `id`, `cliente`, `quando`, `tipo` e `processo`. PARA ACHAR A AUDIÊNCIA DE UM CLIENTE: passe `cliente_nome` junto com uma janela ampla (ex.: hoje até +12 meses) — o filtro de nome é feito NO BANCO e devolve só as audiências desse cliente, em vez da lista inteira do intervalo. NÃO passe pelo processo: as audiências importadas da planilha têm processo VAZIO (nenhuma das 179 tem vínculo), então filtrar por processo não acha NADA e faria você concluir que a audiência não existe. `process_id` é filtro opcional, nunca o caminho. RETORNO VAZIO (`[]`) SIGNIFICA QUE A CONSULTA RODOU E NÃO ACHOU — nunca que a ferramenta falta; diga o intervalo e o nome que você consultou. Use o `id` do item para chamar preparar_audiencia.",
    parameters: { type: "object", properties: {
      de: str("data inicial AAAA-MM-DD"),
      ate: str("data final AAAA-MM-DD — para procurar a audiência de um cliente, use uma janela ampla (ex.: +12 meses)"),
      cliente_nome: str("nome do cliente para filtrar (opcional, mas É O CAMINHO para 'a audiência do cliente X'). Casa por trecho, ignorando acento e maiúsculas — 'fulana' acha 'Fulâna de Teste'. Prefira o primeiro nome se não tiver certeza do sobrenome. É o filtro CONFIÁVEL: todas as audiências têm nome preenchido."),
      client_id: str("UUID do cliente (opcional). Use APENAS para desempatar homônimos, junto ou em vez do nome — NÃO é o filtro preferencial: 38 das 179 audiências não têm cliente vinculado por id (só por nome), então filtrar por client_id pode devolver vazio para um cliente que TEM audiência."),
      process_id: str("filtrar por um processo (opcional). ATENÇÃO: audiência importada tem processo vazio; usar este filtro para procurar por cliente devolve lista vazia por construção."),
    }, required: ["de", "ate"] },
  }},
  criar_processo: { type: "function", function: {
    name: "criar_processo",
    description: "Cria um processo NOVO para um cliente. Resolva o cliente ANTES com consultar_cliente e passe client_id. O tipo de ação define a área. Número é opcional. Se o número já existir, NÃO cria (proponha abrir o existente). Gate: advogado, sócio ou admin.",
    parameters: { type: "object", properties: {
      client_id: str("id do cliente (via consultar_cliente)"),
      client_nome: str("nome do cliente — só para exibição"),
      tipo_acao: str("tipo de ação/assunto (ex.: desconto indevido, RMC/RCC) — resolve a área"),
      numero: str("número do processo (opcional)"),
      reu: str("réu/parte contrária (opcional)"),
      notes: str("observações (opcional)"),
    }, required: ["client_id"] },
  }},
  atualizar_processo: { type: "function", function: {
    name: "atualizar_processo",
    description: "Registra um andamento ou atualiza um processo que JÁ existe (andamento, status, próxima audiência). Resolva o processo ANTES com consultar_processo e passe process_id. Andamento é gravado com autor e data. Gate: advogado responsável, sócio ou admin.",
    parameters: { type: "object", properties: {
      process_id: str("id do processo (via consultar_processo)"),
      processo_desc: str("número/descrição do processo — só para exibição"),
      andamento: str("texto do andamento (registrado com autor e data)"),
      status: str("novo status do processo (opcional)"),
      next_hearing_date: str("data/hora da próxima audiência em ISO 8601 (opcional)"),
    }, required: ["process_id"] },
  }},
  definir_permissao_menu: { type: "function", function: {
    name: "definir_permissao_menu",
    description: "Gerencia o acesso de um COLABORADOR a um MENU/tela do sistema (ação de ADMIN; só admin executa). acao=conceder libera; acao=revogar bloqueia explicitamente; acao=padrao volta ao padrão do papel (remove o override). Resolva o colaborador antes com consultar_usuario; NUNCA peça UUID.",
    parameters: { type: "object", properties: {
      user_id: str("ID do colaborador (via consultar_usuario; nunca peça ao usuário)."),
      user_nome: str("Nome do colaborador, só para exibição no cartão."),
      menu_key: { type: "string", enum: ["dashboard","clientes","recepcao_juridico","prazos_audiencias","agenda","tarefas","kanban","kpis","dashboard_ia","administracao","configuracoes"],
        description: "Chave do menu. Mapeie o nome dito: Dashboard=dashboard, Clientes=clientes, Recepção & Jurídico=recepcao_juridico, Prazos & Audiências=prazos_audiencias, Agenda=agenda, Tarefas=tarefas, Kanban=kanban, KPIs Eficiência=kpis, Dashboard IA=dashboard_ia, Administração=administracao, Configurações=configuracoes." },
      menu_label: str("Nome legível do menu, só para exibição no cartão."),
      acao: { type: "string", enum: ["conceder","revogar","padrao"], description: "conceder = liberar; revogar = bloquear explicitamente; padrao = voltar ao padrão do papel." },
    }, required: ["user_id","menu_key","acao"] },
  }},
  listar_permissoes_menu: { type: "function", function: {
    name: "listar_permissoes_menu",
    description: "Lista as permissões de menu personalizadas (overrides) de todos os colaboradores — quem teve algum menu concedido ou revogado explicitamente, e por quem. Ação de ADMIN (só admin). Sem parâmetros.",
    parameters: { type: "object", properties: {}, required: [] },
  }},
  // ─── Card 3: relação bancária do cliente ───────────────────────────────────
  registrar_relacao_bancaria: { type: "function", function: {
    name: "registrar_relacao_bancaria",
    description: "Registra o vínculo bancário de um cliente: onde ele RECEBE o benefício (banco pagador) e/ou que produto ele tem com um banco (consignado, cartão consignado, empréstimo pessoal, seguro, conta). Também marca se o escritório já tem o EXTRATO ou o CONTRATO em posse. Use em frases como \"a dona Antonieta recebe no Agibank e tem consignado com o Agibank\", \"já temos o extrato do Bradesco de 2025\", \"ele trouxe o contrato\". Repetir não duplica (upsert por cliente+banco+tipo) e nunca desmarca um extrato já registrado.",
    parameters: { type: "object", properties: {
      cliente_nome: str("Nome do cliente como o usuário falou. Basta o nome; se houver mais de um, os candidatos voltam para você perguntar."),
      client_id: str("ID do cliente, se já resolvido com consultar_cliente. Opcional — nunca peça UUID ao usuário."),
      banco_beneficio: str("Banco onde o cliente RECEBE o benefício (\"recebe no BRADESCO\"). Só isto já é útil, sem produto."),
      banco: str("Banco do PRODUTO (ex.: AGIBANK), quando o cliente tem consignado/seguro/etc. com ele."),
      tipo_relacao: { type: "string", enum: ["consignado", "emprestimo_pessoal", "cartao_consignado", "seguro", "conta", "outro"], description: "Produto que o cliente tem nesse banco. Obrigatório junto com `banco`." },
      reconhece: { type: "boolean", description: "O cliente RECONHECE esse contrato/produto? false quando ele nega (é o caso típico de refin não autorizado)." },
      extrato_em_posse: { type: "boolean", description: "true se o escritório já tem o extrato desse banco." },
      extrato_ano: { type: "number", description: "Ano do extrato em posse (ex.: 2025)." },
      contrato_em_posse: { type: "boolean", description: "true se o escritório já tem o contrato." },
      notes: str("Observação curta, se o usuário der contexto."),
    }, required: [] },
  }},
  // ─── Card 4: campanha de ligação, registro e KPI ───────────────────────────
  criar_campanha: { type: "function", function: {
    name: "criar_campanha",
    description: "Cria uma CAMPANHA de ligação com uma fila de clientes montada por filtro. Use em \"cria uma campanha para ligar para todos os clientes que recebem no Bradesco, para pedir o extrato\", \"quero ligar para quem tem consignado com o Agibank\". O sistema monta a fila e diz quantos clientes entraram.",
    parameters: { type: "object", properties: {
      nome: str("Nome curto da campanha (ex.: \"Extratos Bradesco\"). Se o usuário não der, crie um descritivo."),
      objetivo: { type: "string", enum: ["pedir_documento", "pedir_senha_gov", "agendar_atendimento", "renovar_procuracao", "converter_conta_bronze", "informar_andamento", "outro"], description: "Para que é a ligação." },
      recebe_em: str("Filtro: banco onde o cliente RECEBE o benefício (ex.: BRADESCO)."),
      tem_consignado_com: str("Filtro: banco com quem o cliente tem consignado (ex.: AGIBANK)."),
      tem_extrato_de: str("Filtro: banco cujo extrato o escritório já tem."),
      cidade: str("Filtro: cidade."),
      uf: str("Filtro: UF (2 letras)."),
      status: str("Filtro: status do cliente (ex.: ativo)."),
      // `gov` em search_clients é BOOLEANO (tem conta gov.br cadastrada), NÃO o nível.
      // O schema anunciava enum ouro/prata/bronze: o LLM mandava "bronze", que virava
      // ('bronze')::boolean → 22P02 e matava a criação (medido em 29/07). Filtrar por
      // NÍVEL não existe na RPC — converter_conta_bronze é objetivo, não filtro.
      gov: { type: "boolean", description: "Filtro: só clientes COM conta GOV.BR cadastrada (ou sem, se false). Não filtra nível (bronze/prata/ouro) — isso a base não oferece." },
      origem: str("Filtro: origem do cadastro (ex.: planilha)."),
      tem_pendencia: { type: "boolean", description: "Filtro: só clientes com pendência aberta." },
      docs_completos: { type: "boolean", description: "Filtro: só clientes com documentação completa (ou incompleta, se false)." },
    }, required: ["nome", "objetivo"] },
  }},
  registrar_ligacao: { type: "function", function: {
    name: "registrar_ligacao",
    description: "Registra o RESULTADO de uma ligação para um cliente. Use em \"liguei para a dona Maria, não atendeu\", \"falei com o Sr. João, pediu retorno amanhã às 10\", \"número errado\". Se o resultado for pedido de retorno, informe `retornar_em` que o sistema cria sozinho a pendência \"Retornar ligação\" em Tarefas (pendência mora em Tarefas, nunca no Kanban).",
    parameters: { type: "object", properties: {
      resultado: str("Como terminou a ligação, em português: atendeu / não atendeu / número errado / pediu retorno / recusou / caixa postal."),
      cliente_nome: str("Nome do cliente como o usuário falou (\"a dona Maria\" → Maria). Se houver mais de um, os candidatos voltam para você perguntar."),
      client_id: str("ID do cliente, se já resolvido. Opcional."),
      observacao: str("O que o cliente disse, em uma frase."),
      retornar_em: str("Quando retornar, em ISO (AAAA-MM-DDTHH:mm:ssZ). Obrigatório quando o resultado é pedido de retorno."),
      campanha_id: str("ID da campanha, se a ligação faz parte de uma."),
    }, required: ["resultado"] },
  }},
  kpi_ligacoes: { type: "function", function: {
    name: "kpi_ligacoes",
    description: "Números das ligações por operador e o progresso das campanhas ativas num período. Use em \"quantas ligações fizemos hoje?\", \"como está a campanha do Bradesco?\", \"produtividade da recepção esta semana\". Sem intervalo = hoje. Resposta direta, sem confirmação.",
    parameters: { type: "object", properties: {
      de: str("data inicial AAAA-MM-DD (opcional; default = hoje)"),
      ate: str("data final AAAA-MM-DD (opcional; default = mesmo dia de 'de')"),
    }, required: [] },
  }},
  // ─── Card 5: áudio de autorização do cliente ───────────────────────────────
  anexar_audio_autorizacao: { type: "function", function: {
    name: "anexar_audio_autorizacao",
    description: "Guarda no dossiê do cliente um ÁUDIO em que ele AUTORIZA o escritório a agir (autorização/anuência gravada), junto com a transcrição. Use quando o usuário anexar um áudio e disser que é a autorização do cliente: \"esse áudio é a autorização da dona Maria\", \"anexa a gravação da autorização do Ivan\". O áudio precisa ter sido anexado nesta conversa.",
    parameters: { type: "object", properties: {
      cliente_nome: str("Nome do cliente de quem é a autorização."),
      client_id: str("ID do cliente, se já resolvido. Opcional."),
      process_id: str("ID do processo, se a autorização é de um processo específico. Opcional."),
      file_name: str("Nome do arquivo de áudio anexado nesta conversa, se houver mais de um."),
    }, required: [] },
  }},
  registrar_credencial_gov: { type: "function", function: {
    name: "registrar_credencial_gov",
    description: "Guarda no COFRE CIFRADO a credencial do GOV.BR/INSS de um cliente (senha, login, nível da conta, 2 fatores). Use quando o usuário informar a senha do gov/INSS de um cliente — ex.: \"a senha do gov dele é X\", \"guarda a senha do INSS da Maria: X\", \"conta bronze, senha X\". Resolva o cliente antes com consultar_cliente; NUNCA peça UUID. IMPORTANTE: a senha vai cifrada para o cofre — NUNCA repita a senha na sua resposta ao usuário, nem confirme o valor dela.",
    parameters: { type: "object", properties: {
      senha: str("Senha do GOV.BR/INSS exatamente como o usuário informou. Vai cifrada para o cofre."),
      cliente_nome: str("Nome do cliente como o usuário falou (ex.: \"Ivan Moreira Correia\"). Basta o nome: o sistema resolve o cliente e, se houver mais de um, devolve os candidatos para você perguntar qual é."),
      client_id: str("ID do cliente, se você já o resolveu com consultar_cliente. Opcional — NUNCA peça UUID ao usuário."),
      usuario: str("Login do GOV.BR, se informado (se ausente, o sistema usa o CPF do cliente)."),
      nivel: { type: "string", enum: ["ouro", "prata", "bronze"], description: "Nível da conta GOV.BR, se informado." },
      tem_2fa: { type: "boolean", description: "true se a conta exige verificação em 2 fatores." },
      status_acesso: { type: "string", enum: ["pendente", "valido", "senha_incorreta", "bloqueado"], description: "Situação do acesso; use senha_incorreta quando o usuário disser que a senha não funciona." },
    }, required: ["senha"] },
  }},
  registrar_protocolo: { type: "function", function: {
    name: "registrar_protocolo",
    description: "Conclui a tarefa de protocolo (protocolar_peca) de um processo/cliente — registra que a peça foi protocolada. Exige o gate 8.5: o cliente precisa ter os documentos Reclame Aqui E Sentença Procedente anexados; senão a tool informa o que falta e NÃO conclui. Resolva a tarefa antes com consultar_tarefas (título começa por 'Protocolar peça —'); NUNCA peça UUID. Use quando disserem que protocolaram/deram entrada na peça, ou para concluir a tarefa de protocolo.",
    parameters: { type: "object", properties: {
      task_id: str("ID da tarefa de protocolo (protocolar_peca), obtido via consultar_tarefas."),
      task_titulo: str("Título da tarefa, apenas para exibição no cartão de confirmação."),
      observacao: str("Observação opcional (ex.: número de protocolo, data) — vai para as notas da tarefa."),
    }, required: ["task_id"] },
  }},
  gerar_kit_documental: { type: "function", function: {
    name: "gerar_kit_documental",
    description: "Gera o kit documental do cliente (procuração, contrato de honorários, declaração de hipossuficiência e ficha cadastral de cooperado), preenchido com os dados do cadastro, e salva no dossiê do cliente com status pendente (aguardando assinatura). Idempotente: documentos já gerados não são duplicados. Use quando pedirem para gerar/emitir/preparar os documentos, o kit ou a papelada de um cliente JÁ cadastrado. Resolva o cliente antes com consultar_cliente; NUNCA peça UUID ao usuário.",
    parameters: { type: "object", properties: {
      client_id: str("ID do cliente (obtido via consultar_cliente; nunca peça ao usuário)."),
      client_name: str("Nome do cliente, apenas para exibição no cartão de confirmação."),
    }, required: ["client_id"] },
  }},
  resumo_do_dia: { type: "function", function: {
    name: "resumo_do_dia",
    description: "Resumo do dia do PRÓPRIO usuário: tarefas com prazo hoje, tarefas atrasadas, atendimentos do dia, audiências próximas (7 dias), pendências abertas e notificações não lidas. Resposta única, sem confirmação.",
    parameters: { type: "object", properties: {}, required: [] },
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

  /* ══ MOTOR 2 · Card 6 — reclamações administrativas ═══════════════════════
     Os enums abaixo são os CHECKs reais das colunas (lidos do banco em 29/07):
     valor fora da lista derruba a gravação com 23514, então o enum protege o LLM
     de inventar "PROCON-BA" ou "atendido". */
  registrar_reclamacao: { type: "function", function: {
    name: "registrar_reclamacao",
    description: "Registra uma reclamação administrativa de um cliente (Procon, Bacen, INSS, consumidor.gov, ouvidoria do banco, e-mail ao banco), com protocolo e prazos. O prazo de resposta/fatal vira pendência automática no dashboard de prazos. Use em \"registra reclamação no Bacen pra dona Abigail, tarifa indevida, protocolo BCB-123, prazo fatal 13/08\". A reclamação negada ou sem resposta é pré-requisito de ação em várias teses (interesse de agir).",
    parameters: { type: "object", properties: {
      orgao: { type: "string", enum: ["procon", "bacen", "inss", "consumidor_gov", "ouvidoria_banco", "email_banco", "outro"], description: "Onde a reclamação foi feita." },
      cliente_nome: str("Nome do cliente como o usuário falou. Basta o nome; se houver mais de um, os candidatos voltam para você perguntar."),
      client_id: str("ID do cliente, se já resolvido com consultar_cliente. Opcional — NUNCA peça UUID."),
      tese: str("Assunto/tese da reclamação (ex.: \"tarifa indevida\", \"desconto não autorizado\")."),
      data_reclamacao: str("Data da reclamação, AAAA-MM-DD. Default hoje."),
      protocolo: str("Número de protocolo dado pelo órgão."),
      prazo_resposta: str("Prazo esperado de resposta, AAAA-MM-DD."),
      prazo_fatal: str("Prazo FATAL, AAAA-MM-DD — vira a data fatal da pendência."),
      process_id: str("ID do processo vinculado, se houver."),
      observacao: str("Observação curta."),
    }, required: ["orgao"] },
  }},
  registrar_resposta_reclamacao: { type: "function", function: {
    name: "registrar_resposta_reclamacao",
    description: "Registra a resposta/desfecho de uma reclamação administrativa JÁ registrada. Localize a reclamação antes com consultar_reclamacoes (o retorno traz o id); NUNCA peça UUID ao usuário. Negada ou sem resposta serve de prova do interesse de agir — diga isso ao usuário quando for o caso.",
    parameters: { type: "object", properties: {
      reclamacao_id: str("ID da reclamação, obtido em consultar_reclamacoes."),
      desfecho: { type: "string", enum: ["atendida", "negada", "sem_resposta"], description: "Como terminou." },
      resposta_texto: str("Resumo do que o órgão/banco respondeu."),
      resposta_em: str("Data da resposta, AAAA-MM-DD. Default hoje."),
    }, required: ["reclamacao_id", "desfecho"] },
  }},
  consultar_reclamacoes: { type: "function", function: {
    name: "consultar_reclamacoes",
    description: "Lista reclamações administrativas: de um cliente, todas, ou só as PENDENTES que vencem até uma data (\"quais reclamações vencem essa semana?\" → informe vencendo_ate com a data de sábado). Resposta direta, sem confirmação.",
    parameters: { type: "object", properties: {
      cliente_nome: str("Nome do cliente, se a pergunta é sobre um cliente específico."),
      client_id: str("ID do cliente, se já resolvido."),
      vencendo_ate: str("AAAA-MM-DD — só pendentes com prazo até esta data."),
    }, required: [] },
  }},

  /* ══ MOTOR 3 · Card 8 — pipeline de execução ══════════════════════════════ */
  iniciar_execucao: { type: "function", function: {
    name: "iniciar_execucao",
    description: "Inicia o acompanhamento da EXECUÇÃO de um processo: fase, réu/parte contrária, quem toca e valor. Um processo tem no máximo uma execução. Identifique o processo pelo NÚMERO (processo_numero) — se houver mais de um parecido, a tool devolve que está ambíguo e você pede o número exato.",
    parameters: { type: "object", properties: {
      processo_numero: str("Número do processo como o usuário falou (resolve se for único)."),
      process_id: str("ID do processo, se já resolvido com consultar_processo."),
      reu_nome: str("Nome do réu / parte contrária (ex.: \"Sindicato dos Rurais\", \"Banco BMG\")."),
      reu_tipo: { type: "string", enum: ["sindicato", "banco", "empresa", "pessoa_fisica", "outro"], description: "Natureza do réu." },
      responsavel_nome: str("Quem toca a execução (ex.: Daiane, Rodrigo). Texto livre."),
      valor: { type: "number", description: "Valor da execução, em reais." },
      fase: { type: "string", enum: ["ajuizada", "prazo_pagamento", "pedido_penhora", "sisbajud", "penhora_negativa", "redirecionamento", "pago", "deposito_judicial", "expedicao_alvara", "alvara_pendente_assinatura", "encerrada"], description: "Fase inicial. Default ajuizada." },
      observacao: str("Observação curta."),
    }, required: [] },
  }},
  atualizar_fase_execucao: { type: "function", function: {
    name: "atualizar_fase_execucao",
    description: "Move a execução de um processo para outra FASE e registra o evento na linha do tempo. Use em \"o réu pagou no processo X\", \"pedimos penhora\", \"saiu o alvará\", \"pagou só uma parte\", \"o processo foi arquivado/suspenso\", \"a execução foi extinta\". Ao entrar em expedicao_alvara nasce sozinha a pendência do alvará. ATENÇÃO: pago_parcial, arquivada e suspensa NÃO encerram a execução — a RPC devolve nota explicando, e essa nota tem de ser repassada ao usuário.",
    parameters: { type: "object", properties: {
      // As 15 do CHECK execucoes_fase_check. Faltavam pago_parcial/arquivada/
      // suspensa/extinta: a tela já as oferecia e a RPC já as aceitava, mas pelo
      // chat era IMPOSSÍVEL mover para elas — o enum barrava antes. O teste de
      // enums não cobria esta tool, então nada falhava (corrigido junto).
      fase: { type: "string", enum: ["ajuizada", "prazo_pagamento", "pedido_penhora", "sisbajud", "penhora_negativa", "redirecionamento", "pago", "pago_parcial", "deposito_judicial", "expedicao_alvara", "alvara_pendente_assinatura", "arquivada", "suspensa", "extinta", "encerrada"], description: "Nova fase." },
      processo_numero: str("Número do processo como o usuário falou."),
      process_id: str("ID do processo, se já resolvido."),
      observacao: str("O que aconteceu, em uma frase — vai para a linha do tempo."),
    }, required: ["fase"] },
  }},
  consultar_execucoes: { type: "function", function: {
    name: "consultar_execucoes",
    description: "Lista as execuções em andamento: por fase (\"quais estão em penhora?\"), por responsável (\"execuções da Daiane\") ou por processo. Resposta direta, sem confirmação. Exclusiva de advogado/sócio/admin — a recepção não tem acesso a este dado.",
    parameters: { type: "object", properties: {
      fase: str("Filtro por fase (ex.: sisbajud)."),
      responsavel: str("Filtro por responsável (busca parcial no nome)."),
      processo_numero: str("Filtro por número do processo (busca parcial)."),
    }, required: [] },
  }},

  /* ══ MOTOR 3 · Card 9 — tickler de revisão ════════════════════════════════ */
  remarcar_revisao_execucao: { type: "function", function: {
    name: "remarcar_revisao_execucao",
    description: "Depois de olhar uma execução: fecha a pendência de revisão aberta e agenda a próxima para daqui a N dias. Use em \"olhei a execução do processo X, volta em 10 dias\". Informe intervalo_recorrente se o usuário quiser que se repita sozinho (\"me lembra a cada 15 dias\").",
    parameters: { type: "object", properties: {
      dias: { type: "integer", description: "Daqui a quantos dias revisar de novo (1 a 90)." },
      processo_numero: str("Número do processo como o usuário falou."),
      process_id: str("ID do processo, se já resolvido."),
      intervalo_recorrente: { type: "integer", description: "Se informado, toda revisão futura se re-agenda a cada N dias (1 a 90)." },
    }, required: ["dias"] },
  }},

  /* ══ MOTOR 3 · Card 10 — prazos automáticos pós-evento ════════════════════ */
  registrar_evento_processual: { type: "function", function: {
    name: "registrar_evento_processual",
    description: "Registra um evento do processo e deixa o sistema criar os prazos: sentenca_procedente → prazos de 5 dias úteis (embargos) e 10 (recurso); execucao_ajuizada → prazo de 15 dias úteis (pagamento) e o pipeline de execução já entra em prazo_pagamento. Use em \"saiu sentença procedente no processo X\", \"protocolei a execução do processo Y\". OBRIGATÓRIO: ao responder, repasse o aviso de que os dias úteis foram contados SEM feriados e o calendário forense precisa ser conferido.",
    parameters: { type: "object", properties: {
      evento: { type: "string", enum: ["sentenca_procedente", "execucao_ajuizada"], description: "Qual evento aconteceu." },
      processo_numero: str("Número do processo como o usuário falou."),
      process_id: str("ID do processo, se já resolvido."),
      data_evento: str("Data do evento, AAAA-MM-DD. Default hoje — a contagem dos prazos parte dela."),
      observacao: str("Observação curta."),
    }, required: ["evento"] },
  }},

  /* ══ MOTOR 2 · Card 7 — fila de credenciais gov.br ════════════════════════
     NUNCA pedir nem repetir senha no chat. A fila devolve apenas `tem_senha`
     (booleano) — não existe caminho que traga a senha para o texto. */
  fila_credenciais_gov: { type: "function", function: {
    name: "fila_credenciais_gov",
    description: "Fila de trabalho das contas gov.br: lista clientes por estado da credencial. Use em \"quais clientes são bronze?\", \"quem está com senha inválida?\", \"quem tem 2FA?\", \"de quem não temos senha?\". Devolve nome, nível e situação — NUNCA a senha. Resposta direta, sem confirmação.",
    parameters: { type: "object", properties: {
      estado: { type: "string", enum: ["bronze", "prata", "ouro", "2fa", "invalido", "bloqueado", "sem_senha", "sem_credencial"], description: "Recorte da fila: nível da conta, 2FA, situação do acesso, sem senha guardada ou sem credencial nenhuma." },
    }, required: ["estado"] },
  }},
  atualizar_status_credencial_gov: { type: "function", function: {
    name: "atualizar_status_credencial_gov",
    description: "Atualiza a SITUAÇÃO do acesso gov.br de um cliente. Use em \"a senha da dona Elza está errada\" (status invalido → nasce pendência de recuperação), \"a conta do Ivan foi bloqueada\", \"consegui entrar, tá valendo\". NUNCA peça a senha nem a repita: aqui só se registra a situação.",
    parameters: { type: "object", properties: {
      status: { type: "string", enum: ["valido", "invalido", "bloqueado", "pendente"], description: "Situação do acesso." },
      cliente_nome: str("Nome do cliente como o usuário falou."),
      client_id: str("ID do cliente, se já resolvido."),
      observacao: str("Contexto curto (ex.: \"deu erro no login em 29/07\")."),
    }, required: ["status"] },
  }},
  agendar_conversao_gov: { type: "function", function: {
    name: "agendar_conversao_gov",
    description: "Abre a pendência de CONVERSÃO da conta gov.br de um cliente (conta bronze exige vinda presencial para reconhecimento facial). Use em \"a dona Maria é bronze, precisa vir converter\", \"agenda a conversão do Ivan até dia 15\". A pendência acompanha até o nível subir; o atendimento em si é marcado pelo fluxo normal de agendamento.",
    parameters: { type: "object", properties: {
      cliente_nome: str("Nome do cliente como o usuário falou."),
      client_id: str("ID do cliente, se já resolvido."),
      ate: str("Data-limite AAAA-MM-DD, se o usuário der prazo — vira a data fatal da pendência."),
      observacao: str("Observação curta."),
    }, required: [] },
  }},

  /* ══ P2 · Card 11 — diligências ════════════════════════════════════════════
     Enums = CHECKs reais (diligencias_tipo_check / diligencias_status_check),
     lidos do banco em 30/07. Valor fora da lista de TIPO derruba a gravação; e
     valor fora da lista de STATUS é COAGIDO para "pendente" em silêncio pela RPC
     de consulta — por isso o enum aqui protege a RESPOSTA, não só a gravação.
     Protocolo NÃO é obrigatório (decisão de 30/07): a tool nunca o exige. */
  registrar_diligencia: { type: "function", function: {
    name: "registrar_diligencia",
    description: "Registra uma DILIGÊNCIA a ser feita num processo: balcão virtual, colocar concluso para análise, diligenciar expedição de alvará, juntar petição, carta precatória. Use em \"faz um balcão virtual no processo X pedindo agilidade na análise, prazo 24/07\", \"coloca concluso o processo Y\", \"precisa diligenciar o alvará do processo Z\". Se você informar `prazo`, nasce sozinha a pendência em Tarefas que cobra a diligência — SEM prazo nada cobra, e você deve dizer isso ao usuário. Se o processo ainda não estiver cadastrado, a diligência é guardada pelo NÚMERO e a tool avisa: repasse esse aviso.",
    parameters: { type: "object", properties: {
      descricao: str("O que precisa ser feito, em uma frase (ex.: \"balcão virtual pedindo agilidade na análise\")."),
      tipo: { type: "string", enum: ["balcao_virtual", "concluso_analise", "expedicao_alvara", "peticao", "carta_precatoria", "outro"], description: "Natureza da diligência. Default balcao_virtual." },
      processo_numero: str("Número do processo como o usuário falou. A diligência SEMPRE pertence a um processo."),
      process_id: str("ID do processo, se já resolvido com consultar_processo."),
      vara: str("Vara/comarca (ex.: \"10ª Vara de Família de Salvador\")."),
      prazo: str("Prazo AAAA-MM-DD. É o que cria a pendência de cobrança — informe sempre que o usuário der uma data."),
      responsavel_nome: str("Quem faz a diligência. Texto livre (não é usuário do sistema)."),
      observacao: str("Observação curta."),
    }, required: ["descricao"] },
  }},
  cumprir_diligencia: { type: "function", function: {
    name: "cumprir_diligencia",
    description: "Registra que uma diligência JÁ REGISTRADA foi cumprida: guarda o protocolo (recomendado no balcão virtual, mas NÃO é obrigatório — nunca exija nem cobre protocolo do usuário), o que o juízo respondeu, e encerra a pendência de prazo. Se precisar diligenciar de novo, informe `rediligenciar_em`: nasce uma diligência NOVA ligada a esta, com pendência própria. Localize a diligência antes com consultar_diligencias (o retorno traz o id); NUNCA peça UUID ao usuário. Só diligência PENDENTE pode ser cumprida.",
    parameters: { type: "object", properties: {
      diligencia_id: str("ID da diligência, obtido em consultar_diligencias."),
      diligencia_desc: str("Descrição curta da diligência, apenas para exibição no cartão de confirmação."),
      protocolo: str("Número do protocolo do balcão virtual/petição, se houver. Opcional."),
      resultado: str("O que o cartório/juízo respondeu, em uma frase."),
      rediligenciar_em: str("AAAA-MM-DD — só quando o usuário pedir para diligenciar novamente nessa data."),
    }, required: ["diligencia_id"] },
  }},
  consultar_diligencias: { type: "function", function: {
    name: "consultar_diligencias",
    description: "Lista diligências: pendentes (default), cumpridas, prejudicadas ou todas; pode filtrar por vara, por processo ou pelas que vencem até uma data (\"quais diligências vencem essa semana?\" → informe vencendo_ate com a data de sábado). Marca as VENCIDAS. Resposta direta, sem confirmação. Exclusiva de advogado/sócio/admin.",
    parameters: { type: "object", properties: {
      status: { type: "string", enum: ["pendente", "cumprida", "prejudicada", "todas"], description: "Recorte da lista. Default pendente." },
      vara: str("Filtro por vara/comarca (busca parcial)."),
      vencendo_ate: str("AAAA-MM-DD — só as com prazo até esta data."),
      processo_numero: str("Filtro por número do processo (busca parcial)."),
    }, required: [] },
  }},

  /* ══ P2 · Card 13 — audiência: lembrete ao cliente e preparo ═══════════════ */
  registrar_lembrete_audiencia: { type: "function", function: {
    name: "registrar_lembrete_audiencia",
    description: "Registra o RESULTADO da ligação de lembrete de audiência ao cliente. Use em \"avisei a dona Fulana da audiência\", \"liguei pra lembrar da audiência e não atendeu\", \"cancela esse lembrete\". ATENÇÃO: \"feito\" e \"cancelado\" encerram a pendência; \"nao_atendeu\" MANTÉM a pendência ABERTA para nova tentativa — quando for nao_atendeu, diga ao usuário que é preciso tentar ligar de novo. O id do lembrete vem de preparar_audiencia ou do card da pendência; NUNCA peça UUID ao usuário.",
    parameters: { type: "object", properties: {
      lembrete_id: str("ID do lembrete, obtido em preparar_audiencia ou no card da pendência."),
      status: { type: "string", enum: ["feito", "nao_atendeu", "cancelado"], description: "Como terminou a tentativa de aviso. Informe SEMPRE — não deixe o sistema assumir \"feito\"." },
      observacao: str("O que o cliente disse, em uma frase."),
      audiencia_desc: str("Cliente/data da audiência, apenas para exibição no cartão de confirmação."),
    }, required: ["lembrete_id"] },
  }},
  preparar_audiencia: { type: "function", function: {
    name: "preparar_audiencia",
    description: "Parecer de PREPARO de uma audiência: data/hora, tipo de ação, parte contrária, local ou link, quais documentos a tese exige (âncora do §24.1 + procuração), quais o cliente já tem, quais faltam e a régua de lembretes. Use em \"o que falta para a audiência do cliente X?\", \"prepara a audiência de amanhã\". Resposta direta, sem confirmação. O id vem de consultar_audiencias. IMPORTANTE ao responder: repasse a limitação que a tool devolve e, se ela disser que a TESE não casou, avise que a lista de documentos veio incompleta.",
    parameters: { type: "object", properties: {
      audiencia_id: str("ID da audiência, obtido em consultar_audiencias."),
      audiencia_desc: str("Cliente/data da audiência, apenas para exibição."),
    }, required: ["audiencia_id"] },
  }},

  /* ══ P2 · Card 14 — apólices de seguro (SUSEP) ═════════════════════════════ */
  registrar_apolice: { type: "function", function: {
    name: "registrar_apolice",
    description: "Registra de forma estruturada uma APÓLICE DE SEGURO do cliente (substitui a anotação livre \"tem 7 seguros\"): seguradora, produto, número, prêmio, onde aparece o desconto e se o cliente RECONHECE ter contratado. Use em \"a dona Fulana tem um prestamista da SEGURADORA EXEMPLO descontando 43,90 por mês no extrato do INSS e ela não reconhece\". O campo `reconhecida` é o que separa seguro contratado de desconto não autorizado: informe false quando o cliente NEGA, e OMITA quando ninguém perguntou (são três situações diferentes, não invente).",
    parameters: { type: "object", properties: {
      seguradora: str("Nome da seguradora."),
      cliente_nome: str("Nome do cliente como o usuário falou. Basta o nome; se houver mais de um, os candidatos voltam para você perguntar."),
      client_id: str("ID do cliente, se já resolvido com consultar_cliente. Opcional — NUNCA peça UUID."),
      produto: str("Produto/tipo do seguro (ex.: prestamista, vida, capitalização)."),
      numero_apolice: str("Número da apólice, se constar."),
      numero_processo_susep: str("Número do processo SUSEP do produto, se constar."),
      premio_valor: { type: "number", description: "Valor do prêmio descontado, em reais." },
      premio_periodicidade: { type: "string", enum: ["mensal", "unico", "anual", "outro"], description: "Periodicidade do prêmio. ATENÇÃO: o total de prêmio mensal do escritório soma SÓ o que for `mensal` — periodicidade errada faz o valor desaparecer do total." },
      origem_desconto: { type: "string", enum: ["extrato_inss", "conta_bancaria", "contracheque", "outro"], description: "Onde o desconto aparece." },
      reconhecida: { type: "boolean", description: "true = o cliente reconhece ter contratado; false = NÃO reconhece (insumo da tese). OMITA se ninguém perguntou." },
      vigencia_inicio: str("Início da vigência, AAAA-MM-DD."),
      observacao: str("Observação curta."),
    }, required: ["seguradora"] },
  }},
  atualizar_apolice: { type: "function", function: {
    name: "atualizar_apolice",
    description: "Atualiza uma apólice JÁ REGISTRADA: se o cliente reconhece (depois da ligação de confirmação), a data de cancelamento e o valor restituído. Use em \"a dona Fulana confirmou que contratou aquele seguro\", \"aquela apólice foi cancelada em 12/07 e restituíram 430 reais\". Localize a apólice antes com consultar_apolices (o retorno traz o id); NUNCA peça UUID. Informe ao menos um campo para alterar.",
    parameters: { type: "object", properties: {
      apolice_id: str("ID da apólice, obtido em consultar_apolices."),
      apolice_desc: str("Seguradora/produto da apólice, apenas para exibição no cartão de confirmação."),
      reconhecida: { type: "boolean", description: "true = o cliente confirmou que contratou; false = NÃO reconhece." },
      cancelada_em: str("Data do cancelamento, AAAA-MM-DD."),
      restituicao_valor: { type: "number", description: "Valor restituído ao cliente, em reais." },
      observacao: str("Observação curta — é ACRESCENTADA às observações da apólice (não substitui)."),
    }, required: ["apolice_id"] },
  }},
  consultar_apolices: { type: "function", function: {
    name: "consultar_apolices",
    description: "Lista apólices de seguro: de um cliente, de uma seguradora, ou só as que o cliente NÃO reconhece (candidatas à tese SUSEP). Devolve também a soma dos prêmios MENSAIS — ela considera apenas periodicidade mensal, então não é o total geral de prêmios. Resposta direta, sem confirmação. Informe pelo menos um filtro quando a pergunta for sobre um cliente ou uma seguradora: sem filtro nenhum a consulta traz a base inteira.",
    parameters: { type: "object", properties: {
      cliente_nome: str("Nome do cliente, se a pergunta é sobre um cliente específico."),
      client_id: str("ID do cliente, se já resolvido."),
      seguradora: str("Filtro por seguradora (busca parcial)."),
      apenas_nao_reconhecidas: { type: "boolean", description: "true SÓ quando o usuário pedir as não reconhecidas pelo cliente." },
    }, required: [] },
  }},

  /* ══ P2 · Card 15 — procuração: vigência, renovação e campanha ═════════════ */
  registrar_procuracao: { type: "function", function: {
    name: "registrar_procuracao",
    description: "Registra a PROCURAÇÃO de um cliente com a data em que ela foi ASSINADA (nunca a data do upload — é a assinatura que define a vigência) e a validade em meses (padrão 12). Use em \"a procuração da dona Fulana foi assinada em 03/03, ad judicia\", \"anexei a procuração nova do Fulano, assinada ontem\". Se o cliente já tinha procuração, ela é marcada como renovada e a pendência de renovação aberta é encerrada — repasse ao usuário se a anterior estava VENCIDA (nesse intervalo o escritório estava sem poderes) e o aviso de vencimento, quando houver.",
    parameters: { type: "object", properties: {
      data_assinatura: str("Data em que a procuração foi ASSINADA, AAAA-MM-DD. Não use a data do upload nem a de hoje por padrão — pergunte se não souber."),
      cliente_nome: str("Nome do cliente como o usuário falou. Basta o nome; se houver mais de um, os candidatos voltam para você perguntar."),
      client_id: str("ID do cliente, se já resolvido com consultar_cliente. Opcional — NUNCA peça UUID."),
      tipo: { type: "string", enum: ["ad_judicia", "ad_judicia_et_extra", "especifica", "outro"], description: "Tipo de poderes. Default ad_judicia." },
      validade_meses: { type: "integer", description: "Validade em meses, de 1 a 120. Default 12." },
      client_document_id: str("ID do PDF da procuração já anexado ao dossiê, se houver."),
      observacao: str("Observação curta."),
    }, required: ["data_assinatura"] },
  }},
  consultar_procuracoes: { type: "function", function: {
    name: "consultar_procuracoes",
    description: "Lista procurações: de um cliente, ou todas as que vencem nos próximos N dias (\"quais procurações vencem esse mês?\" → vencendo_em_dias 30). Mostra dias para vencer, marca as VENCIDAS (nesses casos o escritório está sem poderes) e diz quais não têm PDF no dossiê. Resposta direta, sem confirmação. Informe um filtro quando a pergunta for sobre um cliente ou uma janela: sem filtro nenhum a consulta traz a base inteira.",
    parameters: { type: "object", properties: {
      cliente_nome: str("Nome do cliente, se a pergunta é sobre um cliente específico."),
      client_id: str("ID do cliente, se já resolvido."),
      vencendo_em_dias: { type: "integer", description: "Janela em dias (ex.: 30 para \"esse mês\"). A janela INCLUI as já vencidas — quem venceu é mais urgente." },
      incluir_historico: { type: "boolean", description: "true para ver também as já renovadas/revogadas." },
    }, required: [] },
  }},
  gerar_campanha_renovacao_procuracao: { type: "function", function: {
    name: "gerar_campanha_renovacao_procuracao",
    description: "Cria uma CAMPANHA de ligação (objetivo renovar procuração) com todos os clientes cuja procuração vence na janela informada (padrão 30 dias). Use em \"monta a campanha de renovação de procuração\", \"quero ligar para quem tem procuração vencendo esse mês\". Não repete cliente que já está em campanha aberta do mesmo objetivo — por isso a fila pode sair VAZIA mesmo dando certo, e nesse caso você DEVE dizer que não há ninguém para ligar. Repasse também quantos clientes da fila estão SEM TELEFONE.",
    parameters: { type: "object", properties: {
      janela_dias: { type: "integer", description: "Quantos dias à frente considerar (1 a 365). Default 30." },
      nome: str("Nome da campanha. Se omitido, o sistema gera um descritivo."),
    }, required: [] },
  }},
};

export function toolsFor(allowed: string[] | null | undefined): ToolDef[] {
  if (!allowed || allowed.length === 0) return [];
  return allowed.filter((n) => TOOLS[n]).map((n) => TOOLS[n]);
}

/**
 * A tool EXISTE neste runtime? `agents.allowed_tools` é sincronizado de
 * `tool_catalog` (banco) por trigger e pode listar tools que este edge NÃO
 * implementa — `toolsFor` as filtra em silêncio, então o LLM nunca as vê e o
 * agente responde "não tenho essa ferramenta". Quem precisa recusar por outro
 * motivo (ex.: regra de papel) tem de poder distinguir "não existe aqui" de
 * "existe e ninguém porta". Ver A.6 da validação de 03-04/08 (I-04/I-05).
 */
export function isKnownTool(name: string): boolean {
  return !!TOOLS[name];
}
