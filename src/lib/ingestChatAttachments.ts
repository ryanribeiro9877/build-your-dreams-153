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
import { extractFileText } from "@/lib/extractFileText";

export interface IngestResult {
  uploaded: number;
  failedExtraction: string[]; // arquivos que subiram mas não tiveram texto extraído
  failedUpload: string[];     // arquivos que nem subiram
  skipped: string[];          // arquivos já anexados nesta sessão (dedup) — não reanexados
}

function sanitizeName(name: string): string {
  // Storage keys aceitam um conjunto restrito; normaliza acentos/espaços.
  return name
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^\w.\-]+/g, "_")
    .slice(0, 120);
}

// Fallback de extração por extensão quando o mime vem vazio (comum em .md/.txt).
async function extractWithFallback(file: File): Promise<string | null> {
  try {
    const direct = await extractFileText(file);
    if (direct && direct.trim()) return direct;
  } catch { /* tenta fallback abaixo */ }
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".md") || lower.endsWith(".txt") || lower.endsWith(".markdown")) {
    try { return await file.text(); } catch { return null; }
  }
  return null;
}

export async function ingestChatAttachments(
  sessionId: string,
  userId: string,
  files: File[],
): Promise<IngestResult> {
  const result: IngestResult = { uploaded: 0, failedExtraction: [], failedUpload: [], skipped: [] };

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
    if (!text || !text.trim()) result.failedExtraction.push(file.name);

    const { error: insErr } = await supabase.from("chat_attachments").insert({
      session_id: sessionId,
      user_id: userId,
      storage_path: path,
      file_name: file.name,
      mime_type: file.type || null,
      file_size: file.size,
      extracted_text: text && text.trim() ? text : null,
    });

    if (insErr) { result.failedUpload.push(file.name); continue; }
    result.uploaded++;
  }

  return result;
}
