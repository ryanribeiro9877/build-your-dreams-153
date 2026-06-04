import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { extractFileText } from "@/lib/extractFileText";

export interface AgentDocument {
  id: string;
  agent_id: string;
  uploader_id: string;
  storage_path: string;
  file_name: string;
  file_size: number;
  mime_type: string | null;
  description: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

const BUCKET = "agent-documents";

const ALLOWED_EXTENSIONS = ["txt", "md", "markdown", "pdf", "docx"];
const ALLOWED_MIMES = [
  "text/plain",
  "text/markdown",
  "text/x-markdown",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

export function useAgentDocuments(agentId: string) {
  const [documents, setDocuments] = useState<AgentDocument[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("agent_documents" as any)
      .select("*")
      .eq("agent_id", agentId)
      .order("sort_order")
      .order("created_at", { ascending: false });
    if (error) {
      console.error("agent_documents load error", error);
      setDocuments([]);
    } else {
      setDocuments((data as any) || []);
    }
    setLoading(false);
  }, [agentId]);

  useEffect(() => {
    load();
  }, [load]);

  const upload = async (file: File, description?: string): Promise<boolean> => {
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      toast.error(`Tipo de arquivo nao permitido: .${ext}. Use: ${ALLOWED_EXTENSIONS.join(", ")}`);
      return false;
    }
    if (!ALLOWED_MIMES.includes(file.type) && file.type !== "") {
      toast.error(`MIME type nao permitido: ${file.type}`);
      return false;
    }
    if (file.size > MAX_SIZE) {
      toast.error(`Arquivo muito grande (${(file.size / 1024 / 1024).toFixed(1)} MB). Limite: 10 MB.`);
      return false;
    }

    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `${agentId}/${timestamp}_${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, file, { contentType: file.type || "text/plain", upsert: false });

    if (uploadError) {
      toast.error("Erro no upload: " + uploadError.message);
      return false;
    }

    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) {
      toast.error("Usuario nao autenticado");
      return false;
    }

    const { error: insertError } = await supabase
      .from("agent_documents" as any)
      .insert({
        agent_id: agentId,
        uploader_id: userId,
        storage_path: storagePath,
        file_name: file.name,
        file_size: file.size,
        mime_type: file.type || null,
        description: description || null,
        is_active: true,
        sort_order: 0,
      } as any);

    if (insertError) {
      toast.error("Erro ao registrar documento: " + insertError.message);
      await supabase.storage.from(BUCKET).remove([storagePath]);
      return false;
    }

    let contentCache: string | null = null;
    try { contentCache = await extractFileText(file); } catch { /* ignore */ }

    const { data: libRow } = await supabase
      .from("document_library" as any)
      .insert({
        storage_path: storagePath,
        file_name: file.name,
        mime_type: file.type || null,
        file_size: file.size,
        content_cache: contentCache,
        is_active: true,
        sort_order: 0,
      } as any)
      .select("id")
      .single();

    if (libRow) {
      await supabase
        .from("agent_document_links" as any)
        .insert({ agent_id: agentId, document_id: (libRow as any).id } as any);
    }

    await load();
    return true;
  };

  const remove = async (doc: AgentDocument): Promise<boolean> => {
    const { error: storageError } = await supabase.storage
      .from(BUCKET)
      .remove([doc.storage_path]);
    if (storageError) {
      console.warn("Storage delete failed (may already be gone):", storageError.message);
    }

    const { error } = await supabase
      .from("agent_documents" as any)
      .delete()
      .eq("id", doc.id);
    if (error) {
      toast.error("Erro ao remover: " + error.message);
      return false;
    }
    setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
    return true;
  };

  const toggleActive = async (doc: AgentDocument): Promise<boolean> => {
    const { error } = await supabase
      .from("agent_documents" as any)
      .update({ is_active: !doc.is_active } as any)
      .eq("id", doc.id);
    if (error) {
      toast.error(error.message);
      return false;
    }
    setDocuments((prev) =>
      prev.map((d) => (d.id === doc.id ? { ...d, is_active: !d.is_active } : d)),
    );
    return true;
  };

  const updateDescription = async (docId: string, description: string): Promise<boolean> => {
    const { error } = await supabase
      .from("agent_documents" as any)
      .update({ description: description || null } as any)
      .eq("id", docId);
    if (error) {
      toast.error(error.message);
      return false;
    }
    setDocuments((prev) =>
      prev.map((d) => (d.id === docId ? { ...d, description: description || null } : d)),
    );
    return true;
  };

  const getDownloadUrl = async (storagePath: string): Promise<string | null> => {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, 3600);
    if (error) {
      toast.error("Erro ao gerar URL: " + error.message);
      return null;
    }
    return data.signedUrl;
  };

  return {
    documents,
    loading,
    upload,
    remove,
    toggleActive,
    updateDescription,
    getDownloadUrl,
    reload: load,
  };
}
