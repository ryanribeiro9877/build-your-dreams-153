import { useEffect, useMemo, useState } from "react";
import { Check, Pencil, ClipboardList, AlertCircle } from "lucide-react";
import { useTaskTypes, useEligibleAssignees, createUserTask } from "@/hooks/useUserTasks";
import { useAssignableUsers } from "@/hooks/useAssignableUsers";
import type { TarefaDraft } from "@/components/juris-cloud/types";
import { toast } from "sonner";

/** Converte um ISO para o formato aceito por <input type="datetime-local"> (fuso local). */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

// Tenta casar o assignee_hint (nome livre vindo da extração em linguagem
// natural) com uma opção da lista de responsáveis elegíveis — comparação
// simples por substring (case/acentos ignorados), sem libs novas.
function matchAssigneeHint(hint: string | null, options: { id: string; name: string }[]): string {
  if (!hint) return "";
  const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const h = norm(hint);
  if (!h) return "";
  const hit = options.find((o) => norm(o.name).includes(h) || h.includes(norm(o.name)));
  return hit?.id ?? "";
}

/**
 * Cartão de confirmação de tarefa (Task 19): renderiza o `TarefaDraft`
 * extraído pelo agente (kind === 'tarefa_confirm'), pré-preenchido mas
 * totalmente editável. Só cria a tarefa (create_user_task) ao clicar
 * "Confirmar" — uma única vez (estado `created` trava re-submit). Campos
 * não resolvidos pelo draft (responsável, cliente ambíguo) ficam em aberto,
 * destacados para o usuário decidir.
 */
export function TarefaConfirmCard({ draft }: { draft: TarefaDraft }) {
  const { types } = useTaskTypes();
  const [taskTypeId, setTaskTypeId] = useState<string>("");
  const [title, setTitle] = useState(draft.title ?? "");
  const [description, setDescription] = useState(draft.description ?? "");
  const [deadline, setDeadline] = useState(draft.deadline_at ? toLocalInput(draft.deadline_at) : "");
  const [priority, setPriority] = useState<TarefaDraft["priority"]>(draft.priority ?? "medium");
  const [clientId, setClientId] = useState<string | null>(draft.client_resolved?.id ?? null);
  const [assignee, setAssignee] = useState<string>("");
  const [assigneeTouched, setAssigneeTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(false);

  const { assignees } = useEligibleAssignees(taskTypeId || null);
  const { users } = useAssignableUsers();
  const assigneeOptions = useMemo(
    () =>
      taskTypeId
        ? assignees.map((a) => ({ id: a.user_id, name: a.full_name }))
        : users.map((u) => ({ id: u.user_id, name: u.name })),
    [taskTypeId, assignees, users],
  );

  // Pré-seleciona o responsável quando o assignee_hint do draft casar com uma
  // opção elegível — só na primeira vez que as opções chegam (não sobrescreve
  // uma escolha manual do usuário).
  useEffect(() => {
    if (!assigneeTouched && !assignee && assigneeOptions.length > 0) {
      const match = matchAssigneeHint(draft.assignee_hint, assigneeOptions);
      if (match) setAssignee(match);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assigneeOptions]);

  const canConfirm = !!taskTypeId && title.trim().length > 0 && !!assignee && !busy;

  const confirm = async () => {
    if (!canConfirm || created) return;
    setBusy(true);
    try {
      await createUserTask({
        task_type_id: taskTypeId,
        assignee_user_id: assignee,
        title: title.trim(),
        description: description.trim() || undefined,
        client_id: clientId ?? undefined,
        deadline_at: deadline ? new Date(deadline).toISOString() : undefined,
        priority: priority ?? "medium",
      });
      setCreated(true);
      toast.success("Tarefa criada.");
    } catch (e) {
      toast.error((e as { message?: string })?.message ?? "Falha ao criar tarefa.");
    } finally {
      setBusy(false);
    }
  };

  if (created) {
    return (
      <div className="action-card--done">
        <Check size={15} style={{ color: "#FACC15" }} /> Tarefa criada.
      </div>
    );
  }

  return (
    <div className="action-card">
      <div className="action-card__head">
        <ClipboardList size={15} aria-hidden="true" /> Confirmar tarefa
      </div>
      <div className="action-card__fields">
        <label style={{ fontSize: 12, color: "var(--text2)" }}>
          Tipo de tarefa {!taskTypeId && <span style={{ color: "#EAB308" }}><AlertCircle size={12} style={{ verticalAlign: "middle" }} /> em aberto</span>}
        </label>
        <select
          value={taskTypeId}
          onChange={(e) => { setTaskTypeId(e.target.value); setAssignee(""); setAssigneeTouched(false); }}
          style={{ padding: "6px 8px", borderRadius: 6 }}
        >
          <option value="">Selecione…</option>
          {types.map((t) => (
            <option key={t.id} value={t.id}>{t.display_name}</option>
          ))}
        </select>

        <label style={{ fontSize: 12, color: "var(--text2)" }}>Título</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="O que fazer"
          style={{ padding: "6px 8px", borderRadius: 6 }}
        />

        <label style={{ fontSize: 12, color: "var(--text2)" }}>Descrição</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          style={{ padding: "6px 8px", borderRadius: 6 }}
        />

        <label style={{ fontSize: 12, color: "var(--text2)" }}>
          Prazo{" "}
          {draft.deadline_display && (
            <span style={{ color: "var(--text2)" }}>(sugerido: {draft.deadline_display})</span>
          )}
        </label>
        <input
          type="datetime-local"
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
          style={{ padding: "6px 8px", borderRadius: 6 }}
        />

        <label style={{ fontSize: 12, color: "var(--text2)" }}>Prioridade</label>
        <select
          value={priority ?? "medium"}
          onChange={(e) => setPriority(e.target.value as TarefaDraft["priority"])}
          style={{ padding: "6px 8px", borderRadius: 6 }}
        >
          <option value="critical">Crítica</option>
          <option value="high">Alta</option>
          <option value="medium">Média</option>
          <option value="low">Baixa</option>
        </select>

        <label style={{ fontSize: 12, color: "var(--text2)" }}>
          Responsável{" "}
          {!assignee && (
            <span style={{ color: "#EAB308" }}>
              <AlertCircle size={12} style={{ verticalAlign: "middle" }} /> em aberto
            </span>
          )}
        </label>
        <select
          value={assignee}
          onChange={(e) => { setAssignee(e.target.value); setAssigneeTouched(true); }}
          style={{ padding: "6px 8px", borderRadius: 6 }}
        >
          <option value="">Selecione…</option>
          {assigneeOptions.map((o) => (
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
        </select>

        {draft.client_candidates.length > 1 ? (
          <>
            <label style={{ fontSize: 12, color: "#EAB308" }}>
              <AlertCircle size={12} style={{ verticalAlign: "middle" }} /> Cliente ambíguo — escolha
            </label>
            <select
              value={clientId ?? ""}
              onChange={(e) => setClientId(e.target.value || null)}
              style={{ padding: "6px 8px", borderRadius: 6 }}
            >
              <option value="">Sem cliente</option>
              {draft.client_candidates.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </>
        ) : draft.client_resolved ? (
          <div className="action-card__row">
            <span className="action-card__label">Cliente</span>
            <span className="action-card__value">{draft.client_resolved.name}</span>
          </div>
        ) : draft.client_query ? (
          <div className="action-card__row">
            <span className="action-card__label">Cliente</span>
            <span className="action-card__value" style={{ color: "#EAB308" }}>
              "{draft.client_query}" — em aberto
            </span>
          </div>
        ) : null}
      </div>
      <div className="action-card__actions">
        <button
          type="button"
          className="action-card__btn action-card__btn--primary"
          disabled={!canConfirm}
          onClick={confirm}
        >
          <Check size={15} aria-hidden="true" /> Confirmar
        </button>
        <button
          type="button"
          className="action-card__btn action-card__btn--ghost"
          disabled={busy}
          onClick={() => toast.message("Ajuste os campos e confirme quando estiver certo.")}
        >
          <Pencil size={14} aria-hidden="true" /> Corrigir
        </button>
      </div>
    </div>
  );
}
