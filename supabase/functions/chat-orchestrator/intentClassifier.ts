// supabase/functions/chat-orchestrator/intentClassifier.ts
//
// Card 2.8 — Classificador de intenção + suficiência de insumo.
//
// Roda na ENTRADA (antes do N1) e toma UMA de CINCO decisões, evitando rodar a
// cadeia cara (N3 redator) quando não vale a pena:
//   - TRIVIAL              → fast-path: resposta natural e acolhedora (sem N2/N3).
//   - CONSULTA             → LEITURA de dado já cadastrado (cliente/tarefa/processo/
//                            documento/colaborador) → loop curto de leitura por tool.
//   - ACAO_COM_TOOL        → ESCRITA/EXECUÇÃO operacional (cadastrar, criar tarefa,
//                            solicitar documento, pendência, agenda) → cadeia com N3
//                            e ferramentas, por caminho CURTO (sem N2-director nem
//                            validações de qualidade — uma tool é binária).
//   - NEGOCIO_SEM_INSUMO   → demanda de PEÇA jurídica SEM dados textuais suficientes
//                            para fundamentar → pede os dados (sem N3).
//   - NEGOCIO_COM_INSUMO   → demanda de PEÇA COM dados suficientes → cadeia completa.
//
// FRONTEIRA CONSULTA × ACAO_COM_TOOL (ambas são "ação por tool"; distinguir):
//   CONSULTA = LEITURA de um dado já cadastrado ("qual o CPF do cliente X").
//   ACAO_COM_TOOL = ESCRITA/EXECUÇÃO ("cadastrar cliente", "criar tarefa"). Nenhuma
//   das duas é peça. Ambas roteiam ao N3 (caminho de ferramentas), com rótulos
//   distintos no audit.
//
// PRINCÍPIO DE SEGURANÇA — DUAS assimetrias, ambas "na dúvida, o mais seguro":
//   A) Trivial vs. negócio/ação: o erro barato é rodar a cadeia para um "oi"; o GRAVE
//      é tratar demanda como trivial e pular a orquestração. → Na dúvida, NÃO é
//      trivial. Fast-path só com ALTA confiança de trivial.
//   B) Insumo suficiente vs. insuficiente (para PEÇAS): o erro barato é gerar uma peça
//      a mais; o GRAVE é BLOQUEAR uma demanda que TINHA insumo. → Na dúvida, GERAR.
// Resumo: o default de tudo é NEGOCIO_COM_INSUMO (gerar). TRIVIAL, CONSULTA,
// ACAO_COM_TOOL e SEM_INSUMO só com rótulo explícito. normalizeIntent materializa
// esse default seguro.

export type IntentCategory =
  | "TRIVIAL"
  | "CONSULTA"
  | "NEGOCIO_SEM_INSUMO"
  | "NEGOCIO_COM_INSUMO"
  | "ACAO_COM_TOOL";

// Prompt do classificador (modelo RÁPIDO, 1 chamada curta, saída JSON). Instrui a
// olhar a MENSAGEM INTEIRA — "bom dia, preciso de uma petição..." é negócio: começar
// com saudação NÃO torna trivial. A suficiência de insumo é julgada sobre o TEXTO da
// mensagem + o CONTEXTO de anexos que o chamador informa (imagens não contam).
export const INTENT_CLASSIFIER_RULES = `Você é um classificador de intenção na ENTRADA de um sistema jurídico multi-agente.
Analise a MENSAGEM INTEIRA do usuário (não só o começo) e escolha UMA categoria:

- "TRIVIAL": saudação, cortesia, small talk ou pergunta trivial SEM qualquer teor
  jurídico e SEM pedido de trabalho. Ex.: "oi", "bom dia", "tudo bem?", "obrigado".
  Use TRIVIAL SOMENTE com ALTA CONFIANÇA. NÃO é TRIVIAL quando o usuário pede o
  ESTADO DO PRÓPRIO TRABALHO (tarefas/prazos/agenda/pendências) — isso é CONSULTA,
  mesmo em tom coloquial ou com saudação embutida ("bom dia! como está meu dia?").
- "CONSULTA": o usuário quer CONSULTAR/BUSCAR/VER (LEITURA) um dado JÁ CADASTRADO no
  sistema (dados de um CLIENTE, tarefas, processos, documentos anexados, ou
  colaboradores) — NÃO é pedir uma peça nova, NÃO é escrever/criar nada, nem small
  talk; é uma pergunta de LEITURA sobre o cadastro do escritório. Ex.: "consulte o CPF
  do cliente Fulano", "qual o telefone do cliente X", "busque o cliente Y", "quais
  tarefas do cliente Z", "que documentos o cliente W já enviou". Pedir um DADO de um
  cliente/registro existente é CONSULTA, não peça.
  TAMBÉM É CONSULTA o PANORAMA PESSOAL do usuário — o estado do próprio trabalho
  (tarefas, prazos, atendimentos, audiências, pendências, notificações). Ex.: "me dá
  o resumo do meu dia", "como está meu dia", "o que eu tenho pra hoje", "minha
  situação hoje", "o que está pendente pra mim hoje", "como está minha semana",
  "o que tenho na agenda amanhã". REGRA: se a frase pede o ESTADO DO TRABALHO do
  usuário, é CONSULTA — nunca TRIVIAL, mesmo com tom coloquial/saudação embutida.
- "ACAO_COM_TOOL": pedido de AÇÃO OPERACIONAL de ESCRITA/EXECUÇÃO no sistema — NÃO é
  uma peça jurídica nem uma leitura: é uma operação que CRIA ou MODIFICA algo:
  cadastrar cliente, criar tarefa/card, solicitar documentos, pedir acesso a arquivos,
  criar/transferir/resolver pendência, agendar reunião. Mesmo que o usuário não forneça
  todos os dados, classifique como ACAO_COM_TOOL se a intenção é claramente uma dessas
  ações de escrita. Ex.: "quero cadastrar um cliente", "crie uma tarefa para fulano",
  "solicite os documentos do cooperado", "abra uma pendência", "Ryan Ribeiro CPF
  123.456.789-00 endereço rua X" (quando o contexto da conversa é um cadastro).
  TAMBÉM SÃO ACAO_COM_TOOL: PROTOCOLAR uma peça / dar entrada / "já protocolei"
  (registra o protocolo — NÃO é redigir), abrir/atualizar PROCESSO, GERAR os
  documentos/kit de um cliente, marcar audiência, reagendar/cancelar atendimento,
  conceder/revogar acesso a menu. ATENÇÃO: "protocola a peça do cliente X" é
  ACAO_COM_TOOL (o verbo é protocolar), NUNCA NEGOCIO_SEM_INSUMO — não peça dados de
  redação (réu, fatos, valores) para protocolar.
- "NEGOCIO_SEM_INSUMO": é uma demanda de PEÇA JURÍDICA (pedir petição, cálculo,
  análise, contestação etc.), MAS a mensagem NÃO traz informação textual suficiente
  para fundamentar a peça. Ex.: "gere uma peça" sozinho; "faça uma petição" sem
  cliente/réu/fatos/valores; pedido vago. Anexos de IMAGEM não contam como insumo
  (não são lidos até o OCR). NÃO use para ações operacionais (cadastrar, criar tarefa,
  PROTOCOLAR, abrir processo, gerar documentos do cliente) — essas são ACAO_COM_TOOL;
  nem para leitura de cadastro/panorama do dia — essa é CONSULTA. Só use quando o
  usuário pede o TEXTO de uma peça e faltam dados para escrevê-la.
- "NEGOCIO_COM_INSUMO": demanda de PEÇA JURÍDICA COM dados textuais suficientes para
  o especialista trabalhar (ex.: cliente, réu, fatos, valores, tema — ou documento
  com texto legível anexado). "bom dia, preciso de uma petição de indébito para o
  cliente João, contrato 123, valor R$5.000, banco X" é NEGOCIO_COM_INSUMO.

REGRAS DE OURO (assimetria — obedeça à risca):
1) Na MENOR dúvida entre TRIVIAL e negócio/ação, escolha uma categoria de negócio ou
   ação. É preferível processar um "oi" a deixar passar uma demanda como trivial.
2) Na dúvida entre COM e SEM insumo (para PEÇAS), escolha NEGOCIO_COM_INSUMO (gerar).
   Só use NEGOCIO_SEM_INSUMO quando estiver CLARO que faltam dados para a peça.
3) REGRA DE OURO da natureza: AÇÃO de ESCRITA (cadastrar, criar, solicitar, agendar,
   abrir/transferir/resolver pendência) → ACAO_COM_TOOL; LEITURA de cadastro (consultar,
   buscar, ver um dado existente) → CONSULTA; produzir uma PEÇA/documento jurídico novo
   → NEGOCIO_*. Nenhuma ação operacional (escrita ou leitura) é peça. Na dúvida entre
   CONSULTA/ACAO e NEGOCIO (peça), só use NEGOCIO quando for claramente redação de peça.

Responda APENAS com JSON: {"categoria":"TRIVIAL"|"CONSULTA"|"ACAO_COM_TOOL"|"NEGOCIO_SEM_INSUMO"|"NEGOCIO_COM_INSUMO"}.`;

// System prompt da resposta do FAST-PATH (TRIVIAL) — natural, não template fixo.
export const FAST_REPLY_SYSTEM = `Você é o assistente virtual de um escritório de advocacia (JurisAI).
O usuário enviou uma mensagem TRIVIAL (saudação, cortesia ou small talk), SEM demanda jurídica.
Responda de forma BREVE, calorosa e natural em português do Brasil (1 a 2 frases) e CONVIDE o
usuário a dizer no que você pode ajudar juridicamente (ex.: elaborar uma peça, analisar um
documento, tirar uma dúvida). NÃO invente informação jurídica, NÃO redija peça, NÃO peça dados
sensíveis e NÃO faça perguntas investigativas. Apenas acolha e convide a informar a demanda.
A.7: NUNCA afirme prazo, SLA, política interna, percentual ou número de dias do escritório — esse
caminho não consulta ferramenta nenhuma, então você não tem lastro para nada disso. Se perguntarem,
diga que precisa consultar e convide a fazer o pedido; é PROIBIDO estimar ou dar exemplo numérico.`;

// System prompt da resposta de PEDIR DADOS (NEGOCIO_SEM_INSUMO) — específica e amigável.
export const NEED_INFO_SYSTEM = `Você é o assistente virtual de um escritório de advocacia (JurisAI).
O usuário pediu uma peça/trabalho jurídico, mas NÃO forneceu informação suficiente para fundamentá-la.
Responda de forma BREVE e amigável em português do Brasil pedindo os dados de forma ESPECÍFICA:
quem é o cliente, qual é o réu, os fatos e os valores envolvidos, e o tema/objeto da peça. Peça que
ele envie por TEXTO. NÃO invente dados, NÃO produza a peça e NÃO rode nenhuma análise — apenas peça as
informações necessárias, de maneira objetiva e acolhedora.

PRAZO/SLA/POLÍTICA: este caminho NÃO chama ferramenta nenhuma, então você não tem lastro para
nenhum número. NUNCA prometa prazo de entrega, SLA, dias úteis, percentual ou política interna
("em 3 dias úteis eu entrego"). Se perguntarem, diga que não sabe e que pode consultar.`;

// Adendo sobre OCR: só quando houver anexo (imagem) do qual o usuário pode estar
// esperando que o sistema "leia" os dados — hoje isso ainda não acontece.
export const NEED_INFO_OCR_NOTE = ` OBS.: o usuário anexou um arquivo que ainda não pode ser lido
automaticamente (imagens dependem de OCR, que virá em breve). Explique isso gentilmente e reforce
o pedido para que ele passe os dados por texto.`;

// Pré-filtro determinístico: a mensagem referencia anexos? O front concatena os
// anexos como "[Arquivos: ...]" ao texto. Usado como dica de contexto (ex.: só
// imagem = pedir dados + adendo de OCR).
export function mentionsAttachments(message: string): boolean {
  return /\[\s*Arquivos?\s*:/i.test(message || "");
}

// Normaliza a saída do classificador para a categoria canônica. ASSIMÉTRICO: apenas
// rótulos EXPLÍCITOS viram TRIVIAL, CONSULTA, ACAO_COM_TOOL ou SEM_INSUMO; QUALQUER
// outra coisa (vazio, ambíguo, rótulo desconhecido, "NEGOCIO_COM_INSUMO", "NEGOCIO",
// "INCERTO") cai no default SEGURO NEGOCIO_COM_INSUMO — cadeia completa / gerar. Nunca
// produz um desvio (fast/consulta/ação/bloqueio) por acidente.
export function normalizeIntent(raw: string | null | undefined): IntentCategory {
  const c = (raw || "").trim().toUpperCase();
  if (c === "TRIVIAL") return "TRIVIAL";
  if (c === "CONSULTA") return "CONSULTA";
  if (c === "ACAO_COM_TOOL" || c === "AÇÃO_COM_TOOL" || c === "ACAO" || c === "AÇÃO") return "ACAO_COM_TOOL";
  if (c === "NEGOCIO_SEM_INSUMO" || c === "NEGÓCIO_SEM_INSUMO" || c === "SEM_INSUMO") return "NEGOCIO_SEM_INSUMO";
  return "NEGOCIO_COM_INSUMO"; // default seguro: gerar
}

// Decide se vale rodar o classificador por LLM. false → default NEGOCIO_COM_INSUMO
// (cadeia completa) sem gastar a chamada: flag desligada, mensagem vazia, ou muito
// longa (texto longo dificilmente é conversa fiada e quase sempre traz insumo →
// gerar é a direção segura). Só LIBERA a classificação — nunca força fast-path/bloqueio.
export function shouldClassify(
  message: string, opts: { enabled: boolean; maxChars: number },
): boolean {
  if (!opts.enabled) return false;
  const m = (message || "").trim();
  if (!m) return false;
  if (m.length > opts.maxChars) return false;
  return true;
}

// Caminho (auditoria/roteamento) correspondente à categoria.
//   TRIVIAL            → "fast"     (resposta curta acolhedora)
//   CONSULTA           → "consulta" (loop de leitura por tool, síncrono no START)
//   NEGOCIO_SEM_INSUMO → "need_info"(pede dados, sem N3)
//   ACAO_COM_TOOL      → "full"     (cadeia com N3+tools; caminho CURTO no processStep)
//   NEGOCIO_COM_INSUMO → "full"     (cadeia completa de peça)
export function routePathFor(category: IntentCategory): "fast" | "consulta" | "need_info" | "full" {
  if (category === "TRIVIAL") return "fast";
  if (category === "CONSULTA") return "consulta";
  if (category === "NEGOCIO_SEM_INSUMO") return "need_info";
  return "full"; // NEGOCIO_COM_INSUMO e ACAO_COM_TOOL → cadeia com N3
}

// ─── CHAT-COLETA-CONTINUIDADE: continuidade de coleta dado-a-dado ─────────────
// O classificador decide CADA mensagem isoladamente. Numa coleta Modelo B
// (especialista pergunta um dado por vez), a resposta curta do usuário ("física",
// "Ryan", um CPF, um CEP) não tem cara de ação e caía em TRIVIAL → fast-path →
// "Meu Assistente" sequestrava a conversa e o cadastro morria no meio. A correção
// é detectar, ANTES de classificar, que há coleta ativa e continuar com o MESMO
// especialista, tratando a mensagem como a resposta esperada.

// Há coleta ativa aguardando o usuário? Sinal: a ÚLTIMA mensagem do assistente na
// sessão foi um turno textual de um especialista de AÇÃO (finishAcaoDone grava
// metadata { kind:"final", intent:"ACAO_COM_TOOL", ... }). A escrita de fato
// (ActionCard) NÃO passa por aqui — ela vira kind:"action_proposal"/"action_done",
// sem intent — então cadastro concluído/aguardando confirmação não dispara falso
// positivo. Pergunta de coleta em andamento SIM.
export function isAwaitingCollectionMeta(meta: unknown): boolean {
  if (!meta || typeof meta !== "object") return false;
  const m = meta as { kind?: unknown; intent?: unknown };
  return m.kind === "final" && m.intent === "ACAO_COM_TOOL";
}

// Escape hatch conservador: mesmo em coleta ativa, o usuário pode abandonar
// explicitamente (cancelar, deixar pra depois) ou claramente iniciar outra ação
// (gerar uma peça). Só nesses casos NÃO continuamos a coleta — o default é
// continuar. Mantido enxuto de propósito: dados de cadastro (nome, CPF, telefone,
// e-mail, CEP, endereço) não contêm estas expressões, então falso-escape é raro.
// Sem \b APÓS token possivelmente acentuado (ã/á/ç): em regex ASCII o boundary
// não casa depois de caractere não-ASCII e daria falso-negativo ("amanhã", "lá").
const COLLECTION_ESCAPE_RE = [
  /\bcancela(r)?\b/i,
  /\bdeixa (pra|para) (depois|outra hora|amanh)/i,
  /\bdeixa (pra|para) l[áa]/i,
  /\besque[çc](e|a|er)/i,
  /\bpara com isso\b/i,
  /\bmuda(r)? de assunto\b/i,
  // Início claro de OUTRA ação/peça (não é dado de cadastro):
  /\b(gere|gerar|redi[jg]a|redigir|elabor[ae]|fa[çc]a|crie|criar)\b[^.]*(peti[çc][ãa]o|contesta[çc][ãa]o|recurso|contrato|procura[çc][ãa]o|notifica[çc][ãa]o|pe[çc]a)/i,
];
export function isCollectionEscape(message: string): boolean {
  const m = (message || "").trim();
  if (!m) return false;
  return COLLECTION_ESCAPE_RE.some((re) => re.test(m));
}

// ─── CADASTRO-MODELO-A: disparo do formulário de cadastro ────────────────────
// Troca de abordagem: em vez de conduzir a coleta conversacional (Modelo B), um
// pedido claro de "cadastrar cliente" faz o front renderizar o ClienteFormWizard
// inline (Modelo A). Detecção DETERMINÍSTICA (não depende de tool-calling nem do
// classificador por LLM): verbo de cadastro + alvo "cliente". Conservador para
// não colidir com CONSULTA ("buscar/ver o cliente X" NÃO dispara o form).
const CADASTRO_VERBO_RE = /\b(cadastr\w*|adicion\w*|inclu[íi]?\w*|registr\w*|cria(r|ndo)?)\b/i;
const CADASTRO_ALVO_RE = /\bclientes?\b/i;
// "novo(s) cliente(s)" como comando (ex.: o usuário digita "novo cliente").
const CADASTRO_FRASE_RE = /\bnovos?\s+clientes?\b/i;
// Leituras/consultas que mencionam "cliente" mas NÃO são cadastro.
const CADASTRO_NEGATIVE_RE = /\b(consult\w*|busc\w*|ver|mostr\w*|list\w*|qual|quais|dados do|informa\w*|telefone|cpf do|endere[çc]o do)\b/i;

export function isCadastroClienteRequest(message: string): boolean {
  const m = (message || "").trim();
  if (!m) return false;
  // TRILHA-A: PRECEDÊNCIA do verbo de tarefa. "cria uma tarefa pra ligar pro
  // cliente X" casaria CADASTRO_VERBO_RE ("cria") + CADASTRO_ALVO_RE ("cliente")
  // e abriria o form indevidamente. Se a frase é um pedido de TAREFA, ela NUNCA é
  // cadastro — mesmo com a palavra "cliente" (que ali é o ALVO da tarefa, resolvido
  // pelo 4.1). Cadastro genuíno ("cadastra o cliente João", "novo cliente") não
  // casa isTarefaChatRequest, então não regride. Independe de TAREFA_CHAT_ENABLED:
  // a presença de "cliente" não deve, por si só, disparar cadastro sob verbo de tarefa.
  if (isTarefaChatRequest(m)) return false;
  // DOC-CHECKLIST (6.3): pedido de checklist/pendência documental NUNCA é cadastro,
  // mesmo com "cliente" + verbo (ex.: "registre a pendência dos documentos do cliente
  // X" casava CADASTRO_ALVO+VERBO e abria o form). Espelha o guard de TAREFA e vem
  // ANTES do CADASTRO_NEGATIVE/FRASE/ALVO+VERBO. Independe de CHAT_DOC_CHECKLIST_ENABLED:
  // mesmo com a escrita do checklist desligada, a frase não deve abrir o cadastro —
  // deve seguir para a cadeia completa (onde o agente descreve/lê).
  if (isDocChecklistRequest(m)) return false;
  // "quero ver os dados do cliente" é consulta → nunca dispara o form.
  if (CADASTRO_NEGATIVE_RE.test(m)) return false;
  if (CADASTRO_FRASE_RE.test(m)) return true;
  return CADASTRO_ALVO_RE.test(m) && CADASTRO_VERBO_RE.test(m);
}

// ─── TAREFA-CHAT (card 4.1): disparo do cartão de confirmação de tarefa ───────
// TAREFA-CHAT (card 4.1): detecção determinística de "criar tarefa" pelo chat.
// Conservador: exige verbo de criação/agenda + alvo tarefa/lembrete, OU um verbo
// de ação com marcador de prazo. NUNCA dispara em consulta ("quais/mostra ...").
const TAREFA_CONSULTA_RE = /\b(quais|quantas|mostr\w*|list\w*|ver|status|atrasad\w*|do time|da equipe)\b/i;
const TAREFA_ALVO_RE = /\b(tarefa|tarefas|lembrete|lembra(r|-me)?|to-?do|afazer)\b/i;
const TAREFA_VERBO_RE = /\b(cria(r|ndo)?|agend\w*|marc\w*|anot\w*|abr\w*|nova)\b/i;
// verbo de ação + marcador de prazo relativo (ligar amanhã, enviar até sexta)
const TAREFA_ACAO_PRAZO_RE = /\b(lig\w*|envi\w*|protocol\w*|revis\w*|entreg\w*|retorn\w*|cobr\w*)\b.*\b(hoje|amanh[ãa]|depois de amanh[ãa]|segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo|semana que vem|[àa]s?\s*\d{1,2}\s*h|\d{1,2}:\d{2}|at[ée]\s)/i;

export function isTarefaChatRequest(message: string): boolean {
  const m = (message || "").trim();
  if (!m) return false;
  if (TAREFA_CONSULTA_RE.test(m)) return false;
  if (TAREFA_ALVO_RE.test(m) && TAREFA_VERBO_RE.test(m)) return true;
  return TAREFA_ACAO_PRAZO_RE.test(m);
}

// ─── DOC-CHECKLIST (card 6.3): precedência sobre CADASTRO ─────────────────────
// Um pedido de "checklist / pendência documental" NUNCA é cadastro de cliente,
// mesmo contendo "cliente" + verbo (ex.: "registre a pendência dos documentos
// do cliente X" casava CADASTRO_ALVO+VERBO e abria o form). Espelha o guard de
// TAREFA. INDEPENDE de CHAT_DOC_CHECKLIST_ENABLED — a frase não deve abrir o
// cadastro nem quando a escrita do checklist está desligada.
const DOCCHK_ALVO_RE     = /\b(checklist|documenta[çc][ãa]o|documentos?|comprovant\w*|extrato)\b/i;
const DOCCHK_INTENT_RE   = /\b(pend[êe]ncia\w*|checklist|solicit\w*|ped\w*|mont\w*|junt\w*|exig\w*|falt\w*|registr\w*)\b/i;
// consulta de documentos ("quais documentos do cliente?") NÃO é checklist
const DOCCHK_NEGATIVE_RE = /\b(qual|quais|status|ver (os )?documentos?|mostr\w* (os )?documentos?|dados do)\b/i;

export function isDocChecklistRequest(message: string): boolean {
  const m = (message || "").trim();
  if (!m) return false;
  if (DOCCHK_NEGATIVE_RE.test(m)) return false;
  return DOCCHK_ALVO_RE.test(m) && DOCCHK_INTENT_RE.test(m);
}

// ─── PEÇA EXPLÍCITA: exceção do atalho "documento de identidade → cadastro" ───
// Quando a recepção anexa um RG/CNH, o fluxo padrão é PROPOR CADASTRO (ActionCard
// consultar_cliente→cadastrar_cliente). Mas se o usuário PEDE EXPLICITAMENTE uma
// peça/documento jurídico ("gere a petição com base neste RG"), o turno NÃO deve
// ser sequestrado para cadastro — segue para a Confecção. Conservador: exige
// verbo de PRODUÇÃO + substantivo de PEÇA na mesma frase (o AND corta falsos
// positivos de "segue o RG", "esse é o documento dele", etc.).
const PECA_VERBO_RE = /\b(ger\w*|fa[çc]\w*|faz\w*|redij\w*|redig\w*|elabor\w*|minut\w*|mont\w*|escrev\w*|prepar\w*|produz\w*|cri\w*|rascunh\w*)\b/i;
const PECA_ALVO_RE = /\b(pe[çc]a|peti[çc][ãa]o|inicial|contesta[çc][ãa]o|r[ée]plica|tr[ée]plica|recurso|apela[çc][ãa]o|agravo|embargos?|contrato|procura[çc][ãa]o|parecer|notifica[çc][ãa]o|defesa|manifesta[çc][ãa]o|acordo|distrato|requerimento|impugna[çc][ãa]o)\b/i;

export function isPecaExplicitRequest(message: string): boolean {
  const m = (message || "").trim();
  if (!m) return false;
  return PECA_VERBO_RE.test(m) && PECA_ALVO_RE.test(m);
}

// ─── LLM-FIRST ROUTING: classificador de OBJETO ──────────────────────────────
// Os detectores regex acima (isCadastroClienteRequest, isTarefaChatRequest, e os
// de agendaDetect.ts) deixam de DECIDIR o roteamento e viram HINTS. Quando algum
// hint casa, o handler chama o LLM com ACTION_OBJECT_RULES para decidir o OBJETO
// real do pedido — nunca pelo verbo isolado ("adicionar", "cadastrar", "marcar"
// são ambíguos). Isso corrige o misroute "adicionar na agenda uma reunião de um
// cliente" → cadastro_form: o verbo "adicionar" rege a REUNIÃO, não o "cliente".
// B1 (E2E 24/07): a taxonomia tinha só 4 objetos, então NENHUM pedido das Ondas
// 1-3 (processo, kit documental, resumo do dia, protocolo, permissão de menu…)
// tinha objeto próprio: caía em OUTRO e o roteador escolhia o especialista "mais
// parecido" por semântica de nome — "abre um processo" ia para a Agenda, "gera os
// documentos" virava questionário de peça, "resumo do meu dia" virava small talk.
// Cada objeto abaixo tem tool e especialista portador determinísticos (ver
// ROUTE_OBJECT_ACTIONS no index.ts) — o LLM classifica o OBJETO, não o agente.
export type RouteObject =
  | "CADASTRO" | "AGENDA_CLIENTE" | "TAREFA_INTERNA"
  | "PROCESSO_CREATE" | "PROCESSO_UPDATE" | "KIT_DOCUMENTAL" | "RESUMO_DIA"
  | "PROTOCOLO" | "TAREFA_UPDATE" | "CLIENTE_UPDATE" | "AGENDA_CONSULTA"
  | "AGENDA_UPDATE" | "AUDIENCIA" | "PERMISSAO_MENU" | "CREDENCIAL_GOV"
  // Motor 1 (Cards 3/4/5): segmentação bancária → campanha → ligação → KPI.
  | "RELACAO_BANCARIA" | "CAMPANHA" | "LIGACAO" | "KPI_LIGACOES" | "AUDIO_AUTORIZACAO"
  // Motores 2 e 3 (Cards 6/7/8/9/10).
  | "RECLAMACAO_ADMIN" | "RECLAMACAO_RESPOSTA" | "RECLAMACAO_CONSULTA"
  | "EXECUCAO_INICIAR" | "EXECUCAO_FASE" | "EXECUCAO_CONSULTA" | "EXECUCAO_REVISAO"
  | "EVENTO_PROCESSUAL" | "FILA_GOV" | "CREDENCIAL_GOV_STATUS" | "CONVERSAO_GOV"
  | "DOCUMENTOS_OBRIGATORIOS"
  // P2 (Cards 11/13/14/15): diligências, preparo/lembrete de audiência,
  // apólices SUSEP e procuração (vigência, renovação e campanha).
  | "DILIGENCIA_REGISTRAR" | "DILIGENCIA_CUMPRIR" | "DILIGENCIA_CONSULTA"
  | "AUDIENCIA_PREPARO" | "LEMBRETE_AUDIENCIA"
  | "APOLICE_REGISTRAR" | "APOLICE_UPDATE" | "APOLICE_CONSULTA"
  | "PROCURACAO_REGISTRAR" | "PROCURACAO_CONSULTA" | "CAMPANHA_PROCURACAO"
  // A.6 (validação 03-04/08): objetos cuja RPC existe em produção e tem gate de
  // PAPEL, mas que NENHUM agente porta como tool. Sem objeto próprio, o pedido
  // caía no fluxo genérico e a recusa saía como "o especialista não tem essa
  // ferramenta" em vez da regra real (só advogado/sócio · só admin).
  | "EXTRATO_DECISAO" | "MATRIZ_DOCUMENTOS"
  | "OUTRO";

export const ACTION_OBJECT_RULES = `Você é um CLASSIFICADOR de OBJETO de pedidos operacionais de um escritório de advocacia. Decida qual é o OBJETO REAL do pedido, NUNCA pelo verbo isolado — verbos como "cadastrar", "adicionar", "incluir", "marcar", "criar", "atribuir" são AMBÍGUOS; o que decide é SOBRE O QUE eles agem.

Responda SOMENTE em JSON: {"objeto":"<CATEGORIA>"} com UMA destas categorias:

- "CADASTRO": o objeto é o PRÓPRIO CADASTRO de um cliente (criar a ficha do cliente no sistema). Ex.: "cadastre o cliente João Silva, CPF 123", "novo cliente Maria", "adicione o cliente Pedro". Só é CADASTRO quando a coisa criada é o CLIENTE em si.
- "AGENDA_CLIENTE": o objeto é um ATENDIMENTO, CONSULTA ou REUNIÃO COM UM CLIENTE (cliente + advogado, na agenda de atendimentos), inclusive confirmar/cancelar/remarcar. Ex.: "adicionar na agenda uma reunião de um cliente com o Dr Rodrigo", "marque uma consulta pro cliente X amanhã 10h", "cancele o atendimento do cliente Y". ATENÇÃO: mesmo que a frase diga "cadastrar/adicionar NA AGENDA", se o objeto é uma reunião/atendimento de cliente, é AGENDA_CLIENTE — NUNCA cadastro.
- "TAREFA_INTERNA": o objeto é uma TAREFA, PENDÊNCIA, LEMBRETE ou REUNIÃO INTERNA entre colaboradores. Ex.: "atribua uma tarefa pra reunião de equipe", "abra uma pendência de procuração pro Adalberto", "cadastre uma pendência de procuração pro cliente X para sexta", "crie um lembrete pra amanhã", "marque uma reunião entre nós às 15h". ATENÇÃO CRÍTICA: uma PENDÊNCIA/TAREFA continua sendo TAREFA_INTERNA mesmo quando a frase cita um CLIENTE e uma DATA/PRAZO ("pro cliente X para sexta") — o objeto é a pendência (o cliente é só o assunto dela), NUNCA um atendimento na agenda (AGENDA_CLIENTE) e NUNCA cadastro de cliente.
- "PROCESSO_CREATE": o objeto é ABRIR/CRIAR um PROCESSO ou AÇÃO judicial novo. Ex.: "abre um processo pro cliente X, tipo indenizatório, réu Agibank", "cria uma ação de cobrança para a Maria". É o processo em si sendo criado — não confundir com DISTRIBUIR um processo já existente (OUTRO) nem com redigir a petição (OUTRO).
- "PROCESSO_UPDATE": o objeto é um PROCESSO que já existe: registrar ANDAMENTO, mudar status/fase, anotar próxima audiência. Ex.: "registra no processo do Adalberto que a contestação foi protocolada", "atualiza o status do processo da Maria".
- "KIT_DOCUMENTAL": o objeto são os DOCUMENTOS PADRÃO de um cliente já cadastrado (procuração, contrato de honorários, declaração de hipossuficiência, ficha cadastral) — gerar/emitir/preparar/refazer. Ex.: "gera os documentos do cliente X", "emite o kit da Maria", "prepara a procuração e o contrato do Adalberto". ATENÇÃO CRÍTICA: "gerar/emitir os DOCUMENTOS de um cliente" é SEMPRE KIT_DOCUMENTAL — NUNCA redação de peça. Só é peça (OUTRO) quando pedem para REDIGIR/ELABORAR uma peça processual sob medida (petição inicial, contestação, recurso, réplica, parecer, manifestação).
- "RESUMO_DIA": o objeto é o RESUMO/PANORAMA do próprio dia, da semana ou da própria carga de trabalho do usuário (tarefas, prazos, agenda, pendências). Ex.: "me dá o resumo do meu dia", "como está meu dia?", "o que eu tenho pra hoje?", "minha situação hoje", "o que está pendente pra mim hoje", "como está minha semana", "minhas pendências e compromissos de hoje". ATENÇÃO CRÍTICA: é um pedido de DADO operacional, NUNCA conversa/small talk — e continua sendo RESUMO_DIA mesmo com tom coloquial ou saudação embutida ("bom dia! me dá o resumo do meu dia"). Só é conversa quando NÃO se pede nada sobre o trabalho ("bom dia, tudo bem?").
- "PROTOCOLO": o objeto é o PROTOCOLO de uma peça — registrar que protocolou/deu entrada, ou concluir a tarefa de protocolo. Ex.: "protocola a peça do cliente X", "protocola a inicial do Adalberto", "já protocolei a peça da Maria", "conclui o protocolo do Adalberto", "dá entrada na peça do cliente Y". ATENÇÃO CRÍTICA: a palavra "peça" AQUI é o objeto que será PROTOCOLADO — não é pedido de redação. Se o verbo é PROTOCOLAR / DAR ENTRADA / JÁ PROTOCOLEI, é sempre PROTOCOLO, mesmo que a frase contenha "peça", "petição", "inicial" ou "contestação". PROTOCOLAR ≠ REDIGIR: só é peça (OUTRO) quando pedem para ESCREVER/ELABORAR o texto.
- "TAREFA_UPDATE": o objeto é uma TAREFA/PENDÊNCIA/CARD que JÁ existe: mover, mudar status/prazo/prioridade, renomear ou COMENTAR. Ex.: "passa a pendência da procuração pra em andamento", "muda o prazo da tarefa do contrato pra sexta", "comenta no card do Adalberto que o cliente confirmou". Distinto de CRIAR uma nova (TAREFA_INTERNA).
- "CLIENTE_UPDATE": o objeto é CORRIGIR/ATUALIZAR um dado de cadastro de cliente que já existe (telefone, e-mail, endereço, nascimento, status). Ex.: "o telefone da Marina mudou, é 71 9...", "corrige o endereço do Adalberto". Distinto de criar a ficha (CADASTRO).
- "AGENDA_CONSULTA": o objeto é CONSULTAR a agenda/compromissos (sem alterar nada). Ex.: "o que tenho na agenda amanhã?", "quais meus atendimentos de hoje?", "minha agenda da semana".
- "AGENDA_UPDATE": o objeto é REAGENDAR/REMARCAR ou CANCELAR um atendimento de cliente que JÁ existe. Ex.: "reagenda o atendimento do Adalberto para sexta 9h", "cancela o atendimento da Marina".
- "AUDIENCIA": o objeto é uma AUDIÊNCIA judicial de um processo — marcar ou consultar. Ex.: "marca a audiência do processo do Adalberto para 12/08 às 10h", "quais audiências dessa semana?". Distinto de reunião/atendimento de cliente (AGENDA_CLIENTE).
- "RELACAO_BANCARIA": o objeto é o VÍNCULO BANCÁRIO de um cliente — onde ele RECEBE o benefício, que produto tem com um banco (consignado, cartão consignado, empréstimo, seguro, conta), se reconhece o contrato, e se o escritório já tem o EXTRATO/CONTRATO em posse. Ex.: "a dona Antonieta recebe no Agibank e tem consignado com o Agibank", "ele recebe no Bradesco", "já temos o extrato do Bradesco de 2025", "o cliente trouxe o contrato", "ele não reconhece esse empréstimo do BMG". É dado BANCÁRIO do cliente — não confundir com abrir processo (PROCESSO_CREATE) nem com cadastro/contato (CLIENTE_UPDATE).
- "CAMPANHA": o objeto é uma CAMPANHA de ligação — criar uma fila de clientes por filtro para a recepção ligar. Ex.: "cria uma campanha para ligar para todos os clientes que recebem no Bradesco, para pedir o extrato", "quero ligar para quem tem consignado com o Agibank", "monta uma fila dos clientes bronze para converter". É a CRIAÇÃO da fila — não é registrar uma ligação já feita (LIGACAO) nem pedir números (KPI_LIGACOES).
- "LIGACAO": o objeto é o RESULTADO de uma ligação JÁ FEITA a um cliente. Ex.: "liguei para a dona Maria, não atendeu", "falei com o Sr. João, pediu retorno amanhã às 10", "número errado da Antonieta", "ela recusou", "caiu na caixa postal". É o registro do que aconteceu na chamada.
- "KPI_LIGACOES": o objeto são os NÚMEROS das ligações/campanhas. Ex.: "quantas ligações fizemos hoje?", "como está a campanha do Bradesco?", "produtividade da recepção esta semana", "quantas a Kailane fez?". É leitura de indicador — não registra nada.
- "AUDIO_AUTORIZACAO": o objeto é um ÁUDIO em que o CLIENTE AUTORIZA o escritório a agir, para guardar no dossiê com a transcrição. Ex.: "esse áudio é a autorização da dona Maria", "anexa a gravação da autorização do Ivan", "segue o áudio dele autorizando". Distinto de anexar um documento comum (OUTRO/anexar_documento_cliente) e de uma mensagem de voz que é só um comando ao sistema.
- "CREDENCIAL_GOV": o objeto é a CREDENCIAL do GOV.BR/INSS de um CLIENTE — senha, login, nível da conta (ouro/prata/bronze), 2 fatores. Ex.: "a senha do gov dele é X", "guarda a senha do INSS da Maria: X", "senha do gov: X, conta bronze", "a senha dele não funciona mais", "anota que a conta dela é prata". ATENÇÃO: é a senha DO CLIENTE para acessar o GOV.BR — não confundir com dados de contato do cadastro (CLIENTE_UPDATE) nem com permissão de menu de colaborador (PERMISSAO_MENU). Se o pedido trouxer TAMBÉM dados de cadastro ("inclua o telefone X e a senha do gov Y"), o objeto é CREDENCIAL_GOV e o agente deve executar AS DUAS ações (atualizar o cadastro E guardar a credencial).
- "PERMISSAO_MENU": o objeto é o ACESSO de um COLABORADOR a um MENU/tela do sistema — conceder, revogar ou voltar ao padrão; ou listar essas permissões. Ex.: "dá acesso ao Kanban para a Kailane", "tira o menu de Configurações do João", "quais permissões de menu existem?".
- "RECLAMACAO_ADMIN": o objeto é uma RECLAMAÇÃO ADMINISTRATIVA nova, feita fora do Judiciário (Procon, Bacen, INSS, consumidor.gov, ouvidoria do banco, e-mail ao banco), com protocolo e prazos. Ex.: "registra reclamação no Bacen pra dona Abigail, tarifa indevida, protocolo BCB-123, prazo fatal 13/08", "abri um Procon pro Ivan", "mandei e-mail pra ouvidoria do BMG sobre o desconto". É o REGISTRO da reclamação — não é processo judicial (PROCESSO_CREATE) nem tarefa interna (TAREFA_INTERNA).
- "RECLAMACAO_RESPOSTA": o objeto é a RESPOSTA/DESFECHO de uma reclamação administrativa que JÁ existe. Ex.: "o Bacen negou a reclamação da Abigail", "o Procon atendeu", "deu o prazo e o banco não respondeu nada". Negada ou sem resposta serve de prova do interesse de agir.
- "RECLAMACAO_CONSULTA": o objeto é a LISTA de reclamações administrativas. Ex.: "quais reclamações vencem essa semana?", "que reclamações a dona Abigail tem?", "tem alguma reclamação sem resposta?". É leitura — não registra nada.
- "EXECUCAO_INICIAR": o objeto é COMEÇAR o acompanhamento da EXECUÇÃO de um processo (réu, responsável, valor). Ex.: "abre o acompanhamento da execução do processo X, réu Sindicato dos Rurais, quem toca é a Daiane", "começa a execução do processo Y no valor de 12 mil".
- "EXECUCAO_FASE": o objeto é a FASE de uma execução que já está em acompanhamento — mover para frente. Ex.: "o réu pagou no processo X", "pedimos penhora", "entrou o Sisbajud", "saiu o alvará", "penhora deu negativa", "encerra a execução do processo Y".
- "EXECUCAO_CONSULTA": o objeto é a LISTA de execuções. Ex.: "quais execuções estão em penhora?", "as execuções da Daiane", "como está a execução do processo X". É leitura.
- "EXECUCAO_REVISAO": o objeto é o LEMBRETE de revisar uma execução — reabrir o prazo de olhar de novo. Ex.: "olhei a execução do processo X, volta em 10 dias", "me lembra dessa execução a cada 15 dias", "revisa isso semana que vem". É o re-agendamento da revisão, não a mudança de fase (EXECUCAO_FASE).
- "EVENTO_PROCESSUAL": o objeto é um EVENTO do processo que DISPARA PRAZOS automáticos — sentença procedente (prazos de embargos e recurso) ou execução ajuizada/protocolada (prazo de pagamento). Ex.: "saiu sentença procedente no processo X", "ganhamos o processo do Adalberto", "protocolei a execução do processo Y". ATENÇÃO: aqui o objeto é o EVENTO que gera os prazos — não é registrar andamento genérico (PROCESSO_UPDATE) nem protocolar peça (PROTOCOLO).
- "FILA_GOV": o objeto é a FILA DE TRABALHO das contas gov.br — listar clientes por estado da credencial. Ex.: "quais clientes são bronze?", "quem está com senha inválida?", "quem tem 2FA?", "de quem a gente não tem senha?". É leitura e NUNCA revela senha.
- "CREDENCIAL_GOV_STATUS": o objeto é a SITUAÇÃO do acesso gov.br de um cliente, sem informar senha nova. Ex.: "a senha da dona Elza está errada", "a conta do Ivan foi bloqueada", "consegui entrar na conta dela, tá valendo". Distinto de CREDENCIAL_GOV, que é quando o usuário INFORMA a senha para guardar no cofre.
- "CONVERSAO_GOV": o objeto é a CONVERSÃO da conta gov.br de um cliente (bronze precisa vir presencialmente para reconhecimento facial). Ex.: "a dona Maria é bronze, precisa vir converter", "agenda a conversão da conta do Ivan até dia 15".
- "DILIGENCIA_REGISTRAR": o objeto é uma DILIGÊNCIA a ser feita num processo — balcão virtual, colocar concluso para análise, diligenciar expedição de alvará, juntar petição, carta precatória. Ex.: "faz um balcão virtual no processo X pedindo agilidade na análise, prazo 24/07", "coloca concluso o processo do Fulano", "precisa diligenciar o alvará do processo Y", "junta essa petição no processo Z". É a TAREFA JUNTO AO JUÍZO/CARTÓRIO — distinta de tarefa interna do escritório (TAREFA_INTERNA), de andamento genérico (PROCESSO_UPDATE) e de protocolar a peça (PROTOCOLO).
- "DILIGENCIA_CUMPRIR": o objeto é o CUMPRIMENTO de uma diligência que já estava registrada. Ex.: "fiz o balcão virtual do processo X, protocolo 123", "já coloquei concluso", "a diligência do alvará foi feita, o cartório mandou aguardar", "fiz a diligência e preciso diligenciar de novo dia 20". ATENÇÃO: o protocolo NÃO é obrigatório — "fiz a diligência" sem número continua sendo DILIGENCIA_CUMPRIR.
- "DILIGENCIA_CONSULTA": o objeto é a LISTA de diligências. Ex.: "quais diligências estão pendentes?", "que diligências vencem essa semana?", "as diligências da 10ª Vara", "tem diligência atrasada?". É leitura.
- "AUDIENCIA_PREPARO": o objeto é o PREPARO de uma audiência já marcada — o que falta para ela (documentos, lembretes, local/link). Ex.: "o que falta para a audiência do cliente X?", "prepara a audiência de amanhã", "quais documentos a audiência do Fulano exige?". É leitura de parecer — distinta de MARCAR/consultar a audiência na agenda (AUDIENCIA).
- "LEMBRETE_AUDIENCIA": o objeto é a LIGAÇÃO DE LEMBRETE da audiência ao cliente. Ex.: "avisei a dona Fulana da audiência", "liguei pra lembrar da audiência e não atendeu", "cancela o lembrete daquela audiência", "confirmei com o cliente a audiência de quinta". É o resultado do aviso — não é registrar uma ligação comum (LIGACAO) nem remarcar a audiência (AUDIENCIA).
- "APOLICE_REGISTRAR": o objeto é uma APÓLICE DE SEGURO do cliente — seguradora, produto (prestamista, vida, capitalização), número, prêmio descontado, onde aparece o desconto, e se o cliente RECONHECE ter contratado. Ex.: "a dona Fulana tem um prestamista da SEGURADORA EXEMPLO descontando 43,90 por mês no extrato do INSS e ela não reconhece", "esse cliente tem 3 seguros que ele nunca contratou", "anota a apólice da vida dele". Distinta do vínculo bancário (RELACAO_BANCARIA): aqui o objeto é o SEGURO/APÓLICE, com seguradora e prêmio.
- "APOLICE_UPDATE": o objeto é uma apólice JÁ registrada: o cliente confirmou/negou depois da ligação, a apólice foi cancelada, houve restituição. Ex.: "a dona Fulana confirmou que contratou aquele seguro", "aquela apólice foi cancelada em 12/07 e restituíram 430 reais", "ele nega essa apólice, corrige lá".
- "APOLICE_CONSULTA": o objeto é a LISTA de apólices. Ex.: "quais seguros a dona Fulana tem?", "quais apólices os clientes não reconhecem?", "quanto de prêmio mensal a gente tem mapeado?", "as apólices da SEGURADORA EXEMPLO". É leitura.
- "PROCURACAO_REGISTRAR": o objeto é a PROCURAÇÃO de um cliente, com a data em que foi ASSINADA e a validade. Ex.: "a procuração da dona Fulana foi assinada em 03/03, ad judicia", "anexei a procuração nova do Fulano, assinada ontem, validade 24 meses", "registra a procuração dele". ATENÇÃO: é o REGISTRO DA VIGÊNCIA de uma procuração assinada — não é GERAR os documentos do cliente (KIT_DOCUMENTAL, que produz a minuta para assinar) nem redigir peça (OUTRO).
- "PROCURACAO_CONSULTA": o objeto é a LISTA de procurações e seus vencimentos. Ex.: "quais procurações vencem esse mês?", "a procuração da dona Fulana está vigente?", "quem está com procuração vencida?", "quais procurações não têm PDF no dossiê?". É leitura.
- "CAMPANHA_PROCURACAO": o objeto é a CAMPANHA de ligação para RENOVAR PROCURAÇÃO — montar a fila de quem tem procuração vencendo. Ex.: "monta a campanha de renovação de procuração", "quero ligar para todos que têm procuração vencendo esse mês", "cria a fila de renovação de procuração dos próximos 60 dias". É a campanha ESPECÍFICA de procuração (fila montada pelo vencimento), distinta da campanha por filtro bancário/cadastral (CAMPANHA).
- "EXTRATO_DECISAO": o objeto é a DECISÃO sobre um LANÇAMENTO da análise de extrato — confirmar ou rejeitar um desconto/lançamento que o sistema listou. Ex.: "confirma esse lançamento do extrato", "rejeita o desconto de 43,90 da análise", "esses lançamentos do extrato estão certos, confirma". É decidir sobre item de extrato JÁ analisado — não é registrar vínculo bancário (RELACAO_BANCARIA) nem apólice (APOLICE_REGISTRAR).
- "MATRIZ_DOCUMENTOS": o objeto é a MATRIZ DE DOCUMENTOS das teses (a tabela que diz quais documentos cada tipo de ação exige) — importar/substituir esse de-para em lote. Ex.: "importa a matriz de documentos das teses", "sobe a lista de documentos por tese", "substitui a matriz documental". É configuração do catálogo — não é pedir documentos de um cliente (OUTRO) nem gerar o kit (KIT_DOCUMENTAL).
- "DOCUMENTOS_OBRIGATORIOS": o objeto é a LISTA DE DOCUMENTOS que uma tese exige — o que pedir ao cliente, o que falta no dossiê. Ex.: "o que preciso pedir pro cliente na tese de RMC?", "o que falta de documento do Fulano?", "quais documentos a tese de fraude bancária exige?", "que papelada preciso pra SUSEP?". ATENÇÃO CRÍTICA: isto NÃO é pedido de peça. Perguntar o que pedir ao cliente é CONSULTA à matriz documental — não responda pedindo fatos, valores, réu ou objeto da peça. É o erro medido em 04/08: "o que preciso pedir pro cliente na tese de RMC?" virou questionário de petição.
- "OUTRO": qualquer outra coisa — REDIGIR peça/documento jurídico sob medida ("redija a contestação", "elabore a inicial"), DISTRIBUIR um caso a um advogado/setor, consulta a dados fora dos casos acima, conversa, ou quando você não tiver certeza. Na dúvida, responda OUTRO. NÃO use OUTRO só porque a frase menciona "peça"/"petição": veja o VERBO — protocolar → PROTOCOLO; gerar documentos do cliente → KIT_DOCUMENTAL; redigir → OUTRO.

Separe também os pares do P2: a diligência junto ao juízo (DILIGENCIA_*) · o preparo e o lembrete da audiência (AUDIENCIA_PREPARO/LEMBRETE_AUDIENCIA) · a apólice de seguro (APOLICE_*) · a procuração assinada e sua renovação (PROCURACAO_*/CAMPANHA_PROCURACAO).

Regra de ouro: o verbo NUNCA decide; o OBJETO decide. Separe: o cliente (CADASTRO/CLIENTE_UPDATE) · o atendimento do cliente (AGENDA_CLIENTE/AGENDA_UPDATE/AGENDA_CONSULTA) · a tarefa/pendência interna (TAREFA_INTERNA/TAREFA_UPDATE) · o processo (PROCESSO_CREATE/PROCESSO_UPDATE) · os documentos padrão do cliente (KIT_DOCUMENTAL) · a audiência (AUDIENCIA) · o protocolo (PROTOCOLO) · o dia do usuário (RESUMO_DIA) · o acesso a menu (PERMISSAO_MENU). Redigir peça sob medida e distribuir caso = OUTRO.`;

/** Parsing defensivo do resultado do classificador de objeto (LLM). */
export function normalizeRouteObject(raw: unknown): RouteObject {
  const s = String(raw ?? "").trim().toUpperCase();
  if (s === "CADASTRO") return "CADASTRO";
  if (s === "AGENDA_CLIENTE" || s === "AGENDA") return "AGENDA_CLIENTE";
  if (s === "TAREFA_INTERNA" || s === "TAREFA") return "TAREFA_INTERNA";
  // B1: objetos das Ondas 1-3 (+ sinônimos tolerados do LLM).
  if (s === "PROCESSO_CREATE" || s === "PROCESSO" || s === "PROCESSO_NOVO") return "PROCESSO_CREATE";
  if (s === "PROCESSO_UPDATE" || s === "ANDAMENTO") return "PROCESSO_UPDATE";
  if (s === "KIT_DOCUMENTAL" || s === "KIT" || s === "DOCUMENTOS") return "KIT_DOCUMENTAL";
  if (s === "RESUMO_DIA" || s === "RESUMO") return "RESUMO_DIA";
  if (s === "PROTOCOLO") return "PROTOCOLO";
  if (s === "TAREFA_UPDATE") return "TAREFA_UPDATE";
  if (s === "CLIENTE_UPDATE") return "CLIENTE_UPDATE";
  if (s === "AGENDA_CONSULTA") return "AGENDA_CONSULTA";
  if (s === "AGENDA_UPDATE") return "AGENDA_UPDATE";
  if (s === "AUDIENCIA" || s === "AUDIÊNCIA") return "AUDIENCIA";
  if (s === "PERMISSAO_MENU" || s === "PERMISSAO" || s === "MENU") return "PERMISSAO_MENU";
  if (s === "CREDENCIAL_GOV" || s === "CREDENCIAL" || s === "SENHA_GOV") return "CREDENCIAL_GOV";
  // Motor 1 (Cards 3/4/5) + sinônimos tolerados do LLM.
  if (s === "RELACAO_BANCARIA" || s === "RELACAO" || s === "BANCO") return "RELACAO_BANCARIA";
  // CAMPANHA_LIGACAO é o nome usado na documentação de 29/07; mesmo objeto.
  if (s === "CAMPANHA" || s === "CAMPANHA_LIGACAO" || s === "CAMPANHA_DE_LIGACAO") return "CAMPANHA";
  if (s === "LIGACAO" || s === "LIGAÇÃO" || s === "CHAMADA") return "LIGACAO";
  if (s === "KPI_LIGACOES" || s === "KPI" || s === "PRODUTIVIDADE") return "KPI_LIGACOES";
  if (s === "AUDIO_AUTORIZACAO" || s === "AUDIO" || s === "AUTORIZACAO") return "AUDIO_AUTORIZACAO";
  // Motores 2 e 3 (Cards 6/7/8/9/10) + sinônimos tolerados do LLM.
  if (s === "RECLAMACAO_ADMIN" || s === "RECLAMACAO" || s === "RECLAMAÇÃO"
      || s === "RECLAMACAO_ADMINISTRATIVA") return "RECLAMACAO_ADMIN";
  if (s === "RECLAMACAO_RESPOSTA" || s === "RESPOSTA_RECLAMACAO"
      || s === "DESFECHO_RECLAMACAO") return "RECLAMACAO_RESPOSTA";
  if (s === "RECLAMACAO_CONSULTA" || s === "CONSULTA_RECLAMACAO"
      || s === "RECLAMACOES") return "RECLAMACAO_CONSULTA";
  if (s === "EXECUCAO_INICIAR" || s === "EXECUCAO" || s === "EXECUÇÃO"
      || s === "INICIAR_EXECUCAO") return "EXECUCAO_INICIAR";
  if (s === "EXECUCAO_FASE" || s === "FASE_EXECUCAO" || s === "FASE") return "EXECUCAO_FASE";
  if (s === "EXECUCAO_CONSULTA" || s === "CONSULTA_EXECUCAO"
      || s === "EXECUCOES") return "EXECUCAO_CONSULTA";
  if (s === "EXECUCAO_REVISAO" || s === "REVISAO_EXECUCAO"
      || s === "TICKLER") return "EXECUCAO_REVISAO";
  if (s === "EVENTO_PROCESSUAL" || s === "EVENTO" || s === "SENTENCA"
      || s === "SENTENÇA") return "EVENTO_PROCESSUAL";
  if (s === "FILA_GOV" || s === "FILA_CREDENCIAIS" || s === "FILA_CREDENCIAIS_GOV") return "FILA_GOV";
  if (s === "CREDENCIAL_GOV_STATUS" || s === "STATUS_CREDENCIAL"
      || s === "STATUS_GOV") return "CREDENCIAL_GOV_STATUS";
  if (s === "CONVERSAO_GOV" || s === "CONVERSAO" || s === "CONVERSÃO") return "CONVERSAO_GOV";
  if (s === "DOCUMENTOS_OBRIGATORIOS" || s === "DOCUMENTOS_TESE" || s === "MATRIZ_DOCUMENTOS_CONSULTA"
      || s === "CHECKLIST_TESE") return "DOCUMENTOS_OBRIGATORIOS";
  // P2 (Cards 11/13/14/15) + sinônimos tolerados do LLM. ATENÇÃO à ORDEM: os
  // pares registrar/cumprir/consultar têm prefixo comum, então o valor genérico
  // ("DILIGENCIA", "APOLICE", "PROCURACAO") cai no REGISTRO, que é a ação mais
  // comum — e o plural cai na CONSULTA.
  if (s === "DILIGENCIA_CUMPRIR" || s === "CUMPRIR_DILIGENCIA"
      || s === "DILIGENCIA_CUMPRIDA") return "DILIGENCIA_CUMPRIR";
  if (s === "DILIGENCIA_CONSULTA" || s === "CONSULTA_DILIGENCIA"
      || s === "DILIGENCIAS" || s === "DILIGÊNCIAS") return "DILIGENCIA_CONSULTA";
  if (s === "DILIGENCIA_REGISTRAR" || s === "DILIGENCIA" || s === "DILIGÊNCIA"
      || s === "REGISTRAR_DILIGENCIA") return "DILIGENCIA_REGISTRAR";
  if (s === "AUDIENCIA_PREPARO" || s === "PREPARO_AUDIENCIA"
      || s === "PREPARAR_AUDIENCIA") return "AUDIENCIA_PREPARO";
  if (s === "LEMBRETE_AUDIENCIA" || s === "LEMBRETE"
      || s === "AVISO_AUDIENCIA") return "LEMBRETE_AUDIENCIA";
  if (s === "APOLICE_UPDATE" || s === "ATUALIZAR_APOLICE") return "APOLICE_UPDATE";
  if (s === "APOLICE_CONSULTA" || s === "CONSULTA_APOLICE"
      || s === "APOLICES" || s === "APÓLICES") return "APOLICE_CONSULTA";
  if (s === "APOLICE_REGISTRAR" || s === "APOLICE" || s === "APÓLICE"
      || s === "SEGURO" || s === "SUSEP") return "APOLICE_REGISTRAR";
  // A campanha de procuração vem ANTES do par registrar/consultar: "CAMPANHA_
  // PROCURACAO" contém "PROCURACAO" e não pode ser lida como registro.
  if (s === "CAMPANHA_PROCURACAO" || s === "CAMPANHA_RENOVACAO"
      || s === "CAMPANHA_RENOVACAO_PROCURACAO"
      || s === "RENOVACAO_PROCURACAO") return "CAMPANHA_PROCURACAO";
  if (s === "PROCURACAO_CONSULTA" || s === "CONSULTA_PROCURACAO"
      || s === "PROCURACOES" || s === "PROCURAÇÕES") return "PROCURACAO_CONSULTA";
  if (s === "PROCURACAO_REGISTRAR" || s === "PROCURACAO" || s === "PROCURAÇÃO"
      || s === "REGISTRAR_PROCURACAO") return "PROCURACAO_REGISTRAR";
  // A.6: objetos sem tool no chat — existem para a recusa sair pela REGRA DE PAPEL.
  if (s === "EXTRATO_DECISAO" || s === "LANCAMENTO_EXTRATO"
      || s === "DECIDIR_LANCAMENTO_EXTRATO") return "EXTRATO_DECISAO";
  if (s === "MATRIZ_DOCUMENTOS" || s === "MATRIZ" || s === "MATRIZ_DOCUMENTAL"
      || s === "IMPORTAR_MATRIZ_DOCUMENTOS") return "MATRIZ_DOCUMENTOS";
  return "OUTRO";
}

// ─── B1: HINT das ações das Ondas 1-3 ────────────────────────────────────────
// O classificador de OBJETO só era chamado quando um dos 3 hints antigos casava
// (cadastro/agenda/tarefa). Sem hint, as frases das ondas nunca chegavam nele.
// Este detector é um GATILHO amplo (não decide nada — só libera a classificação
// pelo LLM, mantendo o LLM-first): substantivo do domínio das ondas presente na
// frase. Barato e conservador; classificar de novo em falso positivo devolve
// OUTRO e o fluxo segue exatamente como antes.
// ATENÇÃO: `\b` do JS é ASCII-only — depois de letra acentuada ("dá", "você") NÃO
// existe fronteira, então `\b(d[áa])\b` nunca casa "dá acesso ao Kanban". Usamos
// lookarounds que tratam acento como letra (À-ÿ) nas duas pontas.
// "senha/gov/inss/conta bronze" entram como ALVO: a credencial do GOV.BR do cliente
// é objeto próprio (CREDENCIAL_GOV) desde o pacote de 27/07.
const ONDA_ALVO_RE =
  /(?<![\wÀ-ÿ])(processos?|a[çc][ãa]o judicial|kit|documenta[çc][ãa]o do cliente|documentos? d[oae]|procura[çc][ãa]o|contrato de honor[áa]rios|hipossufici[êe]ncia|ficha cadastral|protocol[\wÀ-ÿ]*|resumo (do )?(meu )?dia|meu dia|minha semana|hoje|semana|situa[çc][ãa]o|compromissos?|audi[êe]ncias?|andamento|permiss[ãa]o|permiss[õo]es|menu|acesso ao|kanban|card|coment[\wÀ-ÿ]*|agenda|atendimentos?|pend[êe]ncias?|pend[êe]nte|tarefas?|senhas?|gov|gov\.?br|inss|credencial|conta (ouro|prata|bronze)|ouro|prata|bronze|2 fatores|dois fatores)(?![\wÀ-ÿ])/i;
// Verbos/formas que indicam PEDIDO operacional (não narrativa solta).
// "cadastr\w*" entra porque "cadastre uma PENDÊNCIA…" é pedido de tarefa (o objeto
// é a pendência, não o cliente) — foi um dos misroutes do E2E.
// "como está meu dia", "o que eu tenho pra hoje", "minha situação hoje" não tinham
// verbo nesta lista — por isso nem chegavam ao classificador de objeto (B1 do
// reteste 27/07). Formas de ESTADO (como/está/tenho/tem/anda) entram aqui.
const ONDA_VERBO_RE =
  /(?<![\wÀ-ÿ])(abr[\wÀ-ÿ]*|cri[\wÀ-ÿ]*|cadastr[\wÀ-ÿ]*|adicion[\wÀ-ÿ]*|inclu[\wÀ-ÿ]*|ger[\wÀ-ÿ]*|emit[\wÀ-ÿ]*|prepar[\wÀ-ÿ]*|refa[çz][\wÀ-ÿ]*|registr[\wÀ-ÿ]*|anot[\wÀ-ÿ]*|atualiz[\wÀ-ÿ]*|mud[\wÀ-ÿ]*|mov[\wÀ-ÿ]*|pass[\wÀ-ÿ]*|conclu[\wÀ-ÿ]*|protocol[\wÀ-ÿ]*|marc[\wÀ-ÿ]*|reagend[\wÀ-ÿ]*|remarc[\wÀ-ÿ]*|cancel[\wÀ-ÿ]*|coment[\wÀ-ÿ]*|conced[\wÀ-ÿ]*|d[êé]|d[áa]|libere?|tir[\wÀ-ÿ]*|revog[\wÀ-ÿ]*|list[\wÀ-ÿ]*|mostr[\wÀ-ÿ]*|quais|qual|o que|resum[\wÀ-ÿ]*|corrig[\wÀ-ÿ]*|como|est[áa]|t[êe]m|tenho|anda|minha|meu)(?![\wÀ-ÿ])/i;

// ─── A6.3 (reteste v170): aceitar a oferta "quer que eu atualize esse processo?" ──
// O aviso de duplicata oferece atualizar o processo existente. Respondendo "sim,
// atualiza", o orquestrador PERDIA o contexto e reperguntava qual processo era.
// Este detector reconhece a ACEITAÇÃO curta; o process_id vem do metadata da
// própria oferta (offered_process_id), não de nova resolução.
const ACEITE_RE =
  /(?<![\wÀ-ÿ])(sim|isso|isso mesmo|claro|pode|pode ser|por favor|beleza|ok|okay|atualiz\w*|prefiro atualizar|melhor atualizar|vamos atualizar|registra\w*|registre)(?![\wÀ-ÿ])/i;
// Nega explícita: não confundir "não, abre outro" com aceite.
const RECUSA_RE = /(?<![\wÀ-ÿ])(n[ãa]o|nao|outro|novo processo|abre mesmo|abra mesmo|mesmo assim|insisto)(?![\wÀ-ÿ])/i;

export function isAceiteAtualizarProcesso(message: string): boolean {
  const m = (message || "").trim();
  if (!m) return false;
  if (m.length > 160) return false;      // resposta longa = novo pedido, não aceite
  if (RECUSA_RE.test(m)) return false;   // "não, abre outro" → segue como novo
  return ACEITE_RE.test(m);
}

/**
 * Reteste 3 (item 2): RECUSA da oferta = override explícito do pré-voo ("não, abre
 * outro", "é outro contrato, abre mesmo assim"). É legítimo — dois contratos com o
 * mesmo banco existem na prática. O contexto (cliente/tipo/réu) vem do metadata da
 * oferta, então o usuário não precisa repetir nada.
 */
export function isRecusaAbrirOutro(message: string): boolean {
  const m = (message || "").trim();
  if (!m) return false;
  if (m.length > 160) return false;
  return RECUSA_RE.test(m);
}

// CREDENCIAL do GOV.BR: frases como "a senha dele é X", "senha do gov: X" não têm
// verbo de ação — o verbo é o próprio "é"/":" . Não dá para colocar "é" no
// ONDA_VERBO_RE genérico (qualquer "o processo é importante" passaria a acionar o
// classificador), então este padrão é reconhecido à parte, exigindo a palavra
// senha/credencial perto de gov/inss OU de uma atribuição de valor.
const CREDENCIAL_RE =
  /(?<![\wÀ-ÿ])(senhas?|credencial)(?![\wÀ-ÿ])[\s\S]{0,40}?((?<![\wÀ-ÿ])(gov|gov\.?br|inss)(?![\wÀ-ÿ])|[:=]|(?<![\wÀ-ÿ])[ée](?![\wÀ-ÿ]))/i;
const CREDENCIAL_GOV_RE =
  /(?<![\wÀ-ÿ])(gov|gov\.?br|inss)(?![\wÀ-ÿ])[\s\S]{0,40}?(?<![\wÀ-ÿ])(senhas?|credencial|conta)(?![\wÀ-ÿ])/i;
// Nível da conta GOV informado sem citar "senha"/"gov": "a conta dela é bronze",
// "nível ouro", "perfil prata".
const NIVEL_CONTA_RE =
  /(?<![\wÀ-ÿ])(conta|perfil|n[íi]vel)(?![\wÀ-ÿ])[\s\S]{0,25}?(?<![\wÀ-ÿ])(ouro|prata|bronze)(?![\wÀ-ÿ])/i;

// ─── Motor 1 (Cards 3/4/5): banco, campanha, ligação, KPI, áudio ─────────────
// Padrões próprios porque estas frases também não têm verbo de ação claro:
// "ele recebe no Bradesco", "liguei para a dona Maria, não atendeu".
const RELACAO_BANCARIA_RE =
  /(?<![\wÀ-ÿ])(receb\w*\s+(n?[oa]s?\s+)?(banco|bradesco|agibank|itau|ita[úu]|bmg|caixa|santander|mercantil|crefisa|facta|inbursa|brb|banco do brasil|pan|c6|daycoval|safra|ol[ée])|consignad\w*|cart[ãa]o consignado|empr[ée]stimo pessoal|extrato d[oe]|contrato d[oe]|banco pagador|onde receb\w*)(?![\wÀ-ÿ])/i;
// ATENÇÃO: `\w` é ASCII, então `liga\w*` casa só "liga" e o lookahead (?![\wÀ-ÿ])
// REJEITA por causa do "ç" de "ligação". Em cauda de palavra pt-BR use [\wÀ-ÿ]*.
const CAMPANHA_RE =
  /(?<![\wÀ-ÿ])(campanha|fila de liga[\wÀ-ÿ]*|mutir[ãa]o|(?:quero|vamos|precisamos)\s+ligar\s+para|ligar\s+para\s+(?:todos|quem|os clientes))(?![\wÀ-ÿ])/i;
const LIGACAO_RE =
  /(?<![\wÀ-ÿ])(liguei|ligamos|falei com|atendeu|n[ãa]o atendeu|caixa postal|n[úu]mero errado|pediu (?:para )?retorn\w*|ligar depois|recusou)(?![\wÀ-ÿ])/i;
const KPI_LIGACOES_RE =
  /(?<![\wÀ-ÿ])(quantas liga[\wÀ-ÿ]*|liga[\wÀ-ÿ]*\s+(?:de |feitas|hoje)|produtividade|como (?:est[áa]|vai) a campanha|desempenho da recep[\wÀ-ÿ]*)(?![\wÀ-ÿ])/i;
const AUDIO_AUTORIZACAO_RE =
  /(?<![\wÀ-ÿ])(([áa]udio|grava[çc][ãa]o|gravou|gravei)[\s\S]{0,40}?(autoriza[\wÀ-ÿ]*|anu[êe]nci[\wÀ-ÿ]*|consent[\wÀ-ÿ]*)|(autoriza[\wÀ-ÿ]*|anu[êe]nci[\wÀ-ÿ]*)[\s\S]{0,40}?([áa]udio|grava[çc][ãa]o))(?![\wÀ-ÿ])/i;

// ─── Motores 2 e 3 (Cards 6/7/8/9/10) ────────────────────────────────────────
// Mesma razão dos padrões acima: "o réu pagou", "saiu sentença procedente" e
// "quais clientes são bronze?" não têm verbo de ação da lista genérica.
// Cauda de palavra SEMPRE [\wÀ-ÿ]* — `\w` é ASCII e reprovaria "execução",
// "penhora negativa"/"reclamação" no lookahead.
const RECLAMACAO_RE =
  /(?<![\wÀ-ÿ])(reclama[\wÀ-ÿ]*|procon|bacen|consumidor\.?gov|ouvidoria|protocolo\s+(?:bcb|pc)[\s-]?\d)(?![\wÀ-ÿ])/i;
const EXECUCAO_RE =
  /(?<![\wÀ-ÿ])(execu[\wÀ-ÿ]*|penhora[\wÀ-ÿ]*|sisbajud|alvar[áa][\wÀ-ÿ]*|dep[óo]sito judicial|redirecionamento|r[ée]u\s+(?:pagou|n[ãa]o pagou)|expedi[çc][\wÀ-ÿ]*\s+de\s+alvar[áa])(?![\wÀ-ÿ])/i;
const EVENTO_PROCESSUAL_RE =
  /(?<![\wÀ-ÿ])(senten[çc][\wÀ-ÿ]*\s+procedent[\wÀ-ÿ]*|procedent[\wÀ-ÿ]*|ganhamos|prazo\s+(?:de\s+)?(?:embargos|recurso|pagamento))(?![\wÀ-ÿ])/i;
const FILA_GOV_RE =
  /(?<![\wÀ-ÿ])((?:quais|quem|quantos)[\s\S]{0,30}?(?:bronze|prata|ouro|2fa|dois fatores)|senha (?:inv[áa]lid[\wÀ-ÿ]*|errada|n[ãa]o funciona)|conta bloqueada|sem senha|sem credencial|convers[ãa]o d[ae] conta|converter a conta)(?![\wÀ-ÿ])/i;
const REVISAO_EXECUCAO_RE =
  /(?<![\wÀ-ÿ])((?:olhei|revisei|conferi|verifiquei)[\s\S]{0,40}?(?:volta|revis[\wÀ-ÿ]*|de novo|daqui)|me lembr[\wÀ-ÿ]*\s+(?:disso|dessa|desse)[\s\S]{0,20}?dias|a cada \d+ dias)(?![\wÀ-ÿ])/i;

// ─── P2 (Cards 11/13/14/15) ──────────────────────────────────────────────────
// Mesma razão dos padrões acima: "faz um balcão virtual no processo X" e "a
// procuração dela foi assinada em 03/03" não têm verbo da lista genérica ("faz",
// "assinada" e "foi" não estão em ONDA_VERBO_RE), então sem padrão próprio o
// classificador de objeto NEM É CHAMADO e o pedido cai no fluxo genérico.
// GOTCHA pt-BR: `\w` é ASCII, então `dilig\w*` casa só "dilig" e o lookahead
// (?![\wÀ-ÿ]) REJEITA por causa do "ê" de "diligência" — o mesmo vale para
// "procuração" (ç) e "apólice" (ó). Cauda de palavra SEMPRE [\wÀ-ÿ]*.
const DILIGENCIA_RE =
  /(?<![\wÀ-ÿ])(dilig[\wÀ-ÿ]*|rediligenc[\wÀ-ÿ]*|balc[ãa]o virtual|conclus[oa][\wÀ-ÿ]*|carta precat[\wÀ-ÿ]*|junt[\wÀ-ÿ]*[\s\S]{0,20}?peti[\wÀ-ÿ]*|expedi[çc][\wÀ-ÿ]*\s+de\s+alvar[áa][\wÀ-ÿ]*)(?![\wÀ-ÿ])/i;
const APOLICE_RE =
  /(?<![\wÀ-ÿ])(ap[óo]lice[\wÀ-ÿ]*|seguradora[\wÀ-ÿ]*|prestamista[\wÀ-ÿ]*|susep|capitaliza[\wÀ-ÿ]*|pr[êe]mio[\wÀ-ÿ]*)(?![\wÀ-ÿ])/i;
// "seguro"/"seguros" SOZINHO não aciona: é adjetivo comum em pt-BR ("é seguro",
// "lugar seguro"). Exige vizinhança de contratação/desconto/reconhecimento, nas
// duas ordens ("tem 3 seguros que nunca contratou" / "nunca contratou esses seguros").
const SEGURO_QUALIFICADO_RE =
  /(?<![\wÀ-ÿ])(seguros?(?![\wÀ-ÿ])[\s\S]{0,50}?(?:contrat[\wÀ-ÿ]*|descont[\wÀ-ÿ]*|reconhec[\wÀ-ÿ]*|cancel[\wÀ-ÿ]*|restitu[\wÀ-ÿ]*|mensal[\wÀ-ÿ]*|seguradora[\wÀ-ÿ]*|vida)|(?:contrat[\wÀ-ÿ]*|descont[\wÀ-ÿ]*|reconhec[\wÀ-ÿ]*|cancel[\wÀ-ÿ]*|restitu[\wÀ-ÿ]*)[\s\S]{0,50}?seguros?)(?![\wÀ-ÿ])/i;
const PROCURACAO_RE =
  /(?<![\wÀ-ÿ])(procura[çc][\wÀ-ÿ]*|ad judicia[\wÀ-ÿ]*|renova[çc][\wÀ-ÿ]*\s+de\s+procura[\wÀ-ÿ]*)(?![\wÀ-ÿ])/i;
// Lembrete/preparo de audiência: a palavra "audiência" perto de avisar/lembrar/
// confirmar/faltar. "audiência" sozinha já é alvo em ONDA_ALVO_RE (com verbo).
const AUDIENCIA_P2_RE =
  /(?<![\wÀ-ÿ])((?:lembr[\wÀ-ÿ]*|avis[\wÀ-ÿ]*|confirm[\wÀ-ÿ]*|falt[\wÀ-ÿ]*|prepar[\wÀ-ÿ]*)[\s\S]{0,60}?audi[êe]nci[\wÀ-ÿ]*|audi[êe]nci[\wÀ-ÿ]*[\s\S]{0,60}?(?:lembr[\wÀ-ÿ]*|avis[\wÀ-ÿ]*|confirm[\wÀ-ÿ]*|falt[\wÀ-ÿ]*|documento[\wÀ-ÿ]*))(?![\wÀ-ÿ])/i;

// A.6: gatilhos dos dois objetos sem tool no chat. "extrato" sozinho NÃO aciona
// (ele já é alvo de RELACAO_BANCARIA: "já temos o extrato do banco X"), então
// exige-se a vizinhança de DECIDIR sobre lançamento/desconto da análise. A matriz
// exige "matriz" perto de documento/tese — "matriz" isolado é palavra comum.
// Cauda de palavra SEMPRE [\wÀ-ÿ]* (`\w` é ASCII e reprovaria "lançamento").
const EXTRATO_DECISAO_RE =
  /(?<![\wÀ-ÿ])((confirm[\wÀ-ÿ]*|rejeit[\wÀ-ÿ]*|recus[\wÀ-ÿ]*|valid[\wÀ-ÿ]*|aprov[\wÀ-ÿ]*)[\s\S]{0,60}?(lan[çc]amento[\wÀ-ÿ]*|an[áa]lise do extrato|descontos? do extrato)|(lan[çc]amento[\wÀ-ÿ]*|an[áa]lise do extrato)[\s\S]{0,60}?(confirm[\wÀ-ÿ]*|rejeit[\wÀ-ÿ]*|recus[\wÀ-ÿ]*))(?![\wÀ-ÿ])/i;
const MATRIZ_DOCUMENTOS_RE =
  /(?<![\wÀ-ÿ])matriz(?![\wÀ-ÿ])[\s\S]{0,40}?(?<![\wÀ-ÿ])(documento[\wÀ-ÿ]*|documental|tese[\wÀ-ÿ]*)(?![\wÀ-ÿ])/i;

// Card 12 / J-06 — "o que preciso pedir pro cliente". Sem este hint o classificador
// de objeto não é chamado e a frase cai no fluxo de PEÇA (medido em 04/08). Exige um
// VERBO de pedir/faltar perto de documento/papelada/tese, ou a menção explícita a
// documento de tese — "documento" solto continua indo para anexo/dossiê.
const DOCUMENTOS_OBRIGATORIOS_RE =
  /(?:(?:o que|que)\s+(?:preciso|precisa|devo|deve|tenho que|falta|falt[\wÀ-ÿ]*)[\s\S]{0,40}?(?:pedir|solicitar|juntar|documento[\wÀ-ÿ]*|papelada)|(?:pedir|solicitar)[\s\S]{0,25}?(?:pro|para o|ao)\s+cliente|(?:quais|que)\s+documento[\wÀ-ÿ]*[\s\S]{0,40}?(?:tese|a[çc][ãa]o|exige|precisa)|documento[\wÀ-ÿ]*\s+(?:obrigat[\wÀ-ÿ]*|da tese|do kit)|matriz\s+documental)/i;
export function isOndaAcaoRequest(message: string): boolean {
  const m = (message || "").trim();
  if (!m) return false;
  if (EXTRATO_DECISAO_RE.test(m) || MATRIZ_DOCUMENTOS_RE.test(m)) return true;
  if (CREDENCIAL_RE.test(m) || CREDENCIAL_GOV_RE.test(m) || NIVEL_CONTA_RE.test(m)) return true;
  if (RELACAO_BANCARIA_RE.test(m) || CAMPANHA_RE.test(m) || LIGACAO_RE.test(m)
      || KPI_LIGACOES_RE.test(m) || AUDIO_AUTORIZACAO_RE.test(m)) return true;
  if (DOCUMENTOS_OBRIGATORIOS_RE.test(m)) return true;
  if (RECLAMACAO_RE.test(m) || EXECUCAO_RE.test(m) || EVENTO_PROCESSUAL_RE.test(m)
      || FILA_GOV_RE.test(m) || REVISAO_EXECUCAO_RE.test(m)) return true;
  if (DILIGENCIA_RE.test(m) || APOLICE_RE.test(m) || SEGURO_QUALIFICADO_RE.test(m)
      || PROCURACAO_RE.test(m) || AUDIENCIA_P2_RE.test(m)) return true;
  return ONDA_ALVO_RE.test(m) && ONDA_VERBO_RE.test(m);
}

// Metadata de mensagem de ERRO transitório (ex.: provedor do modelo retornou 451
// "content policy", 5xx, timeout do watchdog). Um erro NÃO é um turno real do
// especialista: não pode "encerrar" uma coleta em andamento.
export function isErrorMeta(meta: unknown): boolean {
  if (!meta || typeof meta !== "object") return false;
  return (meta as { kind?: unknown }).kind === "error";
}

// Dada a lista de mensagens do assistente (MAIS RECENTE primeiro), acha o último
// turno SIGNIFICATIVO e diz se é uma coleta de ação ativa + qual especialista.
// Pula mensagens de erro transitório: se o LLM do especialista falhou (ex.: 451
// intermitente) e o usuário reenvia o dado, a coleta deve CONTINUAR com o mesmo
// especialista — sem a robustez, a bolha de erro virava o "último turno" e a
// resposta caía em TRIVIAL (o "Meu Assistente" sequestrava a conversa).
export function findActiveCollection(
  rows: Array<{ agent_id?: string | null; metadata?: unknown }>,
): { agentId: string } | null {
  for (const row of rows || []) {
    if (isErrorMeta(row?.metadata)) continue; // erro transitório: ignora e olha o anterior
    // Primeiro turno NÃO-erro define o estado atual: só continua a coleta se ele
    // for uma pergunta de coleta de ação; qualquer outro turno real encerra a busca.
    if (isAwaitingCollectionMeta(row?.metadata) && row?.agent_id) {
      return { agentId: String(row.agent_id) };
    }
    return null;
  }
  return null;
}

// A continuação de coleta (CHAT-COLETA-CONTINUIDADE) cria a run com
// chain[0].path === "continuacao_coleta" (ver index.ts, criação da contRun).
// Detectar esse caminho permite tratar o turno como parte de uma coleta em
// andamento: carregar o histórico COMPLETO (sem a janela deslizante que dropava
// os campos iniciais) e injetar o guardrail anti-reinício.
export function isCollectionContinuation(chain: unknown): boolean {
  const c = Array.isArray(chain) ? chain[0] : null;
  return !!c && typeof c === "object" && (c as { path?: unknown }).path === "continuacao_coleta";
}
