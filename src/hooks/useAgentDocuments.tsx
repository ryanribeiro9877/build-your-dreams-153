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

// V24: a "aba Markdown" foi APOSENTADA de agent_documents. O acervo agora vive em
// document_library (texto em content_cache) + agent_document_links (vínculo com o
// agente) — a MESMA fonte que o orquestrador lê para injetar os MODELOS no N3.
// Assim não há dois acervos divergentes.
const BUCKET = "agent-documents";

// Mapeia uma linha de document_library para o shape AgentDocument que a UI espera.
function libToAgentDoc(row: Record<string, unknown>, agentId: string): AgentDocument {
  return {
    id: String(row.id),
    agent_id: agentId,
    uploader_id: "",
    storage_path: String(row.storage_path ?? ""),
    file_name: String(row.file_name ?? ""),
    file_size: Number(row.file_size ?? 0),
    mime_type: (row.mime_type as string | null) ?? null,
    description: (row.description as string | null) ?? null,
    is_active: row.is_active !== false,
    sort_order: Number(row.sort_order ?? 0),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

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
    // Lê os modelos vinculados ao agente via document_library + agent_document_links.
    const { data: links, error: linkErr } = await supabase
      .from("agent_document_links" as any)
      .select("document_id")
      .eq("agent_id", agentId);
    if (linkErr) {
      console.error("agent_document_links load error", linkErr);
      setDocuments([]);
      setLoading(false);
      return;
    }
    const ids = ((links as unknown as { document_id: string }[]) || []).map((l) => l.document_id);
    if (ids.length === 0) {
      setDocuments([]);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from("document_library" as any)
      .select("*")
      .in("id", ids)
      .order("sort_order")
      .order("created_at", { ascending: false });
    if (error) {
      console.error("document_library load error", error);
      setDocuments([]);
    } else {
      setDocuments(((data as unknown as Record<string, unknown>[]) || []).map((r) => libToAgentDoc(r, agentId)));
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

    // Extrai o texto na ingestão (md/txt direto, .docx mammoth, .pdf pdf.js) e
    // grava direto em document_library — única fonte do acervo de modelos.
    let contentCache: string | null = null;
    try { contentCache = await extractFileText(file); } catch { /* extração best-effort */ }

    const { data: libRow, error: libErr } = await supabase
      .from("document_library" as any)
      .insert({
        storage_path: storagePath,
        file_name: file.name,
        mime_type: file.type || null,
        file_size: file.size,
        description: description || null,
        content_cache: contentCache,
        is_active: true,
        sort_order: 0,
      } as any)
      .select("id")
      .single();

    if (libErr || !libRow) {
      toast.error("Erro ao registrar documento: " + (libErr?.message || "sem retorno"));
      await supabase.storage.from(BUCKET).remove([storagePath]);
      return false;
    }

    const { error: linkErr } = await supabase
      .from("agent_document_links" as any)
      .insert({ agent_id: agentId, document_id: (libRow as unknown as { id: string }).id } as any);
    if (linkErr) {
      toast.error("Erro ao vincular documento ao agente: " + linkErr.message);
      await supabase.from("document_library" as any).delete().eq("id", (libRow as unknown as { id: string }).id);
      await supabase.storage.from(BUCKET).remove([storagePath]);
      return false;
    }

    if (!contentCache || !contentCache.trim()) {
      toast.warning(`"${file.name}" foi salvo, mas não foi possível extrair texto legível (use PDF/DOCX/TXT pesquisável).`);
    }

    await load();
    return true;
  };

  const remove = async (doc: AgentDocument): Promise<boolean> => {
    // Remove o vínculo deste agente; se nenhum outro agente usar o documento,
    // apaga a linha de document_library e o objeto no storage.
    const { error: linkErr } = await supabase
      .from("agent_document_links" as any)
      .delete()
      .eq("agent_id", agentId)
      .eq("document_id", doc.id);
    if (linkErr) {
      toast.error("Erro ao remover: " + linkErr.message);
      return false;
    }

    const { data: remaining } = await supabase
      .from("agent_document_links" as any)
      .select("agent_id")
      .eq("document_id", doc.id);
    const stillLinked = ((remaining as unknown[]) || []).length > 0;

    if (!stillLinked) {
      await supabase.from("document_library" as any).delete().eq("id", doc.id);
      if (doc.storage_path) {
        const { error: storageError } = await supabase.storage.from(BUCKET).remove([doc.storage_path]);
        if (storageError) console.warn("Storage delete failed (may already be gone):", storageError.message);
      }
    }

    setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
    return true;
  };

  const toggleActive = async (doc: AgentDocument): Promise<boolean> => {
    const { error } = await supabase
      .from("document_library" as any)
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
      .from("document_library" as any)
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
