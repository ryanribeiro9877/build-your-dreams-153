import { useState } from "react";
import { useAgentDocuments, type AgentDocument } from "@/hooks/useAgentDocuments";
import { toast } from "sonner";
import { HexagonLoader } from "@/components/HexagonLoader";

export function TabMarkdown({ agentId }: { agentId: string }) {
  const { documents, loading, upload, remove, toggleActive, updateDescription, getDownloadUrl } =
    useAgentDocuments(agentId);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [editingDesc, setEditingDesc] = useState<string | null>(null);
  const [descDraft, setDescDraft] = useState("");

  const handleFiles = async (files: FileList | File[]) => {
    setUploading(true);
    for (const file of Array.from(files)) {
      const ok = await upload(file);
      if (ok) toast.success(`${file.name} enviado`);
    }
    setUploading(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) handleFiles(e.target.files);
    e.target.value = "";
  };

  const handleDownload = async (doc: AgentDocument) => {
    const url = await getDownloadUrl(doc.storage_path);
    if (url) window.open(url, "_blank");
  };

  const handleRemove = async (doc: AgentDocument) => {
    if (!confirm(`Remover "${doc.file_name}" permanentemente?`)) return;
    const ok = await remove(doc);
    if (ok) toast.success("Documento removido");
  };

  const startEditDesc = (doc: AgentDocument) => {
    setEditingDesc(doc.id);
    setDescDraft(doc.description || "");
  };

  const saveDesc = async (docId: string) => {
    await updateDescription(docId, descDraft);
    setEditingDesc(null);
    toast.success("Descricao atualizada");
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const extIcon = (name: string) => {
    const ext = name.split(".").pop()?.toLowerCase() || "";
    if (ext === "pdf") return "\u{1F4C4}";
    if (ext === "docx") return "\u{1F4DD}";
    if (ext === "md" || ext === "markdown") return "\u{1F4D1}";
    return "\u{1F4C3}";
  };

  if (loading) return <HexagonLoader variant="inline" label="Carregando documentos..." />;

  return (
    <div>
      {/* Upload zone */}
      <div className="lf-panel">
        <h2 className="lf-panel__title">
          Arquivos de Referencia
          <span className="lf-badge lf-badge--neutral lf-badge--mono">
            {documents.length} arquivo{documents.length !== 1 ? "s" : ""}
          </span>
        </h2>
        <p className="lf-panel__hint">
          Envie arquivos de texto (.txt, .md, .pdf, .docx) que servem como base de conhecimento
          para este agente. O conteudo sera injetado no contexto das conversas, permitindo que o
          agente siga modelos, templates e instrucoes especificas.
        </p>

        {/* Dica de uso */}
        <div
          className="lf-panel lf-panel--ghost"
          style={{
            background: "rgba(92, 194, 255, 0.06)",
            border: "1px solid rgba(92, 194, 255, 0.25)",
            padding: 12,
            margin: "0 0 14px",
            fontSize: 12,
          }}
        >
          <strong style={{ color: "var(--lf-info, #5cc2ff)" }}>Como usar.</strong>{" "}
          Faca upload de modelos de pecas, templates de documentos ou instrucoes detalhadas.
          Na aba <strong>Prompt</strong>, instrua o agente a seguir o conteudo dos documentos
          carregados. Ex: <em>"Crie a peca inicial seguindo o modelo fornecido nos documentos
          de referencia."</em>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          style={{
            border: `2px dashed ${dragOver ? "var(--lf-gold)" : "hsl(var(--border))"}`,
            borderRadius: 10,
            padding: "28px 20px",
            textAlign: "center",
            background: dragOver ? "rgba(201, 168, 76, 0.08)" : "transparent",
            transition: "all 200ms ease",
            cursor: "pointer",
            marginBottom: 16,
          }}
          onClick={() => document.getElementById("md-file-input")?.click()}
        >
          <div style={{ fontSize: 28, marginBottom: 6, opacity: 0.6 }}>
            {uploading ? "⏳" : "\u{1F4E4}"}
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
            {uploading ? "Enviando..." : "Arraste arquivos aqui ou clique para selecionar"}
          </div>
          <div style={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}>
            .txt, .md, .markdown, .pdf, .docx — ate 10 MB por arquivo
          </div>
          <input
            id="md-file-input"
            type="file"
            multiple
            accept=".txt,.md,.markdown,.pdf,.docx"
            onChange={handleFileInput}
            style={{ display: "none" }}
          />
        </div>
      </div>

      {/* Lista de documentos */}
      {documents.length > 0 && (
        <div className="lf-panel" style={{ marginTop: 16 }}>
          <h3 className="lf-panel__title">
            Documentos Carregados
          </h3>
          <p className="lf-panel__hint" style={{ marginBottom: 16 }}>
            Documentos ativos sao incluidos no contexto do agente durante as conversas.
            Desative um documento para mante-lo salvo sem injeta-lo no contexto.
          </p>

          <div style={{ display: "grid", gap: 10 }}>
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="lf-panel lf-panel--ghost"
                style={{
                  border: doc.is_active
                    ? "1px solid rgba(45, 212, 160, 0.4)"
                    : "1px solid hsl(var(--border))",
                  background: "hsl(var(--card))",
                  padding: 14,
                  margin: 0,
                  opacity: doc.is_active ? 1 : 0.6,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 12,
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="lf-row" style={{ gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 18 }}>{extIcon(doc.file_name)}</span>
                      <strong style={{ fontSize: 13, wordBreak: "break-word" }}>
                        {doc.file_name}
                      </strong>
                      {doc.is_active ? (
                        <span className="lf-badge lf-badge--success">Ativo</span>
                      ) : (
                        <span
                          className="lf-badge"
                          style={{ background: "rgba(156,163,175,0.15)", color: "#9ca3af" }}
                        >
                          Inativo
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "hsl(var(--muted-foreground))",
                        display: "flex",
                        gap: 12,
                        flexWrap: "wrap",
                      }}
                    >
                      <span>{formatSize(doc.file_size)}</span>
                      <span>{doc.mime_type || "—"}</span>
                      <span>{new Date(doc.created_at).toLocaleDateString("pt-BR")}</span>
                    </div>

                    {/* Descricao */}
                    {editingDesc === doc.id ? (
                      <div style={{ marginTop: 8, display: "flex", gap: 6, alignItems: "center" }}>
                        <input
                          className="lf-input"
                          style={{ fontSize: 12, padding: "5px 10px", flex: 1 }}
                          value={descDraft}
                          onChange={(e) => setDescDraft(e.target.value)}
                          placeholder="Descricao do documento..."
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveDesc(doc.id);
                            if (e.key === "Escape") setEditingDesc(null);
                          }}
                        />
                        <button
                          type="button"
                          className="lf-btn lf-btn--primary"
                          style={{ fontSize: 11, padding: "4px 10px" }}
                          onClick={() => saveDesc(doc.id)}
                        >
                          Salvar
                        </button>
                        <button
                          type="button"
                          className="lf-btn lf-btn--ghost"
                          style={{ fontSize: 11, padding: "4px 10px" }}
                          onClick={() => setEditingDesc(null)}
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <div
                        style={{
                          marginTop: 6,
                          fontSize: 11,
                          color: doc.description
                            ? "hsl(var(--foreground))"
                            : "hsl(var(--muted-foreground))",
                          cursor: "pointer",
                          fontStyle: doc.description ? "normal" : "italic",
                        }}
                        onClick={() => startEditDesc(doc)}
                        title="Clique para editar a descricao"
                      >
                        {doc.description || "Clique para adicionar uma descricao..."}
                      </div>
                    )}
                  </div>

                  <div className="lf-row" style={{ gap: 6, flexShrink: 0 }}>
                    <button
                      type="button"
                      className="lf-btn lf-btn--ghost"
                      style={{ padding: "6px 10px", fontSize: 11 }}
                      onClick={() => handleDownload(doc)}
                      title="Baixar arquivo"
                    >
                      Baixar
                    </button>
                    <button
                      type="button"
                      className="lf-btn lf-btn--ghost"
                      style={{ padding: "6px 10px", fontSize: 11 }}
                      onClick={() => toggleActive(doc)}
                    >
                      {doc.is_active ? "Desativar" : "Ativar"}
                    </button>
                    <button
                      type="button"
                      className="lf-btn lf-btn--danger-ghost"
                      style={{ padding: "6px 10px", fontSize: 11 }}
                      onClick={() => handleRemove(doc)}
                    >
                      Remover
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ==================================================================
   TAB TOOLS — Habilidades do agente
   ================================================================== */
