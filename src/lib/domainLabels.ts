/**
 * Rótulos legíveis para códigos de domínio gravados no banco (snake_case).
 *
 * Fonte única para telas e gráficos: sem isto cada painel repetia um mapa
 * parcial e qualquer valor fora dele vazava como slug cru na UI. O fallback é
 * `humanizeSlug`, então um código novo no banco aparece legível antes mesmo de
 * ganhar tradução aqui.
 */

/** `extrato_conta` → `Extrato conta`. Nunca devolve o slug cru. */
export function humanizeSlug(key: string | null | undefined): string {
  if (key === null || key === undefined) return "Sem informação";
  const clean = key.replace(/[_-]+/g, " ").trim();
  if (!clean) return "Sem informação";
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

/**
 * CHECK `client_documents_document_type_check` (medido em produção 07/08/2026).
 * Os códigos são os valores EXATOS gravados em `document_type` — não renomear
 * sem alinhar com `tipo_acao_ancora_docs`.
 */
export const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  apolice_susep: "Apólice SUSEP",
  audio_atendimento: "Áudio do atendimento",
  audio_autorizacao: "Áudio de autorização",
  carta_concessao: "Carta de concessão",
  certidao: "Certidão",
  cnis: "CNIS",
  comprovante: "Comprovante",
  comprovante_reajuste: "Comprovante de reajuste",
  comprovante_residencia: "Comprovante de Residência",
  contracheque: "Contracheque",
  contrato: "Contrato",
  contrato_honorarios: "Contrato de honorários",
  cpf: "CPF",
  ctps: "CTPS",
  declaracao_hipossuficiencia: "Declaração de hipossuficiência",
  documento_emprestimo: "Documento de empréstimo",
  documento_fiscal: "Documento fiscal",
  documentos_serasa: "Documentos Serasa",
  extrato_conta: "Extrato Bancário",
  extrato_inss: "Extrato INSS",
  extrato_ir: "Extrato de Imposto de Renda",
  ficha_cadastral: "Ficha cadastral",
  hiscon: "HISCON",
  hiscre: "HISCRE",
  laudo_medico: "Laudo médico",
  minuta: "Minuta",
  negativa_inss: "Negativa INSS",
  negativa_plano: "Negativa do plano",
  outro: "Outro",
  peticao_inicial: "Petição inicial",
  procuracao: "Procuração",
  reclame_aqui: "Reclame Aqui",
  resumo_atendimento: "Resumo do atendimento",
  rg: "RG",
  sentenca: "Sentença",
  sentenca_procedente: "Sentença procedente",
  termo_cooperado: "Termo de Cooperado",
  transcricao_atendimento: "Transcrição do atendimento",
};

/**
 * `clients.client_origin` é texto livre: além das opções do cadastro existem
 * valores de importação em massa (`planilha`). `_none` é a chave que as RPCs de
 * dashboard usam para agrupar os nulos.
 */
export const CLIENT_ORIGIN_LABELS: Record<string, string> = {
  _none: "Sem origem",
  indicacao: "Indicação",
  ressaque: "Ressaque",
  whatsapp: "WhatsApp",
  marketing: "Marketing",
  site: "Site",
  organico: "Orgânico",
  planilha: "Planilha",
  cooperativa: "Cooperativa",
  mock: "Mock",
  outro: "Outro",
};

export const labelForDocumentType = (key: string) => DOCUMENT_TYPE_LABELS[key] ?? humanizeSlug(key);
export const labelForClientOrigin = (key: string) => CLIENT_ORIGIN_LABELS[key] ?? humanizeSlug(key);
