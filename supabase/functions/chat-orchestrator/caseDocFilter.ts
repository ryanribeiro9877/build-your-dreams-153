// supabase/functions/chat-orchestrator/caseDocFilter.ts
//
// Voz é canal de COMANDO, não prova de caso. Um anexo `audio/*` transcrito (a
// transcrição vira `chat_attachments.extracted_text`) NÃO deve entrar em
// `loadCaseDocuments` — senão uma mensagem de voz como "crie uma pendência"
// marcaria `hasReadableDocs=true` e distorceria o classificador de intenção
// (empurrando para NEGOCIO_COM_INSUMO) e o contexto do especialista.

/** true quando o anexo deve contar como documento de caso (não é áudio). */
export function isCaseDocumentAttachment(mimeType: string | null): boolean {
  return !((mimeType || "").toLowerCase().startsWith("audio/"));
}
