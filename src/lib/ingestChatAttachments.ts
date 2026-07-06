// Canal A — ingestão dos DOCUMENTOS DO CASO anexados na conversa.
//
// No envio com anexos: sobe cada arquivo ao bucket `chat-attachments`, extrai o
// texto (md/txt direto, .docx via mammoth, .pdf via pdf.js), e grava em
// `chat_attachments` (com session_id). O orquestrador lê esses registros e injeta
// o texto como fonte AUTORITATIVA dos dados da parte no especialista (N3).
//
// Falha de extração NÃO bloqueia o upload: grava extracted_text = null e a função
// devolve o nome do arquivo em `failedExtraction` para a UI avisar.

import { supabase } from "@/integrations/supabase/client";
import { extractFileText, sanitizeExtractedText } from "@/lib/extractFileText";

// Limite de tamanho do bucket `chat-attachments` (15 MiB). DEVE bater com o
// file_size_limit do bucket no Supabase Storage — se um lado mudar sem o outro,
// volta a falhar no upload. Validamos no cliente ANTES de subir para dar um erro
// claro (em vez de um 400 silencioso do storage).
export const BUCKET_FILE_SIZE_LIMIT = 15 * 1024 * 1024; // 15.728.640 bytes

// Flag OCR (Briefing 1). Espelho no front da env do edge: default OFF. Com OFF,
// o caminho de OCR abaixo NUNCA roda e o comportamento é IDÊNTICO ao atual
// (imagem → imagesWithoutText, só avisa). Só liga em ambiente de teste até o
// Briefing 2 + hardening ficarem prontos.
export const OCR_ENABLED =
  String(import.meta.env.VITE_OCR_ENABLED).toLowerCase() === "true";

// Timeout do invoke SÍNCRONO do OCR: o envio aguarda o OCR para que o texto vire
// insumo NESTE turno, mas não pode travar indefinidamente. Ao estourar, degrade
// para imagesWithoutText (comportamento de aviso, não bloqueia).
const OCR_INVOKE_TIMEOUT_MS = 15_000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("ocr_timeout")), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

export interface IngestResult {
  uploaded: number;
  failedExtraction: string[]; // DOCUMENTOS textuais que subiram mas não tiveram texto extraído (bloqueiam)
  failedUpload: string[];     // arquivos que nem subiram (erro de upload ou acima do limite)
  skipped: string[];          // arquivos já anexados nesta sessão (dedup) — não reanexados
  imagesWithoutText: string[]; // IMAGENS anexadas (sem texto extraível): NÃO bloqueiam — só avisam (OCR é fase 2)
}

// Uma imagem NUNCA tem texto extraível hoje (OCR é Track externo, fase 2). Por isso
// ela não pode cair no gate de "anexo sem texto legível" que existe para documentos
// textuais (PDF/DOCX/TXT). Classifica por mime_type e, como fallback, pela extensão
// — os mesmos campos gravados em chat_attachments. Mantém png/jpg/jpeg/webp/gif.
function isImageAttachment(file: File): boolean {
  if ((file.type || "").toLowerCase().startsWith("image/")) return true;
  return /\.(png|jpe?g|webp|gif|bmp|heic|heif|avif)$/i.test(file.name);
}

function sanitizeName(name: string): string {
  // Storage keys aceitam um conjunto restrito; normaliza acentos/espaços.
  return name
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^\w.\-]+/g, "_")
    .slice(0, 120);
}

// Fallback de extração por extensão quando o mime vem vazio (comum em .md/.txt).
// Todo caminho passa por sanitizeExtractedText: NUNCA devolver texto cru (o byte 0
// / surrogates soltos causam 400 no insert de chat_attachments).
async function extractWithFallback(file: File): Promise<string | null> {
  try {
    const direct = await extractFileText(file); // já sanitizado internamente
    if (direct && direct.trim()) return direct;
  } catch { /* tenta fallback abaixo */ }
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".md") || lower.endsWith(".txt") || lower.endsWith(".markdown")) {
    try { return sanitizeExtractedText(await file.text()); } catch { return null; }
  }
  return null;
}

export async function ingestChatAttachments(
  sessionId: string,
  userId: string,
  files: File[],
): Promise<IngestResult> {
  const result: IngestResult = { uploaded: 0, failedExtraction: [], failedUpload: [], skipped: [], imagesWithoutText: [] };

  for (const file of files) {
    // Trava anti-duplicação: se o mesmo arquivo já está anexado e ativo NESTA sessão
    // (mesmo nome + tamanho), não reanexa — evita acúmulo e contexto duplicado.
    const { data: existing } = await supabase
      .from("chat_attachments")
      .select("id")
      .eq("session_id", sessionId)
      .eq("file_name", file.name)
      .eq("file_size", file.size)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    if (existing) { result.skipped.push(file.name); continue; }

    // Guarda-corpo: rejeita no cliente o que o bucket recusaria, com erro claro.
    if (file.size > BUCKET_FILE_SIZE_LIMIT) {
      result.failedUpload.push(file.name);
      continue;
    }

    const path = `${userId}/${sessionId}/${Date.now()}_${sanitizeName(file.name)}`;

    const { error: upErr } = await supabase.storage
      .from("chat-attachments")
      .upload(path, file, { upsert: false, contentType: file.type || undefined });

    if (upErr) {
      result.failedUpload.push(file.name);
      continue;
    }

    let text: string | null = null;
    try { text = await extractWithFallback(file); } catch { text = null; }
    // Defensivo: re-sanitiza no ponto do insert. Garante que nenhum texto cru
    // (byte 0 / surrogate solto) chegue ao Postgres mesmo se um caminho novo de
    // extração esquecer de sanitizar. Sem isto o insert volta a dar 400.
    const safeText = sanitizeExtractedText(text);
    const isImage = isImageAttachment(file);
    // Sem texto extraível: só é FALHA (que bloqueia) para DOCUMENTO textual —
    // ali o texto era esperado. Para IMAGEM a decisão fica ADIADA: se o OCR
    // estiver ligado, tentamos extrair no servidor antes de marcá-la como
    // "sem texto" (só cai em imagesWithoutText se o OCR falhar/vier vazio).
    if (!safeText && !isImage) {
      result.failedExtraction.push(file.name);
    }

    const { data: inserted, error: insErr } = await supabase
      .from("chat_attachments")
      .insert({
        session_id: sessionId,
        user_id: userId,
        storage_path: path,
        file_name: file.name,
        mime_type: file.type || null,
        file_size: file.size,
        extracted_text: safeText,
      })
      .select("id")
      .single();

    if (insErr || !inserted) { result.failedUpload.push(file.name); continue; }
    result.uploaded++;

    // OCR (Briefing 1) — só para IMAGEM sem texto extraível no cliente.
    if (isImage && !safeText) {
      if (OCR_ENABLED) {
        // Invoke SÍNCRONO (await): o servidor lê o binário, roda o extrator e
        // popula extracted_text. Se der certo, a imagem deixa de ir para
        // imagesWithoutText e entra como insumo NESTE turno (loadCaseDocuments
        // relê a linha pelo extracted_text já gravado no servidor).
        let ocrOk = false;
        try {
          const { data } = await withTimeout(
            supabase.functions.invoke("ocr-attachment", { body: { attachmentId: inserted.id } }),
            OCR_INVOKE_TIMEOUT_MS,
          );
          if (data?.ok && typeof data.chars === "number" && data.chars > 0) ocrOk = true;
        } catch {
          ocrOk = false; // erro de rede / timeout → degrade seguro
        }
        // OCR falhou/vazio/timeout → mantém o aviso, não bloqueia.
        if (!ocrOk) result.imagesWithoutText.push(file.name);
      } else {
        // Flag OFF → comportamento atual intacto: imagem só avisa.
        result.imagesWithoutText.push(file.name);
      }
    }
  }

  return result;
}
