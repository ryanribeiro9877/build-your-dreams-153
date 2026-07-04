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
import { isImageFile } from "@/lib/chatImages";

// Limite de tamanho do bucket `chat-attachments` (15 MiB). DEVE bater com o
// file_size_limit do bucket no Supabase Storage — se um lado mudar sem o outro,
// volta a falhar no upload. Validamos no cliente ANTES de subir para dar um erro
// claro (em vez de um 400 silencioso do storage).
export const BUCKET_FILE_SIZE_LIMIT = 15 * 1024 * 1024; // 15.728.640 bytes

export interface IngestResult {
  uploaded: number;
  failedExtraction: string[]; // arquivos que subiram mas não tiveram texto extraído
  failedUpload: string[];     // arquivos que nem subiram (erro de upload ou acima do limite)
  skipped: string[];          // arquivos já anexados nesta sessão (dedup) — não reanexados
  images: string[];           // imagens anexadas (sem texto por ora — OCR é Track externo)
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
  const result: IngestResult = { uploaded: 0, failedExtraction: [], failedUpload: [], skipped: [], images: [] };

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

    // Imagem: NÃO tentamos extrair texto (OCR é Track externo — Card 2.7 Passo 3).
    // A imagem sobe e fica anexada à conversa; o registro em chat_attachments com
    // storage_path já é o gancho para um OCR futuro localizá-la. Uma imagem sem
    // texto é ESPERADA — não entra em failedExtraction (que bloqueia a geração).
    const image = isImageFile(file);

    let text: string | null = null;
    if (!image) {
      try { text = await extractWithFallback(file); } catch { text = null; }
    }
    // Defensivo: re-sanitiza no ponto do insert. Garante que nenhum texto cru
    // (byte 0 / surrogate solto) chegue ao Postgres mesmo se um caminho novo de
    // extração esquecer de sanitizar. Sem isto o insert volta a dar 400.
    const safeText = sanitizeExtractedText(text);
    if (!image && !safeText) result.failedExtraction.push(file.name);

    const { error: insErr } = await supabase.from("chat_attachments").insert({
      session_id: sessionId,
      user_id: userId,
      storage_path: path,
      file_name: file.name,
      mime_type: file.type || null,
      file_size: file.size,
      extracted_text: safeText,
    });

    if (insErr) { result.failedUpload.push(file.name); continue; }
    result.uploaded++;
    if (image) result.images.push(file.name);
  }

  return result;
}
