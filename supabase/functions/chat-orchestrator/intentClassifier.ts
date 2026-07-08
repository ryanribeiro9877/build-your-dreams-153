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
  Use TRIVIAL SOMENTE com ALTA CONFIANÇA.
- "CONSULTA": o usuário quer CONSULTAR/BUSCAR/VER (LEITURA) um dado JÁ CADASTRADO no
  sistema (dados de um CLIENTE, tarefas, processos, documentos anexados, ou
  colaboradores) — NÃO é pedir uma peça nova, NÃO é escrever/criar nada, nem small
  talk; é uma pergunta de LEITURA sobre o cadastro do escritório. Ex.: "consulte o CPF
  do cliente Fulano", "qual o telefone do cliente X", "busque o cliente Y", "quais
  tarefas do cliente Z", "que documentos o cliente W já enviou". Pedir um DADO de um
  cliente/registro existente é CONSULTA, não peça.
- "ACAO_COM_TOOL": pedido de AÇÃO OPERACIONAL de ESCRITA/EXECUÇÃO no sistema — NÃO é
  uma peça jurídica nem uma leitura: é uma operação que CRIA ou MODIFICA algo:
  cadastrar cliente, criar tarefa/card, solicitar documentos, pedir acesso a arquivos,
  criar/transferir/resolver pendência, agendar reunião. Mesmo que o usuário não forneça
  todos os dados, classifique como ACAO_COM_TOOL se a intenção é claramente uma dessas
  ações de escrita. Ex.: "quero cadastrar um cliente", "crie uma tarefa para fulano",
  "solicite os documentos do cooperado", "abra uma pendência", "Ryan Ribeiro CPF
  123.456.789-00 endereço rua X" (quando o contexto da conversa é um cadastro).
- "NEGOCIO_SEM_INSUMO": é uma demanda de PEÇA JURÍDICA (pedir petição, cálculo,
  análise, contestação etc.), MAS a mensagem NÃO traz informação textual suficiente
  para fundamentar a peça. Ex.: "gere uma peça" sozinho; "faça uma petição" sem
  cliente/réu/fatos/valores; pedido vago. Anexos de IMAGEM não contam como insumo
  (não são lidos até o OCR). NÃO use para ações operacionais (cadastrar, criar tarefa
  etc.) — essas são ACAO_COM_TOOL; nem para leitura de cadastro — essa é CONSULTA.
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
sensíveis e NÃO faça perguntas investigativas. Apenas acolha e convide a informar a demanda.`;

// System prompt da resposta de PEDIR DADOS (NEGOCIO_SEM_INSUMO) — específica e amigável.
export const NEED_INFO_SYSTEM = `Você é o assistente virtual de um escritório de advocacia (JurisAI).
O usuário pediu uma peça/trabalho jurídico, mas NÃO forneceu informação suficiente para fundamentá-la.
Responda de forma BREVE e amigável em português do Brasil pedindo os dados de forma ESPECÍFICA:
quem é o cliente, qual é o réu, os fatos e os valores envolvidos, e o tema/objeto da peça. Peça que
ele envie por TEXTO. NÃO invente dados, NÃO produza a peça e NÃO rode nenhuma análise — apenas peça as
informações necessárias, de maneira objetiva e acolhedora.`;

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
  // "quero ver os dados do cliente" é consulta → nunca dispara o form.
  if (CADASTRO_NEGATIVE_RE.test(m)) return false;
  if (CADASTRO_FRASE_RE.test(m)) return true;
  return CADASTRO_ALVO_RE.test(m) && CADASTRO_VERBO_RE.test(m);
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
