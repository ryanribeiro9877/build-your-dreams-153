// Entrada por IMAGEM no chat (Card 2.7 — Passo 1).
//
// Validação de tipo/tamanho no FRONT (a RLS/policies do bucket `chat-attachments`
// são a segunda barreira — ver 20260612120000_v24_document_channels.sql) e
// carregamento das imagens já anexadas a uma CONVERSA para reexibição (preview).
//
// A imagem fica anexada à CONVERSA (chat_attachments.session_id), NÃO ao cadastro
// do cliente — o vínculo conversa→cliente ainda não existe (Card "Resolvedor de
// cliente"). O registro em chat_attachments com storage_path já é o gancho para
// um futuro OCR (Track externo) localizar a imagem no storage.

import { supabase } from "@/integrations/supabase/client";

// Formatos de imagem aceitos na entrada por imagem (Passo 1). Mantidos em sincronia
// com o aviso de rejeição exibido ao usuário.
export const ACCEPTED_IMAGE_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
] as const;

// Extensões aceitas (fallback quando o browser não preenche o mime — raro, mas
// acontece com alguns arquivos vindos de scanners/apps).
const ACCEPTED_IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp"];

// Limite de tamanho por imagem: alguns MB. DEVE ser ≤ file_size_limit do bucket
// `chat-attachments` (15 MiB) — validamos aqui só para dar um erro claro antes de
// subir, não para relaxar a barreira do storage.
export const IMAGE_FILE_SIZE_LIMIT = 8 * 1024 * 1024; // 8 MiB

export function isImageFile(file: File): boolean {
  const mime = (file.type || "").toLowerCase();
  if (mime.startsWith("image/")) return true;
  // Fallback por extensão quando o mime vem vazio.
  const lower = file.name.toLowerCase();
  return ACCEPTED_IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

// Considera "imagem" pelo mime persistido em chat_attachments (reexibição).
export function isImageMime(mime: string | null | undefined): boolean {
  return !!mime && mime.toLowerCase().startsWith("image/");
}

/**
 * Valida um arquivo de imagem no cliente. Devolve `null` quando ok, ou uma
 * mensagem de erro clara (pt-BR) quando o arquivo deve ser rejeitado.
 */
export function validateImageFile(file: File): string | null {
  const mime = (file.type || "").toLowerCase();
  const lower = file.name.toLowerCase();
  const mimeOk = (ACCEPTED_IMAGE_MIME_TYPES as readonly string[]).includes(mime);
  const extOk = ACCEPTED_IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
  // Se tem mime e NÃO é de imagem aceita → rejeita como formato inválido.
  // Se não tem mime, cai no teste por extensão.
  if (mime ? !mimeOk : !extOk) {
    return `"${file.name}" não é uma imagem suportada. Use PNG, JPG ou WEBP.`;
  }
  if (file.size > IMAGE_FILE_SIZE_LIMIT) {
    const mb = (IMAGE_FILE_SIZE_LIMIT / (1024 * 1024)).toFixed(0);
    return `"${file.name}" é grande demais (limite de ${mb} MB por imagem).`;
  }
  return null;
}

export interface SessionImageAttachment {
  id: string;
  fileName: string;
  mimeType: string | null;
  storagePath: string;
  url: string; // URL assinada (bucket privado) para exibir a miniatura/preview
}

/**
 * Carrega as IMAGENS já anexadas a uma conversa e gera URLs assinadas para
 * reexibição (o bucket é privado — RLS por dono/sessão). Devolve um mapa por
 * `fileName`, casando com os nomes citados na mensagem do usuário (`[Arquivos: …]`).
 *
 * A RLS de `chat_attachments` e do storage garante que só o dono da sessão (ou
 * admin/tech) enxerga estes registros — um usuário nunca vê anexo de conversa de
 * outro.
 */
export async function loadSessionImages(
  sessionId: string,
): Promise<Record<string, SessionImageAttachment>> {
  const { data, error } = await supabase
    .from("chat_attachments")
    .select("id, file_name, mime_type, storage_path, created_at")
    .eq("session_id", sessionId)
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  if (error || !data) return {};

  const rows = data as {
    id: string;
    file_name: string;
    mime_type: string | null;
    storage_path: string;
  }[];
  const images = rows.filter(
    (r) => isImageMime(r.mime_type) || isImageFile({ name: r.file_name, type: r.mime_type || "" } as File),
  );
  if (images.length === 0) return {};

  const out: Record<string, SessionImageAttachment> = {};
  // URLs assinadas por 1h — suficiente para a sessão de visualização; renova ao
  // reabrir a conversa. Uma por vez (a API de storage não expõe lote público).
  for (const img of images) {
    const { data: signed } = await supabase.storage
      .from("chat-attachments")
      .createSignedUrl(img.storage_path, 60 * 60);
    if (!signed?.signedUrl) continue;
    out[img.file_name] = {
      id: img.id,
      fileName: img.file_name,
      mimeType: img.mime_type,
      storagePath: img.storage_path,
      url: signed.signedUrl,
    };
  }
  return out;
}
