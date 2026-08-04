// supabase/functions/chat-orchestrator/caseDocFilter.ts
//
// Voz é canal de COMANDO, não prova de caso. Um anexo `audio/*` transcrito (a
// transcrição vira `chat_attachments.extracted_text`) NÃO deve entrar em
// `loadCaseDocuments` — senão uma mensagem de voz como "crie uma pendência"
// marcaria `hasReadableDocs=true` e distorceria o classificador de intenção
// (empurrando para NEGOCIO_COM_INSUMO) e o contexto do especialista.

/** Extensões de ÁUDIO aceitas quando o mime vem vazio/errado do navegador. */
// `.webm` entra porque é o que o MediaRecorder produz no Chrome (audio/webm);
// `.oga`/`.opus` porque é o que o WhatsApp/Telegram exportam. Manter em sincronia
// com o espelho do front (src/lib/ingestChatAttachments.ts): quem divergir volta a
// mandar áudio para o ingestor de peça.
const AUDIO_EXT_RE = /\.(ogg|oga|opus|webm|m4a|mp3|wav|aac|amr|mp4a)$/i;

/**
 * A.8 (validação 03-04/08, teste A-05): reconhece ANEXO DE ÁUDIO por mime OU por
 * extensão. O caminho do Card 5 (áudio de autorização) estava inalcançável pela
 * tela: o microfone só devolvia TEXTO, e o .ogg anexado à mão era barrado pelo
 * ingestor de peça ("anexos não ingeridos — use PDF/DOCX/TXT pesquisável").
 * Classificar áudio ANTES de qualquer decisão de ingestão é o que desvia o
 * arquivo para transcrição + anexar_audio_autorizacao.
 */
export function isAudioAttachment(mimeType: string | null, fileName?: string | null): boolean {
  if ((mimeType || "").toLowerCase().startsWith("audio/")) return true;
  return AUDIO_EXT_RE.test(fileName || "");
}

/** true quando o anexo deve contar como documento de caso (não é áudio). */
export function isCaseDocumentAttachment(mimeType: string | null, fileName?: string | null): boolean {
  return !isAudioAttachment(mimeType, fileName);
}
