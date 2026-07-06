// supabase/functions/chat-orchestrator/intentClassifier.ts
//
// Card 2.8 — Classificador de intenção + suficiência de insumo.
//
// Roda na ENTRADA (antes do N1) e toma UMA de TRÊS decisões, evitando rodar a
// cadeia cara (N3) quando não vale a pena:
//   - TRIVIAL              → fast-path: resposta natural e acolhedora (sem N2/N3).
//   - NEGOCIO_SEM_INSUMO   → demanda jurídica SEM dados textuais suficientes para
//                            fundamentar a peça → pede os dados (sem N2/N3, sem N3).
//   - NEGOCIO_COM_INSUMO   → demanda jurídica COM dados suficientes → cadeia completa.
//
// PRINCÍPIO DE SEGURANÇA — DUAS assimetrias, ambas "na dúvida, o mais seguro":
//   A) Trivial vs. negócio: o erro barato é rodar a cadeia para um "oi"; o GRAVE é
//      tratar demanda jurídica como trivial e pular a orquestração. → Na dúvida,
//      NÃO é trivial (vai para negócio). Fast-path só com ALTA confiança de trivial.
//   B) Insumo suficiente vs. insuficiente: o erro barato é gerar uma peça a mais; o
//      GRAVE é BLOQUEAR uma demanda que TINHA insumo (frustra o advogado). → Na
//      dúvida, GERAR (com insumo). Só bloqueia (pede dados) com clareza de que falta.
// Resumo: o default de tudo é NEGOCIO_COM_INSUMO (gerar). TRIVIAL e SEM_INSUMO só
// com certeza. normalizeIntent materializa esse default seguro.

export type IntentCategory = "TRIVIAL" | "NEGOCIO_SEM_INSUMO" | "NEGOCIO_COM_INSUMO";

// Prompt do classificador (modelo RÁPIDO, 1 chamada curta, saída JSON). Instrui a
// olhar a MENSAGEM INTEIRA — "bom dia, preciso de uma petição..." é negócio: começar
// com saudação NÃO torna trivial. A suficiência de insumo é julgada sobre o TEXTO da
// mensagem + o CONTEXTO de anexos que o chamador informa (imagens não contam).
export const INTENT_CLASSIFIER_RULES = `Você é um classificador de intenção na ENTRADA de um sistema jurídico multi-agente.
Analise a MENSAGEM INTEIRA do usuário (não só o começo) e escolha UMA categoria:

- "TRIVIAL": saudação, cortesia, small talk ou pergunta trivial SEM qualquer teor
  jurídico e SEM pedido de trabalho. Ex.: "oi", "bom dia", "tudo bem?", "obrigado".
  Use TRIVIAL SOMENTE com ALTA CONFIANÇA.
- "NEGOCIO_SEM_INSUMO": é uma demanda jurídica (pedir peça, cálculo, análise etc.),
  MAS a mensagem NÃO traz informação textual suficiente para fundamentar o trabalho.
  Ex.: "gere uma peça" sozinho; "faça uma petição" sem cliente/réu/fatos/valores;
  pedido vago. Anexos de IMAGEM não contam como insumo (não são lidos até o OCR).
- "NEGOCIO_COM_INSUMO": demanda jurídica COM dados textuais suficientes para o
  especialista trabalhar (ex.: cliente, réu, fatos, valores, tema — ou documento
  com texto legível anexado). "bom dia, preciso de uma petição de indébito para o
  cliente João, contrato 123, valor R$5.000, banco X" é NEGOCIO_COM_INSUMO.

REGRAS DE OURO (assimetria — obedeça à risca):
1) Na MENOR dúvida entre TRIVIAL e negócio, escolha uma categoria de NEGOCIO. É
   preferível processar um "oi" a deixar passar uma demanda jurídica como trivial.
2) Na dúvida entre COM e SEM insumo, escolha NEGOCIO_COM_INSUMO (gerar). Só use
   NEGOCIO_SEM_INSUMO quando estiver CLARO que faltam dados para fundamentar a peça.

Responda APENAS com JSON: {"categoria":"TRIVIAL"|"NEGOCIO_SEM_INSUMO"|"NEGOCIO_COM_INSUMO"}.`;

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

// Normaliza a saída do classificador para a categoria canônica. ASSIMÉTRICO (ambos
// os eixos): apenas "TRIVIAL" explícito vira TRIVIAL; apenas "NEGOCIO_SEM_INSUMO"
// explícito vira SEM_INSUMO; QUALQUER outra coisa (vazio, ambíguo, rótulo
// desconhecido, "NEGOCIO_COM_INSUMO") cai no default SEGURO NEGOCIO_COM_INSUMO —
// cadeia completa / gerar. Nunca produz TRIVIAL nem SEM_INSUMO por acidente.
export function normalizeIntent(raw: string | null | undefined): IntentCategory {
  const c = (raw || "").trim().toUpperCase();
  if (c === "TRIVIAL") return "TRIVIAL";
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
export function routePathFor(category: IntentCategory): "fast" | "need_info" | "full" {
  if (category === "TRIVIAL") return "fast";
  if (category === "NEGOCIO_SEM_INSUMO") return "need_info";
  return "full";
}
