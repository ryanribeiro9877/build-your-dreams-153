import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { USER_TASK_STATUS_LABELS } from "@/lib/userTaskLabels";
import type { UserTaskStatus } from "@/types/jurisai";
import {
  type ClientFull, EmptyState, TabLoading, formatDateBR,
  DOCUMENT_TYPE_LABELS, DOCUMENT_TYPE_OPTIONS,
  DOC_STATUS_META, DOC_ORIGEM_LABELS, DOC_ORIGEM_OPTIONS,
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
  status: string; origem: string | null;
}

interface DocEvent {
  id: string; document_id: string | null; event: string;
  at: string; details: Record<string, unknown> | null;
}

// Statuses que a aba deixa a recepção/sócio alternar. Validação/rejeição fina
// (quem pode validar) fica para o card de Validação — aqui a policy de UPDATE
// só habilita a mudança de status por recepção/sócio.
const STATUS_CYCLE = ["pendente", "recebido", "validado", "rejeitado"] as const;

function statusBadge(status: string) {
  const meta = DOC_STATUS_META[status] ?? { label: status, cls: "n" };
  return <span className={`cli-chip ${meta.cls}`}>{meta.label}</span>;
}

function eventLabel(ev: DocEvent): string {
  const d = ev.details ?? {};
  const name = typeof d.document_name === "string" ? ` · ${d.document_name}` : "";
  switch (ev.event) {
    case "upload": return `Enviado${name}`;
    case "exclusao": return `Excluído${name}`;
    case "validacao": return "Validado";
    case "rejeicao": return "Rejeitado";
    case "status_change": return `Status: ${d.from ?? "?"} → ${d.to ?? "?"}`;
    default: return ev.event;
  }
}

export function DocumentosTab({ client }: { client: ClientFull }) {
  const { user } = useAuth();
  const [docs, setDocs] = useState<DocRow[] | null>(null);
  const [events, setEvents] = useState<DocEvent[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Upload form state
  const [file, setFile] = useState<File | null>(null);
  const [upType, setUpType] = useState<string>(DOCUMENT_TYPE_OPTIONS[0].value);
  const [upOrigem, setUpOrigem] = useState<string>(DOC_ORIGEM_OPTIONS[0].value);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    const [docsRes, evRes] = await Promise.all([
      supabase.from("client_documents")
        .select("id, document_name, document_type, file_path, file_size, notes, created_at, status, origem")
        .eq("client_id", client.id)
        .order("created_at", { ascending: false }),
      supabase.from("client_document_events")
        .select("id, document_id, event, at, details")
        .eq("client_id", client.id)
        .order("at", { ascending: false }),
    ]);
    if (docsRes.error) { toast.error("Erro ao carregar documentos"); setDocs([]); return; }
    setDocs((docsRes.data as DocRow[]) ?? []);
    setEvents((evRes.data as DocEvent[]) ?? []);
  }, [client.id]);

  useEffect(() => { void load(); }, [load]);

  async function openDoc(filePath: string) {
    const { data, error } = await supabase.storage.from("client-documents").createSignedUrl(filePath, 60);
    if (error || !data?.signedUrl) { toast.error("Não foi possível abrir o documento"); return; }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function handleUpload() {
    if (!file || !user) { toast.error("Selecione um arquivo"); return; }
    setUploading(true);
    const filePath = `${client.id}/${Date.now()}_${file.name}`;
    const { error: upErr } = await supabase.storage.from("client-documents").upload(filePath, file);
    if (upErr) { toast.error(`Erro ao enviar: ${upErr.message}`); setUploading(false); return; }
    const { error } = await supabase.from("client_documents").insert({
      client_id: client.id, client_name: client.full_name,
      document_type: upType, document_name: file.name,
      file_path: filePath, file_size: file.size, mime_type: file.type || null,
      origem: upOrigem, uploaded_by: user.id,
    });
    if (error) {
      // limpa o binário órfão se o registro falhar
      await supabase.storage.from("client-documents").remove([filePath]);
      toast.error(`Erro ao registrar documento: ${error.message}`);
    } else {
      toast.success("Documento enviado");
      setFile(null);
      setUpType(DOCUMENT_TYPE_OPTIONS[0].value);
      setUpOrigem(DOC_ORIGEM_OPTIONS[0].value);
      await load();
    }
    setUploading(false);
  }

  async function changeStatus(doc: DocRow, status: string) {
    if (status === doc.status) return;
    setBusyId(doc.id);
    const { error } = await supabase.from("client_documents").update({ status }).eq("id", doc.id);
    if (error) toast.error(`Não foi possível alterar o status: ${error.message}`);
    else await load();
    setBusyId(null);
  }

  if (docs === null) return <TabLoading />;

  const docEvents = (docId: string) => events.filter(e => e.document_id === docId);

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {/* Upload */}
      <div className="cli-card lift" style={{ padding: 18 }}>
        <div className="cli-sec-title" style={{ padding: "2px 4px 10px" }}>Anexar documento</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
          <div style={{ flex: "1 1 220px" }}>
            <label className="cli-label">Arquivo</label>
            <input className="cli-input file" type="file"
              onChange={e => setFile(e.target.files?.[0] ?? null)} />
          </div>
          <div style={{ flex: "0 1 180px" }}>
            <label className="cli-label">Tipo</label>
            <select className="cli-select" value={upType} onChange={e => setUpType(e.target.value)}>
              {DOCUMENT_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div style={{ flex: "0 1 160px" }}>
            <label className="cli-label">Origem</label>
            <select className="cli-select" value={upOrigem} onChange={e => setUpOrigem(e.target.value)}>
              {DOC_ORIGEM_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <button className="cli-btn sm" disabled={!file || uploading} onClick={() => void handleUpload()}>
            {uploading ? "Enviando…" : "Enviar"}
          </button>
        </div>
      </div>

      {/* Lista */}
      <div className="cli-card lift" style={{ padding: 18 }}>
        <div className="cli-sec-title" style={{ padding: "2px 4px 10px" }}>Documentos · {docs.length}</div>
        {docs.length === 0
          ? <EmptyState icon="▤" title="Nenhum documento anexado" hint="Documentos enviados no cadastro ou pela recepção aparecem aqui." />
          : docs.map(doc => {
            const evs = docEvents(doc.id);
            const open = expanded === doc.id;
            return (
              <div key={doc.id}>
                <div className="cli-row">
                  <div className="dot">▤</div>
                  <div className="body">
                    <div className="t">{doc.document_name}</div>
                    <div className="s">
                      {DOCUMENT_TYPE_LABELS[doc.document_type] || doc.document_type}
                      {doc.origem ? ` · ${DOC_ORIGEM_LABELS[doc.origem] ?? doc.origem}` : ""}
                      {doc.file_size ? ` · ${(doc.file_size / 1024).toFixed(0)} KB` : ""}
                      {` · ${formatDateBR(doc.created_at)}`}
                      {doc.notes ? ` · ${doc.notes}` : ""}
                    </div>
                  </div>
                  <span style={{ display: "flex", gap: 8, alignItems: "center", marginLeft: "auto", flexShrink: 0 }}>
                    {statusBadge(doc.status)}
                    <select className="cli-select" style={{ padding: "6px 26px 6px 10px", fontSize: 12 }}
                      value={doc.status} disabled={busyId === doc.id}
                      onChange={e => void changeStatus(doc, e.target.value)}
                      title="Alterar status">
                      {STATUS_CYCLE.map(s => <option key={s} value={s}>{DOC_STATUS_META[s].label}</option>)}
                    </select>
                    {evs.length > 0 && (
                      <button className="go" onClick={() => setExpanded(open ? null : doc.id)}
                        title="Histórico do documento" aria-expanded={open}>{open ? "▾" : "≡"}</button>
                    )}
                    <button className="go" onClick={() => void openDoc(doc.file_path)} title="Abrir documento">→</button>
                  </span>
                </div>
                {open && evs.length > 0 && (
                  <div style={{ padding: "4px 4px 12px 44px", display: "grid", gap: 4 }}>
                    {evs.map(ev => (
                      <div key={ev.id} className="s" style={{ fontSize: 12 }}>
                        {eventLabel(ev)} · {formatDateBR(ev.at)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
      </div>

      {/* Histórico do cliente (inclui exclusões de documentos removidos) */}
      {events.length > 0 && (
        <div className="cli-card lift" style={{ padding: 18 }}>
          <button className="cli-sec-title" style={{ padding: "2px 4px 10px", background: "none", border: 0, cursor: "pointer", width: "100%", textAlign: "left" }}
            onClick={() => setShowHistory(h => !h)} aria-expanded={showHistory}>
            Histórico · {events.length} {showHistory ? "▾" : "▸"}
          </button>
          {showHistory && (
            <div style={{ display: "grid", gap: 4 }}>
              {events.map(ev => (
                <div key={ev.id} className="cli-row" style={{ padding: "8px 4px" }}>
                  <div className="dot">•</div>
                  <div className="body">
                    <div className="t" style={{ fontSize: 13 }}>{eventLabel(ev)}</div>
                    <div className="s">{formatDateBR(ev.at)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
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
