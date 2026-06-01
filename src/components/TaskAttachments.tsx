import { useState, useRef } from "react";
import { useTaskAttachments, type TaskAttachment } from "@/hooks/useTaskAttachments";
import { toast } from "sonner";

interface Props {
  taskId: string;
  canUpload?: boolean;
}

/**
 * V20 — Componente reutilizável de anexos por tarefa.
 *
 * Onde usar:
 *   - MyInbox.tsx (assignee anexa documentos)
 *   - TeamDashboard.tsx (master vê anexos no kanban)
 *   - AssignTask.tsx pode integrar quando criar
 *
 * Visual: lista compacta + dropzone + botão de upload
 * Cores: paleta JurisAI (preto + dourado, sem light mode)
 */
export default function TaskAttachments({ taskId, canUpload = true }: Props) {
  const {
    attachments, loading, uploading, error,
    uploadFile, getDownloadUrl, deleteAttachment, clearError,
  } = useTaskAttachments(taskId);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFiles = async (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      const result = await uploadFile(file);
      if (result) toast.success(`✓ ${file.name} enviado`);
    }
  };

  const handleDownload = async (att: TaskAttachment) => {
    const url = await getDownloadUrl(att.storage_path);
    if (url) {
      // Abre em nova aba pra download/preview
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  const handleDelete = async (att: TaskAttachment) => {
    if (!window.confirm(`Deletar "${att.file_name}"? Não dá pra desfazer.`)) return;
    const ok = await deleteAttachment(att.id);
    if (ok) toast.success("Anexo deletado");
  };

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  const formatDate = (iso: string): string =>
    new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

  const getFileIcon = (mime: string | null): string => {
    if (!mime) return "📎";
    if (mime.startsWith("image/")) return "🖼️";
    if (mime === "application/pdf") return "📄";
    if (mime.includes("word")) return "📝";
    if (mime.includes("sheet") || mime.includes("excel")) return "📊";
    if (mime.startsWith("text/")) return "📃";
    return "📎";
  };

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{
        fontSize: 11, color: "#9898b0",
        letterSpacing: "0.06em", textTransform: "uppercase",
        marginBottom: 8, fontWeight: 600,
      }}>
        Anexos {attachments.length > 0 && `(${attachments.length})`}
      </div>

      {error && (
        <div style={{
          padding: 8, borderRadius: 6, marginBottom: 8,
          background: "rgba(239, 68, 68, 0.1)",
          border: "1px solid rgba(239, 68, 68, 0.3)",
          color: "#fca5a5", fontSize: 12,
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <span>{error}</span>
          <button
            onClick={clearError}
            style={{
              background: "none", border: "none", color: "#fca5a5",
              cursor: "pointer", fontSize: 14, padding: "0 4px",
            }}
          >×</button>
        </div>
      )}

      {/* Lista compacta */}
      {!loading && attachments.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
          {attachments.map(att => (
            <div
              key={att.id}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "8px 10px", borderRadius: 6,
                background: "#16161f", border: "1px solid #25253a",
                fontSize: 13,
              }}
            >
              <span style={{ fontSize: 16, flexShrink: 0 }}>{getFileIcon(att.mime_type)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  color: "#eeeef5", fontWeight: 500,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {att.file_name}
                </div>
                <div style={{ fontSize: 11, color: "#7a7a92", display: "flex", gap: 8 }}>
                  <span>{formatSize(att.file_size_bytes)}</span>
                  <span>·</span>
                  <span>{att.uploader_name}</span>
                  <span>·</span>
                  <span>{formatDate(att.created_at)}</span>
                </div>
              </div>
              <button
                onClick={() => handleDownload(att)}
                title="Baixar"
                style={{
                  padding: "6px 10px", borderRadius: 4,
                  border: "1px solid #eab308", background: "rgba(234, 179, 8, 0.1)",
                  color: "#facc15", fontSize: 11, fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                ↓ Baixar
              </button>
              {att.is_owner && (
                <button
                  onClick={() => handleDelete(att)}
                  title="Deletar"
                  style={{
                    padding: "6px 10px", borderRadius: 4,
                    border: "1px solid #ef4444", background: "rgba(239, 68, 68, 0.1)",
                    color: "#fca5a5", fontSize: 11, fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {loading && (
        <div style={{ fontSize: 12, color: "#7a7a92", padding: 8 }}>Carregando anexos...</div>
      )}

      {/* Dropzone + botão */}
      {canUpload && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
              void handleFiles(e.dataTransfer.files);
            }
          }}
          style={{
            padding: 14, borderRadius: 8, textAlign: "center",
            background: dragOver ? "rgba(234, 179, 8, 0.05)" : "#11111a",
            border: `1px dashed ${dragOver ? "#eab308" : "#34344d"}`,
            transition: "all 0.15s ease",
            cursor: uploading ? "wait" : "pointer",
          }}
          onClick={() => !uploading && fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            style={{ display: "none" }}
            accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,.doc,.docx,.xls,.xlsx,.txt,.csv"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                void handleFiles(e.target.files);
                e.target.value = ""; // permite re-upload do mesmo arquivo
              }
            }}
            disabled={uploading}
          />
          {uploading ? (
            <div style={{ fontSize: 13, color: "#facc15" }}>⏳ Enviando...</div>
          ) : (
            <>
              <div style={{ fontSize: 13, color: "#c4c4d4", marginBottom: 2 }}>
                📎 Anexar arquivo
              </div>
              <div style={{ fontSize: 11, color: "#7a7a92" }}>
                Clique ou arraste · PDF, DOC, XLS, imagens · até 25MB
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
