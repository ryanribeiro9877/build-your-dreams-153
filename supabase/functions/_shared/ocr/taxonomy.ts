// supabase/functions/_shared/ocr/taxonomy.ts
//
// Fonte ÚNICA da taxonomia de doc_type (classificação de documento por CONTEÚDO).
// Consumida pelo extractor de VISÃO (openaiVisionExtractor), pelo classificador de
// TEXTO (classify-attachment) e pelo chat-orchestrator (rótulos + mapa p/ o dossiê).
// Auto-contido (sem imports) para não inflar o bundle de quem importa.

/** Todos os doc_type que os classificadores (visão e texto) podem devolver. */
export const DOC_TYPES = [
  "identidade", "cnh", "comprovante_residencia", "extrato_inss", "contracheque",
  "procuracao", "declaracao_hipossuficiencia", "contrato_honorarios",
  "termo_cooperado", "ficha_cadastral", "sentenca", "peticao", "outro",
] as const;
export type DocType = typeof DOC_TYPES[number];

/** Chave do OcrField que carrega a classificação. */
export const DOC_TYPE_FIELD_KEY = "doc_type";

/** Descrição curta por tipo — alimenta o PROMPT dos classificadores (visão e texto). */
export const DOC_TYPE_DESCRIPTIONS: Record<string, string> = {
  identidade: "RG/carteira de identidade",
  cnh: "carteira de motorista (CNH)",
  comprovante_residencia: "comprovante de residência (conta de luz, água, telefone, fatura)",
  extrato_inss: "extrato do INSS/CNIS",
  contracheque: "contracheque/holerite",
  procuracao: "procuração (instrumento de mandato ad judicia)",
  declaracao_hipossuficiencia: "declaração de hipossuficiência/pobreza",
  contrato_honorarios: "contrato de honorários advocatícios",
  termo_cooperado: "termo de adesão de cooperado",
  ficha_cadastral: "ficha cadastral/ficha de atendimento do cliente",
  sentenca: "sentença ou decisão judicial",
  peticao: "petição/peça processual (inicial, contestação, recurso, manifestação)",
  outro: "qualquer outro documento",
};

/** Rótulo legível (pt-BR) por tipo — exibição no contexto do especialista. */
export const DOC_TYPE_LABELS: Record<string, string> = {
  identidade: "documento de identidade (RG)",
  cnh: "CNH",
  comprovante_residencia: "comprovante de residência",
  extrato_inss: "extrato do INSS",
  contracheque: "contracheque",
  procuracao: "procuração",
  declaracao_hipossuficiencia: "declaração de hipossuficiência",
  contrato_honorarios: "contrato de honorários",
  termo_cooperado: "termo de cooperado",
  ficha_cadastral: "ficha cadastral",
  sentenca: "sentença",
  peticao: "petição",
  outro: "outro documento",
};

/** doc_type que dispara o fluxo de cadastro de pessoa (documento de identidade). */
export const IDENTITY_DOC_TYPES = new Set<string>(["identidade", "cnh"]);

/**
 * Mapa doc_type (classificação) → document_type (client_documents / checklist).
 * É o que faz a "baixa automática" casar 1:1 com os itens do checklist. Tipos sem
 * item de checklist (sentenca, peticao, ficha_cadastral, extrato_inss, contracheque)
 * ainda vão ao dossiê com o document_type correto — guardados TIPADOS.
 */
export const DOC_TYPE_TO_DOCUMENT_TYPE: Record<string, string> = {
  identidade: "rg",
  cnh: "rg",
  comprovante_residencia: "comprovante",
  extrato_inss: "extrato_inss",
  contracheque: "contracheque",
  procuracao: "procuracao",
  declaracao_hipossuficiencia: "declaracao_hipossuficiencia",
  contrato_honorarios: "contrato_honorarios",
  termo_cooperado: "termo_cooperado",
  ficha_cadastral: "ficha_cadastral",
  sentenca: "sentenca",
  peticao: "peticao_inicial",
  outro: "outro",
};

/** Traduz um doc_type para o document_type do dossiê (default 'outro'). */
export function docTypeToDocumentType(docType: string | null | undefined): string {
  if (!docType) return "outro";
  return DOC_TYPE_TO_DOCUMENT_TYPE[docType.toLowerCase()] ?? "outro";
}

/** Lista formatada "tipo (descrição), …" para o prompt dos classificadores. */
export function docTypePromptList(): string {
  return DOC_TYPES.map((t) => `${t} (${DOC_TYPE_DESCRIPTIONS[t]})`).join(", ");
}
