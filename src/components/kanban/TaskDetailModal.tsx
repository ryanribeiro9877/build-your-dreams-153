// Modal-hub de detalhe da tarefa (SP3): vínculos, edição de campos, marcadores
// (criação livre), comentários com @menção e "Trocar quadro". Overlay inline.
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { KanbanBoardDetail, TaskComment, TaskPriority } from "@/types/jurisai";
import {
  useTaskDetail, useTaskComments, setTaskTags, addComment, updateTaskFields, moveCard,
} from "@/hooks/useKanban";
import { useNavigate } from "react-router-dom";
import { SITUACAO_LABELS } from "@/lib/kanbanSituacao";
import { HexagonLoader } from "@/components/HexagonLoader";
import TaskAttachments from "@/components/TaskAttachments";
import { ChecklistSection } from "./ChecklistSection";
import { WorkflowSection } from "./WorkflowSection";
import { TimesheetSection } from "./TimesheetSection";
import { AuditSection } from "./AuditSection";
import { COLORS, FONT, overlay, input, select, btnGhost, btnPrimary, btnMini } from "./kanbanStyles";

interface Person { id: string; name: string }

interface Props {
  taskId: string;
  boards: { id: string; name: string }[];
  people: Person[];
  onClose: () => void;
  onChanged: () => void;
  onOpenClient: (clientId: string) => void;
}

const PRIORITY_OPTS: { v: TaskPriority; label: string }[] = [
  { v: "critical", label: "Crítica" },
  { v: "high", label: "Alta" },
  { v: "medium", label: "Média" },
  { v: "low", label: "Baixa" },
];

function fmt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function TaskDetailModal({ taskId, boards, people, onClose, onChanged, onOpenClient }: Props) {
  const navigate = useNavigate();
  const { detail, loading, refresh } = useTaskDetail(taskId);
  const [editing, setEditing] = useState(false);
  const [full, setFull] = useState(false);
  const [saving, setSaving] = useState(false);

  // Rascunho de edição.
  const [draft, setDraft] = useState({
    title: "", description: "", deadline_at: "", assignee_user_id: "", priority: "medium" as TaskPriority,
  });
  useEffect(() => {
    if (detail) {
      setDraft({
        title: detail.title,
        description: detail.description ?? "",
        deadline_at: detail.deadline_at ? detail.deadline_at.slice(0, 16) : "",
        assignee_user_id: detail.assignee_user_id ?? "",
        priority: detail.priority,
      });
    }
  }, [detail]);

  async function saveFields() {
    setSaving(true);
    try {
      await updateTaskFields(taskId, {
        title: draft.title.trim(),
        description: draft.description.trim() || null,
        deadline_at: draft.deadline_at ? new Date(draft.deadline_at).toISOString() : null,
        assignee_user_id: draft.assignee_user_id || null,
        priority: draft.priority,
      });
      toast.success("Tarefa atualizada.");
      setEditing(false);
      refresh();
      onChanged();
    } catch (e) {
      toast.error((e as Error)?.message ?? "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function handleTrocarQuadro(boardId: string) {
    if (!boardId) return;
    try {
      const { data, error } = await supabase.rpc("get_kanban_board", { p_board_id: boardId });
      if (error) throw error;
      const cols = (data as unknown as KanbanBoardDetail)?.columns ?? [];
      if (cols.length === 0) { toast.error("O quadro destino não tem colunas."); return; }
      await moveCard(taskId, cols[0].id, 0);
      toast.success("Tarefa movida para o quadro.");
      refresh();
      onChanged();
    } catch (e) {
      toast.error((e as Error)?.message ?? "Falha ao trocar de quadro.");
    }
  }

  const modalStyle: CSSProperties = {
    background: COLORS.bg1, border: `1px solid ${COLORS.border}`, borderRadius: 12,
    padding: 20, fontFamily: FONT, overflowY: "auto",
    width: full ? "96vw" : "min(720px, 94vw)",
    height: full ? "92vh" : undefined, maxHeight: "92vh",
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        {loading || !detail ? (
          <HexagonLoader variant="compact" label="Carregando tarefa" />
        ) : (
          <>
            {/* Cabeçalho */}
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 14 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                {editing ? (
                  <input value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} style={{ ...input, width: "100%", fontSize: 16, fontWeight: 700 }} />
                ) : (
                  <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: COLORS.text1 }}>{detail.title}</h2>
                )}
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
                  <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 8, background: COLORS.bg2, color: COLORS.goldBright, fontWeight: 700 }}>
                    {SITUACAO_LABELS[detail.situacao]}
                  </span>
                  <span style={{ fontSize: 10, color: COLORS.text3, fontFamily: "ui-monospace, monospace" }}>TAR.{detail.id.slice(0, 8)}</span>
                  <span style={{ fontSize: 11, color: COLORS.text3 }}>· {detail.task_type_label}</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                {!editing && <button onClick={() => setEditing(true)} style={btnMini}>Editar</button>}
                <button onClick={() => setFull((f) => !f)} style={btnMini} title="Tela cheia">{full ? "⤡" : "⤢"}</button>
                <button onClick={onClose} style={btnMini}>Fechar</button>
              </div>
            </div>

            {/* Vínculos */}
            <Section title="Vínculos">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12, color: COLORS.text2 }}>
                <div>
                  <Label>Cliente</Label>
                  {detail.client_id && detail.client_name ? (
                    <button onClick={() => onOpenClient(detail.client_id as string)} style={linkBtn}>{detail.client_name}</button>
                  ) : <span style={muted}>—</span>}
                </div>
                <div>
                  <Label>Processo</Label>
                  <span>{detail.process_number ? `PRO.${detail.process_number}` : "—"}</span>
                </div>
                <div><Label>Responsável</Label><span>{detail.assignee_name}</span></div>
                <div><Label>Delegado por</Label><span>{detail.assigner_name}</span></div>
                {detail.validator_name && <div><Label>Validador</Label><span>{detail.validator_name}</span></div>}
                <div>
                  <Label>Trocar quadro</Label>
                  <select defaultValue="" onChange={(e) => handleTrocarQuadro(e.target.value)} style={{ ...select, width: "100%" }}>
                    <option value="">Selecionar quadro…</option>
                    {boards.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
              </div>
            </Section>

            {/* Detalhes (edição) */}
            <Section title="Detalhes">
              {editing ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div>
                    <Label>Descrição</Label>
                    <textarea value={draft.description} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} rows={4} style={{ ...input, width: "100%", resize: "vertical" }} />
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 160 }}>
                      <Label>Data fatal</Label>
                      <input type="datetime-local" value={draft.deadline_at} onChange={(e) => setDraft((d) => ({ ...d, deadline_at: e.target.value }))} style={{ ...input, width: "100%" }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 160 }}>
                      <Label>Responsável</Label>
                      <select value={draft.assignee_user_id} onChange={(e) => setDraft((d) => ({ ...d, assignee_user_id: e.target.value }))} style={{ ...select, width: "100%" }}>
                        <option value="">—</option>
                        {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>
                    <div style={{ flex: 1, minWidth: 120 }}>
                      <Label>Prioridade</Label>
                      <select value={draft.priority} onChange={(e) => setDraft((d) => ({ ...d, priority: e.target.value as TaskPriority }))} style={{ ...select, width: "100%" }}>
                        {PRIORITY_OPTS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
                      </select>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button onClick={() => setEditing(false)} style={btnGhost}>Cancelar</button>
                    <button onClick={saveFields} disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }}>{saving ? "Salvando…" : "Salvar"}</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: COLORS.text2 }}>
                  <div><Label>Descrição</Label><span style={{ whiteSpace: "pre-wrap" }}>{detail.description || "—"}</span></div>
                  <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
                    <span><Label>Data fatal</Label>{fmt(detail.deadline_at)}</span>
                    <span><Label>Criada</Label>{fmt(detail.created_at)}</span>
                    <span><Label>Prioridade</Label>{PRIORITY_OPTS.find((o) => o.v === detail.priority)?.label ?? detail.priority}</span>
                  </div>
                </div>
              )}
            </Section>

            {/* Marcadores */}
            <Section title="Marcadores">
              <TagEditor taskId={taskId} initial={detail.tags.map((t) => t.name)} onSaved={() => { refresh(); onChanged(); }} />
            </Section>

            {/* Documentos */}
            <Section title="Documentos">
              <TaskAttachments taskId={taskId} canUpload />
              <button
                onClick={() => navigate(`/sistema/chat?task=${taskId}${detail.client_id ? `&client=${detail.client_id}` : ""}`)}
                style={{ ...btnMini, marginTop: 8 }}
                title="Gerar documento por modelo/IA no módulo de documentos"
              >
                Usar modelo / IA
              </button>
            </Section>

            {/* Checklist */}
            <Section title="Checklist">
              <ChecklistSection taskId={taskId} />
            </Section>

            {/* Workflow */}
            <Section title="Workflow">
              <WorkflowSection taskId={taskId} />
            </Section>

            {/* Timesheet */}
            <Section title="Timesheet">
              <TimesheetSection taskId={taskId} />
            </Section>

            {/* Comentários */}
            <Section title="Comentários">
              <CommentsSection taskId={taskId} people={people} />
            </Section>

            {/* Auditoria */}
            <Section title="Auditoria">
              <AuditSection taskId={taskId} people={people} />
            </Section>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 16, borderTop: `1px solid ${COLORS.border}`, paddingTop: 12 }}>
      <div style={{ fontSize: 11, color: COLORS.gold, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700, marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}
const Label = ({ children }: { children: ReactNode }) => (
  <span style={{ display: "block", fontSize: 10, color: COLORS.text3, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>{children}</span>
);
const muted: CSSProperties = { color: COLORS.text3 };
const linkBtn: CSSProperties = { background: "none", border: "none", padding: 0, color: "#8ab4f8", cursor: "pointer", fontSize: 12, fontFamily: FONT, textDecoration: "underline" };

function TagEditor({ taskId, initial, onSaved }: { taskId: string; initial: string[]; onSaved: () => void }) {
  const [names, setNames] = useState<string[]>(initial);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { setNames(initial); }, [initial.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

  async function persist(next: string[]) {
    setNames(next);
    setSaving(true);
    try {
      await setTaskTags(taskId, next);
      onSaved();
    } catch (e) {
      toast.error((e as Error)?.message ?? "Falha ao salvar marcadores.");
      setNames(initial);
    } finally {
      setSaving(false);
    }
  }
  function add() {
    const v = text.trim();
    if (!v) return;
    if (!names.some((n) => n.toLowerCase() === v.toLowerCase())) persist([...names, v]);
    setText("");
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
        {names.length === 0 && <span style={muted}>Nenhum marcador.</span>}
        {names.map((n) => (
          <span key={n} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 12, background: "rgba(234,179,8,0.15)", color: COLORS.goldBright, border: `1px solid ${COLORS.gold}55`, display: "inline-flex", gap: 6, alignItems: "center" }}>
            {n}
            <button onClick={() => persist(names.filter((x) => x !== n))} style={{ background: "none", border: "none", color: COLORS.goldBright, cursor: "pointer", padding: 0, fontSize: 12 }}>×</button>
          </span>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder="Digite e Enter para adicionar…"
          disabled={saving}
          style={{ ...input, flex: 1 }}
        />
        <button onClick={add} disabled={saving} style={btnMini}>Adicionar</button>
      </div>
    </div>
  );
}

function CommentsSection({ taskId, people }: { taskId: string; people: Person[] }) {
  const { comments, loading, refresh } = useTaskComments(taskId);
  const [body, setBody] = useState("");
  const [mentions, setMentions] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? "alguém";

  async function send() {
    if (!body.trim()) return;
    setSending(true);
    try {
      await addComment(taskId, body.trim(), mentions);
      setBody(""); setMentions([]);
      refresh();
    } catch (e) {
      toast.error((e as Error)?.message ?? "Falha ao comentar.");
    } finally {
      setSending(false);
    }
  }
  function toggleMention(id: string) {
    setMentions((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]));
  }

  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 240, overflowY: "auto", marginBottom: 10 }}>
        {loading ? <span style={muted}>Carregando…</span>
          : comments.length === 0 ? <span style={muted}>Sem comentários.</span>
          : comments.map((c: TaskComment) => (
            <div key={c.id} style={{ background: COLORS.bg2, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "8px 10px" }}>
              <div style={{ fontSize: 11, color: COLORS.text3, marginBottom: 3 }}>
                <strong style={{ color: COLORS.text2 }}>{c.author_name}</strong> · {fmt(c.created_at)}
              </div>
              <div style={{ fontSize: 13, color: COLORS.text1, whiteSpace: "pre-wrap" }}>{c.body}</div>
              {c.mentioned_user_ids.length > 0 && (
                <div style={{ marginTop: 4, fontSize: 10, color: "#8ab4f8" }}>
                  {c.mentioned_user_ids.map((id) => `@${nameOf(id)}`).join("  ")}
                </div>
              )}
            </div>
          ))}
      </div>
      <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} rows={3} placeholder="Escreva um comentário…" style={{ ...input, width: "100%", resize: "vertical", marginBottom: 6 }} />
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontSize: 10, color: COLORS.text3 }}>@ Mencionar:</span>
        {people.slice(0, 30).map((p) => (
          <button key={p.id} onClick={() => toggleMention(p.id)} style={{
            fontSize: 10, padding: "2px 8px", borderRadius: 10, cursor: "pointer", fontFamily: FONT,
            border: `1px solid ${mentions.includes(p.id) ? "#8ab4f8" : COLORS.border}`,
            background: mentions.includes(p.id) ? "rgba(138,180,248,0.15)" : COLORS.bg2,
            color: mentions.includes(p.id) ? "#8ab4f8" : COLORS.text2,
          }}>{p.name}</button>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button onClick={send} disabled={sending || !body.trim()} style={{ ...btnPrimary, opacity: sending || !body.trim() ? 0.6 : 1 }}>
          {sending ? "Enviando…" : "Comentar"}
        </button>
      </div>
    </div>
  );
}
