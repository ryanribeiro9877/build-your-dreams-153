// supabase/functions/chat-orchestrator/intentClassifier.ts
//
// Card 2.8 — Classificador de intenção (fast-path para triviais).
//
// Hoje TODA mensagem passa pela cadeia N1->N2->N3, inclusive "oi"/"bom dia".
// Este módulo concentra a lógica PURA (sem I/O) do classificador de intenção que
// roda na ENTRADA (antes do N1) para desviar mensagens TRIVIAIS a um fast-path
// (resposta rápida, sem N2/N3), reservando a cadeia completa para NEGÓCIO.
//
// PRINCÍPIO DE SEGURANÇA (assimetria): o erro barato é rodar a cadeia à toa para
// um "oi"; o erro GRAVE é tratar uma demanda jurídica como trivial e pular a
// orquestração. Logo, SÓ vai para o fast-path com ALTA confiança de trivial —
// qualquer dúvida é INCERTO e segue a cadeia completa. Nada aqui produz TRIVIAL
// por acidente: o default sempre pende para a cadeia completa.

export type IntentCategory = "TRIVIAL" | "NEGOCIO" | "INCERTO";

// Prompt do classificador (modelo RÁPIDO, 1 chamada curta, saída JSON).
// Instrui a olhar a MENSAGEM INTEIRA — o caso de fronteira "bom dia, preciso de
// uma petição..." é NEGÓCIO: começar com saudação NÃO torna a mensagem trivial.
export const INTENT_CLASSIFIER_RULES = `Você é um classificador de intenção na ENTRADA de um sistema jurídico multi-agente.
Analise a MENSAGEM INTEIRA do usuário (não só o começo) e classifique em UMA categoria:

- "TRIVIAL": saudação, cortesia, small talk ou pergunta trivial SEM qualquer teor
  jurídico e SEM pedido de trabalho. Ex.: "oi", "bom dia", "tudo bem?", "obrigado",
  "quem é você?", "que dia é hoje?". Use TRIVIAL SOMENTE com ALTA CONFIANÇA.
- "NEGOCIO": QUALQUER pedido ou menção de demanda jurídica — peça, petição,
  contestação, recurso, contrato, cálculo, cliente, documento, prazo, processo,
  dúvida técnica jurídica, ou uma ação a executar. Se a mensagem MISTURA uma
  saudação com um pedido (ex.: "bom dia, preciso de uma petição de indébito para o
  cliente"), é NEGOCIO — o cumprimento inicial NÃO a torna trivial.
- "INCERTO": ambígua, curta demais para ter certeza, ou com possível teor jurídico
  que você não consegue descartar com segurança.

REGRA DE OURO (assimetria — obedeça à risca): na MENOR dúvida entre TRIVIAL e o
resto, escolha INCERTO. Prefira SEMPRE NEGOCIO/INCERTO quando não houver certeza
absoluta de que é conversa fiada. É preferível processar um "oi" a mais do que
deixar passar uma demanda jurídica como trivial.

Responda APENAS com JSON: {"categoria":"TRIVIAL"|"NEGOCIO"|"INCERTO"}.`;

// System prompt da resposta do FAST-PATH (Opção B: natural, não template fixo).
export const FAST_REPLY_SYSTEM = `Você é o assistente virtual de um escritório de advocacia (JurisAI).
O usuário enviou uma mensagem TRIVIAL (saudação, cortesia ou small talk), SEM demanda jurídica.
Responda de forma BREVE, calorosa e natural em português do Brasil (1 a 2 frases) e CONVIDE o
usuário a dizer no que você pode ajudar juridicamente (ex.: elaborar uma peça, analisar um
documento, tirar uma dúvida). NÃO invente informação jurídica, NÃO redija peça, NÃO peça dados
sensíveis e NÃO faça perguntas investigativas. Apenas acolha e convide a informar a demanda.`;

// Pré-filtro determinístico: a mensagem referencia anexos? O front concatena os
// anexos como "[Arquivos: ...]" ao texto. Anexo é sinal FORTE de NEGÓCIO — nunca
// deve ir para o fast-path (empurra sempre para a cadeia completa: direção segura).
export function mentionsAttachments(message: string): boolean {
  return /\[\s*Arquivos?\s*:/i.test(message || "");
}

// Normaliza a saída do classificador para a categoria canônica. ASSIMÉTRICO:
// apenas "TRIVIAL" explícito vira TRIVIAL; "NEGOCIO" explícito vira NEGOCIO;
// QUALQUER outra coisa (vazio, ambíguo, rótulo desconhecido, "INCERTO") vira
// INCERTO — que o roteamento trata como cadeia completa. Nunca produz TRIVIAL
// por acidente.
export function normalizeIntent(raw: string | null | undefined): IntentCategory {
  const c = (raw || "").trim().toUpperCase();
  if (c === "TRIVIAL") return "TRIVIAL";
  if (c === "NEGOCIO" || c === "NEGÓCIO") return "NEGOCIO";
  return "INCERTO";
}

// Pré-filtro (barato, sem LLM) que decide se a mensagem SEQUER pode ser candidata
// ao fast-path. Só retorna true quando NADA determinístico contraindica; caso
// contrário empurra para a cadeia completa (o "erro barato"). Não decide TRIVIAL —
// apenas libera a mensagem para a classificação por LLM.
export function eligibleForFastPath(
  message: string, opts: { enabled: boolean; maxChars: number },
): boolean {
  if (!opts.enabled) return false;
  const m = (message || "").trim();
  if (!m) return false;                       // vazio: deixa a cadeia tratar
  if (m.length > opts.maxChars) return false; // mensagem longa dificilmente é small talk
  if (mentionsAttachments(m)) return false;   // anexo → NEGÓCIO
  return true;
}
