import { supabase } from "@/integrations/supabase/client";

/**
 * Anexos do protocolo entre assistentes (V19+).
 *
 * Duas formas de anexar na resposta:
 *   - upload de arquivo novo  → bucket `inter-assistant-files` (path por request)
 *   - documento já cadastrado do cliente → referência direta ao `client_documents`
 *     (bucket `client-documents`, legível por qualquer autenticado)
 *
 * As referências ficam em `inter_assistant_requests.response_payload.attachments`.
 */

export interface IAAttachment {
  bucket: string; // 'inter-assistant-files' | 'client-documents'
  path: string;
  name: string;
  size: number | null;
  mime: string | null;
  source: "upload" | "client_doc";
}

const UPLOAD_BUCKET = "inter-assistant-files";
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB
const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg", "image/png", "image/webp", "image/gif",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain", "text/csv",
];

/** Faz upload de um arquivo novo para a pasta do pedido e devolve o anexo. */
export async function uploadInterAssistantFile(requestId: string, file: File): Promise<IAAttachment> {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`Arquivo excede 25MB (${(file.size / 1024 / 1024).toFixed(1)}MB)`);
  }
  if (file.type && !ALLOWED_MIME_TYPES.includes(file.type)) {
    throw new Error(`Tipo "${file.type}" não permitido. Use PDF, DOC, XLS, imagens, TXT ou CSV.`);
  }
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const uid = crypto.randomUUID().slice(0, 8);
  const path = `${requestId}/${uid}-${safe}`;
  const { error } = await supabase.storage
    .from(UPLOAD_BUCKET)
    .upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type || undefined });
  if (error) throw new Error(`Upload falhou: ${error.message}`);
  return { bucket: UPLOAD_BUCKET, path, name: file.name, size: file.size, mime: file.type || null, source: "upload" };
}

/** Gera URL assinada (1h) para baixar um anexo (de qualquer um dos buckets). */
export async function getAttachmentUrl(att: { bucket: string; path: string }): Promise<string | null> {
  const { data, error } = await supabase.storage.from(att.bucket).createSignedUrl(att.path, 3600);
  if (error) return null;
  return data?.signedUrl ?? null;
}

// ─── Seleção de documentos já cadastrados do cliente ──────────────────────────
export interface ClientLite { id: string; full_name: string }
export interface ClientDocLite {
  id: string;
  document_name: string;
  file_path: string;
  file_size: number | null;
  mime_type: string | null;
  document_type: string | null;
}

/** Busca clientes por nome (recepção/sócio via RLS). */
export async function searchClients(term: string): Promise<ClientLite[]> {
  let q = supabase.from("clients").select("id, full_name").order("full_name").limit(20);
  if (term.trim()) q = q.ilike("full_name", `%${term.trim()}%`);
  const { data } = await q;
  return (data as ClientLite[]) ?? [];
}

/** Lista os documentos de um cliente. */
export async function listClientDocuments(clientId: string): Promise<ClientDocLite[]> {
  const { data } = await supabase
    .from("client_documents")
    .select("id, document_name, file_path, file_size, mime_type, document_type")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });
  return (data as ClientDocLite[]) ?? [];
}

/** Converte um documento de cliente em anexo (referência direta, sem cópia). */
export function clientDocToAttachment(d: ClientDocLite): IAAttachment {
  return {
    bucket: "client-documents",
    path: d.file_path,
    name: d.document_name,
    size: d.file_size,
    mime: d.mime_type,
    source: "client_doc",
  };
}
