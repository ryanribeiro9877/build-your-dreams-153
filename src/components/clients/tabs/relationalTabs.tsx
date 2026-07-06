import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { USER_TASK_STATUS_LABELS } from "@/lib/userTaskLabels";
import type { UserTaskStatus } from "@/types/jurisai";
import {
  type ClientFull, EmptyState, TabLoading, DOCUMENT_TYPE_LABELS, formatDateBR,
} from "../shared";

const rowStyle: React.CSSProperties = {
  padding: 14, borderRadius: 10, marginBottom: 8,
  background: "var(--bg)", border: "1px solid var(--border)",
};
const badge = (bg: string, color: string): React.CSSProperties => ({
  padding: "2px 10px", borderRadius: 6, fontSize: 10, fontWeight: 600,
  background: bg, color, textTransform: "uppercase", letterSpacing: "0.04em",
});

const PRIORITY_META: Record<string, { label: string; bg: string; color: string }> = {
  critical: { label: "Crítica", bg: "rgba(239,68,68,0.15)", color: "#ef4444" },
  high: { label: "Alta", bg: "rgba(251,146,60,0.15)", color: "#fb923c" },
  medium: { label: "Média", bg: "rgba(59,130,246,0.15)", color: "#3b82f6" },
  low: { label: "Baixa", bg: "rgba(107,114,128,0.15)", color: "#9ca3af" },
};
const statusLabel = (s: string) => USER_TASK_STATUS_LABELS[s as UserTaskStatus] ?? s;

/* ---------- Documentos (client_documents) ---------- */

interface DocRow {
  id: string; document_name: string; document_type: string;
  file_path: string; file_size: number | null; notes: string | null; created_at: string;
}

export function DocumentosTab({ client }: { client: ClientFull }) {
  const [docs, setDocs] = useState<DocRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.from("client_documents")
        .select("id, document_name, document_type, file_path, file_size, notes, created_at")
        .eq("client_id", client.id)
        .order("created_at", { ascending: false });
      if (cancelled) return;
      if (error) { toast.error("Erro ao carregar documentos"); setDocs([]); return; }
      setDocs((data as DocRow[]) ?? []);
    })();
    return () => { cancelled = true; };
  }, [client.id]);

  async function openDoc(filePath: string) {
    const { data, error } = await supabase.storage.from("client-documents").createSignedUrl(filePath, 60);
    if (error || !data?.signedUrl) { toast.error("Não foi possível abrir o documento"); return; }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  if (docs === null) return <TabLoading />;
  if (docs.length === 0) return <EmptyState title="Nenhum documento anexado" hint="Documentos enviados no cadastro ou pela recepção aparecem aqui." />;

  return (
    <div>
      {docs.map(doc => (
        <div key={doc.id} style={{ ...rowStyle, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.document_name}</div>
            <div style={{ fontSize: 10, color: "var(--text3)", marginTop: 2 }}>
              {DOCUMENT_TYPE_LABELS[doc.document_type] || doc.document_type}
              {doc.file_size ? ` · ${(doc.file_size / 1024).toFixed(0)} KB` : ""}
              {` · ${formatDateBR(doc.created_at)}`}
            </div>
            {doc.notes && <div style={{ fontSize: 10, color: "var(--text2)", marginTop: 2 }}>{doc.notes}</div>}
          </div>
          <button onClick={() => void openDoc(doc.file_path)} style={{
            padding: "6px 12px", borderRadius: 6, border: "1px solid rgba(201,168,76,0.3)",
            background: "rgba(201,168,76,0.1)", color: "#c9a84c", cursor: "pointer", fontSize: 11,
            fontFamily: "'DM Sans', sans-serif", flexShrink: 0,
          }}>Abrir</button>
        </div>
      ))}
    </div>
  );
}

/* ---------- Tarefas / Pendências (user_tasks) ---------- */

interface TaskRow {
  id: string; title: string; description: string | null;
  status: string; priority: string; deadline_at: string | null; data_fatal: string | null;
  is_pendencia: boolean; pendencia_tipo: string | null; pendencia_estado: string | null;
  created_at: string;
}

// Uma única busca em user_tasks por cliente; a UI separa tarefas de pendências
// pela flag `is_pendencia` (não há tabela dedicada de pendências).
function useClientTasks(clientId: string) {
  const [tasks, setTasks] = useState<TaskRow[] | null>(null);
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.from("user_tasks")
        .select("id, title, description, status, priority, deadline_at, data_fatal, is_pendencia, pendencia_tipo, pendencia_estado, created_at")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });
      if (cancelled) return;
      if (error) { setTasks([]); return; }
      const rows = (data as TaskRow[]) ?? [];
      setTasks(rows);
      // Contagem de comentários — uma consulta para todos os ids.
      if (rows.length > 0) {
        const { data: comments } = await supabase.from("user_task_comments")
          .select("user_task_id").in("user_task_id", rows.map(r => r.id));
        if (cancelled) return;
        const counts: Record<string, number> = {};
        (comments as { user_task_id: string }[] | null)?.forEach(c => {
          counts[c.user_task_id] = (counts[c.user_task_id] || 0) + 1;
        });
        setCommentCounts(counts);
      }
    })();
    return () => { cancelled = true; };
  }, [clientId]);

  return { tasks, commentCounts };
}

function TaskCard({ task, commentCount }: { task: TaskRow; commentCount: number }) {
  const prio = PRIORITY_META[task.priority] ?? PRIORITY_META.low;
  const deadline = task.deadline_at || task.data_fatal;
  const overdue = deadline ? new Date(deadline) < new Date() : false;
  return (
    <div style={rowStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text1)", marginBottom: 4 }}>{task.title}</div>
          {task.description && <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 6 }}>{task.description}</div>}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", fontSize: 10, color: "var(--text3)" }}>
            {task.is_pendencia && task.pendencia_tipo && <span>Tipo: {task.pendencia_tipo}</span>}
            {task.is_pendencia && task.pendencia_estado && <span>Estado: {task.pendencia_estado}</span>}
            {deadline && (
              <span style={{ color: overdue ? "#ef4444" : "var(--text3)" }}>
                Prazo: {formatDateBR(deadline)}
              </span>
            )}
            {commentCount > 0 && <span>{commentCount} comentário{commentCount > 1 ? "s" : ""}</span>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          <span style={badge(prio.bg, prio.color)}>{prio.label}</span>
          <span style={badge("rgba(107,114,128,0.15)", "#9ca3af")}>{statusLabel(task.status)}</span>
        </div>
      </div>
    </div>
  );
}

export function TarefasTab({ client }: { client: ClientFull }) {
  const { tasks, commentCounts } = useClientTasks(client.id);
  if (tasks === null) return <TabLoading />;
  const list = tasks.filter(t => !t.is_pendencia);
  if (list.length === 0) return <EmptyState title="Nenhuma tarefa para este cliente" />;
  return <div>{list.map(t => <TaskCard key={t.id} task={t} commentCount={commentCounts[t.id] ?? 0} />)}</div>;
}

export function PendenciasTab({ client }: { client: ClientFull }) {
  const { tasks, commentCounts } = useClientTasks(client.id);
  if (tasks === null) return <TabLoading />;
  const list = tasks.filter(t => t.is_pendencia);
  if (list.length === 0) return <EmptyState title="Nenhuma pendência registrada" />;
  return <div>{list.map(t => <TaskCard key={t.id} task={t} commentCount={commentCounts[t.id] ?? 0} />)}</div>;
}

/* ---------- Processos / Ações (processes por client_name) ---------- */

interface ProcessRow {
  id: string; process_number: string; description: string | null;
  responsible_lawyer: string | null; next_hearing_date: string | null; status: string;
}

export function ProcessosTab({ client }: { client: ClientFull }) {
  const [rows, setRows] = useState<ProcessRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // `processes` não tem FK para `clients`; o vínculo existente é por
      // `client_name` (texto). Renderizamos por esse vínculo, sem inventar outro.
      const { data, error } = await supabase.from("processes")
        .select("id, process_number, description, responsible_lawyer, next_hearing_date, status")
        .eq("client_name", client.full_name)
        .order("created_at", { ascending: false });
      if (cancelled) return;
      if (error) { setRows([]); return; }
      setRows((data as ProcessRow[]) ?? []);
    })();
    return () => { cancelled = true; };
  }, [client.full_name]);

  if (rows === null) return <TabLoading />;
  if (rows.length === 0) {
    return <EmptyState title="Nenhum processo vinculado" hint="Processos são associados pelo nome do cliente. Nenhum registro encontrado." />;
  }
  return (
    <div>
      {rows.map(proc => {
        const overdue = proc.next_hearing_date ? new Date(proc.next_hearing_date) < new Date() : false;
        return (
          <div key={proc.id} style={rowStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text1)", marginBottom: 4 }}>{proc.process_number}</div>
                {proc.description && <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 6 }}>{proc.description}</div>}
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 10, color: "var(--text3)" }}>
                  {proc.responsible_lawyer && <span>Responsável: {proc.responsible_lawyer}</span>}
                  {proc.next_hearing_date && (
                    <span style={{ color: overdue ? "#ef4444" : "var(--text3)" }}>
                      Próxima audiência: {formatDateBR(proc.next_hearing_date)}
                    </span>
                  )}
                </div>
              </div>
              <span style={badge("rgba(107,114,128,0.15)", "#9ca3af")}>{proc.status}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
