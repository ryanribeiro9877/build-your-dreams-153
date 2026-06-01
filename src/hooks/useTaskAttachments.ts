import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * V20 — Hook de anexos em tarefas.
 *
 * Fluxo de upload:
 *   1. Cliente seleciona arquivo
 *   2. Validação local (tamanho, mime)
 *   3. supabase.storage.upload(path, file)
 *   4. supabase.rpc('register_task_attachment', metadata) — RLS valida envolvimento
 *
 * Path no bucket: task-attachments/{task_id}/{uuid}-{filename}
 */

export interface TaskAttachment {
  id: string;
  storage_path: string;
  file_name: string;
  file_size_bytes: number;
  mime_type: string | null;
  description: string | null;
  uploader_user_id: string;
  uploader_name: string;
  created_at: string;
  is_owner: boolean;
}

const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg", "image/png", "image/webp", "image/gif",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain", "text/csv",
];

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

export function useTaskAttachments(taskId: string | null) {
  const { user } = useAuth();
  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!taskId) {
      setAttachments([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error: rpcErr } = await supabase.rpc(
      "get_task_attachments" as never,
      { p_task_id: taskId } as never,
    );
    if (rpcErr) {
      setError(rpcErr.message);
      setAttachments([]);
    } else {
      setAttachments((data as unknown as TaskAttachment[]) || []);
    }
    setLoading(false);
  }, [taskId]);

  useEffect(() => { void refresh(); }, [refresh]);

  // Realtime: atualiza quando outro user faz upload no mesmo task
  useEffect(() => {
    if (!taskId || !user) return;
    const channel = supabase
      .channel(`task-att-${taskId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "task_attachments", filter: `task_id=eq.${taskId}` },
        () => { void refresh(); },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [taskId, user, refresh]);

  /**
   * Faz upload de um arquivo e registra metadata.
   */
  const uploadFile = useCallback(async (file: File, description?: string): Promise<TaskAttachment | null> => {
    if (!taskId) {
      setError("Sem task_id");
      return null;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError(`Arquivo excede 25MB (${(file.size / 1024 / 1024).toFixed(1)}MB)`);
      return null;
    }
    if (file.type && !ALLOWED_MIME_TYPES.includes(file.type)) {
      setError(`Tipo "${file.type}" não permitido. Use: PDF, DOC, XLS, imagens, TXT, CSV`);
      return null;
    }

    setUploading(true);
    setError(null);

    try {
      // Path: task_id/{random}-{filename}
      const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const uniqueId = crypto.randomUUID().slice(0, 8);
      const storagePath = `${taskId}/${uniqueId}-${safeFilename}`;

      // 1. Upload no Storage
      const { error: uploadErr } = await supabase
        .storage
        .from("task-attachments")
        .upload(storagePath, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type || undefined,
        });

      if (uploadErr) {
        throw new Error(`Upload falhou: ${uploadErr.message}`);
      }

      // 2. Registra metadata via RPC
      const { data: attachmentId, error: rpcErr } = await supabase.rpc(
        "register_task_attachment" as never,
        {
          p_task_id: taskId,
          p_storage_path: storagePath,
          p_file_name: file.name,
          p_file_size_bytes: file.size,
          p_mime_type: file.type || null,
          p_description: description || null,
        } as never,
      );

      if (rpcErr) {
        // Rollback: remove do storage
        await supabase.storage.from("task-attachments").remove([storagePath]);
        throw new Error(`Registro falhou: ${rpcErr.message}`);
      }

      await refresh();
      return attachments.find(a => a.id === (attachmentId as unknown as string)) || null;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setUploading(false);
    }
  }, [taskId, attachments, refresh]);

  /**
   * Gera URL assinada (1h) para baixar arquivo.
   */
  const getDownloadUrl = useCallback(async (storagePath: string): Promise<string | null> => {
    const { data, error: signErr } = await supabase
      .storage
      .from("task-attachments")
      .createSignedUrl(storagePath, 3600);
    if (signErr) {
      setError(`Não foi possível gerar link: ${signErr.message}`);
      return null;
    }
    return data?.signedUrl ?? null;
  }, []);

  /**
   * Deleta anexo (RPC + Storage).
   */
  const deleteAttachment = useCallback(async (attachmentId: string): Promise<boolean> => {
    try {
      // RPC retorna o storage_path pra eu deletar
      const { data: storagePath, error: rpcErr } = await supabase.rpc(
        "delete_task_attachment" as never,
        { p_attachment_id: attachmentId } as never,
      );
      if (rpcErr) throw rpcErr;

      if (storagePath) {
        await supabase.storage.from("task-attachments").remove([storagePath as unknown as string]);
      }
      await refresh();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
  }, [refresh]);

  return {
    attachments,
    loading,
    uploading,
    error,
    refresh,
    uploadFile,
    getDownloadUrl,
    deleteAttachment,
    clearError: () => setError(null),
  };
}
