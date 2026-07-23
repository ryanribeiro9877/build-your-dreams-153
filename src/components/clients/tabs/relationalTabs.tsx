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

function statusBadge(status: string, origem?: string | null) {
  // Documento GERADO pelo sistema e ainda "pendente" = aguardando a assinatura/
  // retorno do cliente — o rótulo cru "Pendente" confunde (parece documento em falta).
  if (origem === "sistema" && status === "pendente") {
    return <span className="cli-chip p">Aguardando assinatura/retorno</span>;
  }
  const meta = DOC_STATUS_META[status] ?? { label: status, cls: "n" };
  return <span className={`cli-chip ${meta.cls}`}>{meta.label}</span>;
}

// OCR só faz sentido em imagem (a edge usa visão; PDF fica de fora). Deriva pela
// extensão do file_path (o mime não vem nesta listagem).
function isImageDoc(filePath: string): boolean {
  return /\.(png|jpe?g|webp|gif|bmp)$/i.test(filePath || "");
}

function eventLabel(ev: DocEvent): string {
  const d = ev.details ?? {};
  const name = typeof d.document_name === "string" ? ` · ${d.document_name}` : "";
  switch (ev.event) {
    case "upload": {
      // "upload" é o tipo cru do evento — não diz nada ao usuário. Mostra o NOME do
      // documento + a ORIGEM: gerado pelo sistema (aguardando assinatura) vs. enviado.
      const nm = typeof d.document_name === "string" && d.document_name ? d.document_name : "documento";
      const orig = d.origem;
      if (orig === "sistema") return `Gerado pelo sistema — ${nm}`;
      const quem = orig === "cliente" ? "pelo cliente"
        : orig === "recepcao" ? "pela recepção"
        : orig === "advogado" ? "pelo advogado" : null;
      return quem ? `Enviado ${quem} — ${nm}` : `Enviado — ${nm}`;
    }
    case "exclusao": return `Excluído${name}`;
    case "validacao": return "Validado";
    case "rejeicao": return "Rejeitado";
    case "status_change": return `Status: ${d.from ?? "?"} → ${d.to ?? "?"}`;
    default: return ev.event;
  }
}

// Token do tipo do documento associado ao evento. Preferir o `details` (o trigger
// de upload grava o tipo ali e ele sobrevive à exclusão do doc); fallback: cruzar
// por document_id → client_documents.document_type quando o doc ainda existir.
function eventDocType(ev: DocEvent, docs: DocRow[]): string | null {
  const fromDetails = ev.details?.document_type;
  if (typeof fromDetails === "string") return fromDetails;
  if (ev.document_id) {
    const doc = docs.find(d => d.id === ev.document_id);
    if (doc) return doc.document_type;
  }
  return null;
}

export function DocumentosTab({ client }: { client: ClientFull }) {
  const { user } = useAuth();
  const [docs, setDocs] = useState<DocRow[] | null>(null);
  const [events, setEvents] = useState<DocEvent[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [ocrBusyId, setOcrBusyId] = useState<string | null>(null);

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

  // Extrai dados do documento via OCR (edge ocr-client-document). force=true para
  // reprocessar mesmo com notes já preenchido. Preenche notes + campos vazios do
  // cadastro; o resultado aparece ao recarregar.
  async function runOcr(doc: DocRow) {
    setOcrBusyId(doc.id);
    try {
      const { data, error } = await supabase.functions.invoke("ocr-client-document", {
        body: { documentId: doc.id, force: true },
      });
      if (error) { toast.error(`Falha no OCR: ${error.message}`); return; }
      const res = data as { ok?: boolean; reason?: string; chars?: number; fieldsApplied?: number };
      if (res?.ok) {
        const applied = res.fieldsApplied ?? 0;
        toast.success(
          `OCR concluído${applied > 0 ? ` · ${applied} campo${applied > 1 ? "s" : ""} do cadastro preenchido${applied > 1 ? "s" : ""}` : ""}`,
        );
        await load();
      } else if (res?.reason === "ocr_disabled") {
        toast.error("OCR está desligado (flag OCR_ENABLED).");
      } else if (res?.reason === "empty_extraction") {
        toast.error("Não foi possível ler texto na imagem.");
      } else {
        toast.error(`OCR não processou: ${res?.reason ?? "erro"}`);
      }
    } catch (e) {
      toast.error(`Falha no OCR: ${e instanceof Error ? e.message : "erro"}`);
    } finally {
      setOcrBusyId(null);
    }
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
                      {doc.notes && doc.document_type !== "audio_atendimento" && doc.document_type !== "resumo_atendimento" ? ` · ${doc.notes}` : ""}
                    </div>
                  </div>
                  <span style={{ display: "flex", gap: 8, alignItems: "center", marginLeft: "auto", flexShrink: 0 }}>
                    {statusBadge(doc.status, doc.origem)}
                    <select className="cli-select" style={{ padding: "6px 26px 6px 10px", fontSize: 12 }}
                      value={doc.status} disabled={busyId === doc.id}
                      onChange={e => void changeStatus(doc, e.target.value)}
                      title="Alterar status">
                      {STATUS_CYCLE.map(s => <option key={s} value={s}>{DOC_STATUS_META[s].label}</option>)}
                    </select>
                    {isImageDoc(doc.file_path) && (
                      <button className="cli-btn sm ghost" style={{ padding: "6px 10px", fontSize: 12 }}
                        disabled={ocrBusyId === doc.id}
                        onClick={() => void runOcr(doc)}
                        title="Ler o documento e preencher dados do cadastro">
                        {ocrBusyId === doc.id ? "Processando…" : (doc.notes ? "Reprocessar OCR" : "Extrair dados (OCR)")}
                      </button>
                    )}
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
              {events.map(ev => {
                const typeToken = eventDocType(ev, docs);
                const typeLabel = typeToken ? (DOCUMENT_TYPE_LABELS[typeToken] ?? typeToken) : null;
                return (
                  <div key={ev.id} className="cli-row" style={{ padding: "8px 4px", flexWrap: "wrap" }}>
                    <div className="dot">•</div>
                    <div className="body">
                      <div className="t" style={{ fontSize: 13 }}>{eventLabel(ev)}</div>
                      <div className="s">{formatDateBR(ev.at)}</div>
                    </div>
                    {typeLabel && (
                      <span style={{
                        marginLeft: "auto", alignSelf: "center", paddingLeft: 12,
                        fontWeight: 800, textTransform: "uppercase", color: "var(--cli-ink)",
                        fontSize: 12, letterSpacing: ".4px", textAlign: "right",
                      }}>{typeLabel}</span>
                    )}
                  </div>
                );
              })}
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
  if (list.length === 0) return <EmptyState icon="⚑" title="Nenhuma pendência registrada" hint="Pendências de documentos ficam na aba Documentos (checklist e status de cada documento)." />;
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
  tipo_acao_id: string | null;
}

interface TipoAcaoRow { id: string; nome: string }

// Escape hatch tipado: `tipos_acao`, a coluna `processes.tipo_acao_id` e a RPC
// `definir_tipo_acao_processo` ainda não estão nos tipos gerados (desync
// repo↔banco). Mesmo padrão de useAudiencias.ts — evita `any` e não mexe no
// types.ts (que é regenerado por outra via).
type UntypedResult<T> = Promise<{ data: T | null; error: { message?: string; code?: string } | null }>;
const sb = supabase as unknown as {
  from: (t: string) => {
    select: (c: string) => {
      eq: (k: string, v: unknown) => { order: (k: string, o: { ascending: boolean }) => UntypedResult<unknown[]> };
      order: (k: string, o?: { ascending: boolean }) => UntypedResult<unknown[]>;
    };
  };
  rpc: (fn: string, args: Record<string, unknown>) => UntypedResult<unknown>;
};

// Modal de detalhe do processo. Único ponto editável é o tipo de ação — o gate
// de distribuição (§24.1 / distribuir_caso) exige processes.tipo_acao_id
// preenchido. A escrita passa pela RPC definir_tipo_acao_processo (SECURITY
// DEFINER, mesmo gate da distribuição) porque a RLS de `processes` só deixa o
// criador dar UPDATE — e a recepção normalmente não é a criadora.
function ProcessoDetailModal({
  proc, tiposAcao, onClose, onSaved,
}: {
  proc: ProcessRow; tiposAcao: TipoAcaoRow[];
  onClose: () => void; onSaved: () => void;
}) {
  const [tipoId, setTipoId] = useState<string>(proc.tipo_acao_id ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!tipoId) { toast.error("Selecione um tipo de ação"); return; }
    setSaving(true);
    const { error } = await sb.rpc("definir_tipo_acao_processo", {
      p_process_id: proc.id, p_tipo_acao_id: tipoId,
    });
    if (error) {
      toast.error(`Não foi possível salvar o tipo de ação: ${error.message}`);
      setSaving(false);
      return;
    }
    toast.success("Tipo de ação atualizado");
    setSaving(false);
    onSaved();
  }

  return (
    <div role="dialog" aria-modal="true"
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: "var(--bg3, #13131f)", color: "var(--text1, #eeeef5)", border: "1px solid var(--border, #1e1e2e)", borderRadius: 12, padding: 20, width: "min(520px, 92vw)", maxHeight: "88vh", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, flex: 1 }}>Processo</h2>
          <button type="button" onClick={onClose} aria-label="Fechar"
            style={{ background: "transparent", border: 0, color: "var(--text2, #ccc)", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>✕</button>
        </div>

        <div style={{ display: "grid", gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, color: "var(--text3, #888)" }}>Número</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{proc.process_number}</div>
          </div>
          {proc.description && (
            <div>
              <div style={{ fontSize: 12, color: "var(--text3, #888)" }}>Descrição</div>
              <div style={{ fontSize: 14 }}>{proc.description}</div>
            </div>
          )}
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            {proc.responsible_lawyer && (
              <div>
                <div style={{ fontSize: 12, color: "var(--text3, #888)" }}>Responsável</div>
                <div style={{ fontSize: 14 }}>{proc.responsible_lawyer}</div>
              </div>
            )}
            <div>
              <div style={{ fontSize: 12, color: "var(--text3, #888)" }}>Situação</div>
              <div style={{ fontSize: 14 }}>{proc.status}</div>
            </div>
          </div>

          <label style={{ fontSize: 12, color: "var(--text3, #888)", display: "grid", gap: 4 }}>
            Tipo de ação
            <select
              value={tipoId}
              onChange={e => setTipoId(e.target.value)}
              disabled={saving}
              style={{ width: "100%", padding: "8px 10px", borderRadius: 6, background: "var(--bg1, #09090f)", border: "1px solid var(--border, #1e1e2e)", color: "var(--text1, #eeeef5)", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }}>
              <option value="">— selecione —</option>
              {tiposAcao.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
            </select>
          </label>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 6 }}>
            <button type="button" onClick={onClose} disabled={saving}
              style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid var(--border, #1e1e2e)", background: "transparent", color: "var(--text2, #ccc)", cursor: "pointer", fontSize: 13 }}>
              Cancelar
            </button>
            <button type="button" onClick={() => void handleSave()} disabled={saving || !tipoId}
              className="cli-btn sm">
              {saving ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ProcessosTab({ client }: { client: ClientFull }) {
  const [rows, setRows] = useState<ProcessRow[] | null>(null);
  const [tiposAcao, setTiposAcao] = useState<TipoAcaoRow[]>([]);
  const [selected, setSelected] = useState<ProcessRow | null>(null);

  const load = useCallback(async () => {
    // `processes` não tem FK para `clients`; o vínculo existente é por
    // `client_name` (texto). Renderizamos por esse vínculo, sem inventar outro.
    const { data, error } = await sb.from("processes")
      .select("id, process_number, description, responsible_lawyer, next_hearing_date, status, tipo_acao_id")
      .eq("client_name", client.full_name)
      .order("created_at", { ascending: false });
    if (error) { setRows([]); return; }
    setRows((data as ProcessRow[]) ?? []);
  }, [client.full_name]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await sb.from("tipos_acao").select("id, nome").order("nome");
      if (cancelled) return;
      setTiposAcao((data as TipoAcaoRow[]) ?? []);
    })();
    return () => { cancelled = true; };
  }, []);

  const tipoNome = useCallback(
    (id: string | null) => (id ? tiposAcao.find(t => t.id === id)?.nome ?? null : null),
    [tiposAcao],
  );

  if (rows === null) return <TabLoading />;
  if (rows.length === 0) {
    return <EmptyState icon="⚖" title="Nenhum processo vinculado" hint="Processos são associados pelo nome do cliente. Nenhum registro encontrado." />;
  }
  return (
    <>
      <div className="cli-card lift">
        <div className="cli-sec-title">Processos / Ações · {rows.length}</div>
        {rows.map(proc => {
          const overdue = proc.next_hearing_date ? new Date(proc.next_hearing_date) < new Date() : false;
          const nome = tipoNome(proc.tipo_acao_id);
          return (
            <button key={proc.id} type="button" className="cli-row"
              onClick={() => setSelected(proc)}
              style={{ width: "100%", textAlign: "left", background: "none", border: 0, cursor: "pointer", font: "inherit", color: "inherit" }}
              title="Abrir processo · editar tipo de ação">
              <div className="dot">⚖</div>
              <div className="body">
                <div className="t">{proc.process_number}</div>
                <div className={`s${overdue ? " late" : ""}`}>
                  {proc.description ? `${proc.description} · ` : ""}
                  {`Tipo: ${nome ?? "não definido"}`}
                  {proc.responsible_lawyer ? ` · Resp.: ${proc.responsible_lawyer}` : ""}
                  {proc.next_hearing_date ? ` · Audiência ${formatDateBR(proc.next_hearing_date)}` : ""}
                </div>
              </div>
              <span style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                {!proc.tipo_acao_id && <span className="cli-chip d">Sem tipo</span>}
                <span className="cli-chip n">{proc.status}</span>
                <span className="go" aria-hidden="true">→</span>
              </span>
            </button>
          );
        })}
      </div>

      {selected && (
        <ProcessoDetailModal
          proc={selected}
          tiposAcao={tiposAcao}
          onClose={() => setSelected(null)}
          onSaved={() => { setSelected(null); void load(); }}
        />
      )}
    </>
  );
}
