import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { USER_TASK_STATUS_LABELS } from "@/lib/userTaskLabels";
import type { UserTaskStatus } from "@/types/jurisai";
import {
  type ClientFull, EmptyState, TabLoading, DOCUMENT_TYPE_LABELS, formatDateBR,
} from "../shared";

const PRIORITY_META: Record<string, { label: string; cls: string }> = {
  critical: { label: "Crítica", cls: "d" },
  high: { label: "Alta", cls: "d" },
  medium: { label: "Média", cls: "p" },
  low: { label: "Baixa", cls: "n" },
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
  if (docs.length === 0) return <EmptyState icon="▤" title="Nenhum documento anexado" hint="Documentos enviados no cadastro ou pela recepção aparecem aqui." />;

  return (
    <div className="cli-card lift" style={{ padding: 18 }}>
      <div className="cli-sec-title" style={{ padding: "2px 4px 10px" }}>Documentos · {docs.length}</div>
      {docs.map(doc => (
        <div key={doc.id} className="cli-row">
          <div className="dot">▤</div>
          <div className="body">
            <div className="t">{doc.document_name}</div>
            <div className="s">
              {DOCUMENT_TYPE_LABELS[doc.document_type] || doc.document_type}
              {doc.file_size ? ` · ${(doc.file_size / 1024).toFixed(0)} KB` : ""}
              {` · ${formatDateBR(doc.created_at)}`}
              {doc.notes ? ` · ${doc.notes}` : ""}
            </div>
          </div>
          <button className="go" onClick={() => void openDoc(doc.file_path)} title="Abrir documento">→</button>
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

function TaskRowItem({ task, commentCount }: { task: TaskRow; commentCount: number }) {
  const prio = PRIORITY_META[task.priority] ?? PRIORITY_META.low;
  const deadline = task.deadline_at || task.data_fatal;
  const overdue = deadline ? new Date(deadline) < new Date() : false;
  return (
    <div className="cli-row">
      <div className="dot">◷</div>
      <div className="body">
        <div className="t">{task.title}</div>
        <div className={`s${overdue ? " late" : ""}`}>
          {task.is_pendencia && task.pendencia_tipo ? `${task.pendencia_tipo} · ` : ""}
          {task.is_pendencia && task.pendencia_estado ? `${task.pendencia_estado} · ` : ""}
          {deadline ? `Vence ${formatDateBR(deadline)}` : "Sem prazo"}
          {commentCount > 0 ? ` · ${commentCount} comentário${commentCount > 1 ? "s" : ""}` : ""}
        </div>
      </div>
      <span style={{ marginLeft: "auto", display: "flex", gap: 6, flexShrink: 0 }}>
        {overdue && <span className="cli-chip d">Atrasada</span>}
        <span className={`cli-chip ${prio.cls}`}>{prio.label}</span>
        <span className="cli-chip n">{statusLabel(task.status)}</span>
      </span>
    </div>
  );
}

export function TarefasTab({ client }: { client: ClientFull }) {
  const { tasks, commentCounts } = useClientTasks(client.id);
  if (tasks === null) return <TabLoading />;
  const list = tasks.filter(t => !t.is_pendencia);
  if (list.length === 0) return <EmptyState icon="◷" title="Nenhuma tarefa para este cliente" />;
  return (
    <div className="cli-card lift">
      <div className="cli-sec-title">Tarefas · {list.length}</div>
      {list.map(t => <TaskRowItem key={t.id} task={t} commentCount={commentCounts[t.id] ?? 0} />)}
    </div>
  );
}

export function PendenciasTab({ client }: { client: ClientFull }) {
  const { tasks, commentCounts } = useClientTasks(client.id);
  if (tasks === null) return <TabLoading />;
  const list = tasks.filter(t => t.is_pendencia);
  if (list.length === 0) return <EmptyState icon="⚑" title="Nenhuma pendência registrada" />;
  return (
    <div className="cli-card lift">
      <div className="cli-sec-title">Pendências · {list.length}</div>
      {list.map(t => <TaskRowItem key={t.id} task={t} commentCount={commentCounts[t.id] ?? 0} />)}
    </div>
  );
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
    return <EmptyState icon="⚖" title="Nenhum processo vinculado" hint="Processos são associados pelo nome do cliente. Nenhum registro encontrado." />;
  }
  return (
    <div className="cli-card lift">
      <div className="cli-sec-title">Processos / Ações · {rows.length}</div>
      {rows.map(proc => {
        const overdue = proc.next_hearing_date ? new Date(proc.next_hearing_date) < new Date() : false;
        return (
          <div key={proc.id} className="cli-row">
            <div className="dot">⚖</div>
            <div className="body">
              <div className="t">{proc.process_number}</div>
              <div className={`s${overdue ? " late" : ""}`}>
                {proc.description ? `${proc.description} · ` : ""}
                {proc.responsible_lawyer ? `Resp.: ${proc.responsible_lawyer}` : ""}
                {proc.next_hearing_date ? ` · Audiência ${formatDateBR(proc.next_hearing_date)}` : ""}
              </div>
            </div>
            <span className="cli-chip n" style={{ marginLeft: "auto" }}>{proc.status}</span>
          </div>
        );
      })}
    </div>
  );
}
