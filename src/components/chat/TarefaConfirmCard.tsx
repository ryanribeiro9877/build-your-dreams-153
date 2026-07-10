import { useEffect, useMemo, useState } from "react";
import { Check, Pencil, ClipboardList, AlertCircle, UserPlus } from "lucide-react";
import { createChatTask } from "@/hooks/useUserTasks";
import { useAssignableUsers } from "@/hooks/useAssignableUsers";
import type { TarefaDraft, PendingTask } from "@/components/juris-cloud/types";
import { toast } from "sonner";

/** Converte um ISO para o formato aceito por <input type="datetime-local"> (fuso local). */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

// Tenta casar o assignee_hint (nome livre vindo da extração em linguagem
// natural, ex.: "cria tarefa pro Pedro ligar") com uma opção da lista de
// usuários — comparação simples por substring (case/acentos ignorados).
function matchAssigneeHint(hint: string | null, options: { id: string; name: string }[]): string {
  if (!hint) return "";
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const h = norm(hint);
  if (!h) return "";
  const hit = options.find((o) => norm(o.name).includes(h) || h.includes(norm(o.name)));
  return hit?.id ?? "";
}

/**
 * Cartão de confirmação de tarefa (Task 19 + via própria 4.1): renderiza o
 * `TarefaDraft` extraído pelo agente (kind === 'tarefa_confirm'), pré-preenchido
 * mas totalmente editável. Só cria a tarefa ao clicar "Confirmar" — uma única
 * vez (estado `created` trava re-submit).
 *
 * Autorização: usa `create_chat_task` (via PRÓPRIA do 4.1 — "autenticado e papel
 * <> tech", sem role_task_matrix). O TIPO é fixo (`tarefa_chat`, resolvido no
 * banco), então não há seletor de tipo. O RESPONSÁVEL é o próprio criador por
 * padrão (criação rápida/pessoal); pode ser trocado, e é pré-selecionado se o
 * pedido citou alguém. Cliente: 0 → em aberto; 1 → resolvido; N → desambiguação
 * (nome + CPF mascarado + status). Só o `client_id` (uuid) é vinculado.
 *
 * `onCadastrarCliente`: quando o pedido cita um cliente que NÃO existe no cadastro
 * (client_query preenchido, 0 resolvido, 0 candidatos), em vez de criar a tarefa
 * com client_id null silenciosamente, o cartão BLOQUEIA o Confirmar e oferece
 * "Cadastrar cliente", devolvendo um snapshot ao vivo do rascunho — o container
 * leva ao cadastro (Modelo A) e cria a tarefa automaticamente ao concluir (paridade
 * com o cartão de reunião). Ausente → só bloqueia. Tarefa SEM cliente citado
 * (client_query vazio) segue livre (client_id null é válido nesse caso).
 */
export function TarefaConfirmCard({
  draft, onCadastrarCliente,
}: { draft: TarefaDraft; onCadastrarCliente?: (snapshot: PendingTask) => void }) {
  const [title, setTitle] = useState(draft.title ?? "");
  const [description, setDescription] = useState(draft.description ?? "");
  const [deadline, setDeadline] = useState(draft.deadline_at ? toLocalInput(draft.deadline_at) : "");
  const [priority, setPriority] = useState<TarefaDraft["priority"]>(draft.priority ?? "medium");
  const [clientId, setClientId] = useState<string | null>(draft.client_resolved?.id ?? null);
  // Cartão REABERTO após cadastro pode trazer o responsável já escolhido (preserva o trabalho).
  const [assignee, setAssignee] = useState<string>(draft.assignee_user_id ?? ""); // "" = eu (padrão)
  const [assigneeTouched, setAssigneeTouched] = useState(!!draft.assignee_user_id);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(false);
  // [FIX-EXPEDIENTE] Vira true quando o banco recusa o prazo (hint business_hours) —
  // ex.: o usuário editou o datetime para fora do expediente. Limpo ao reeditar o prazo.
  const [horarioErro, setHorarioErro] = useState(false);

  const { users } = useAssignableUsers();
  const assigneeOptions = useMemo(() => users.map((u) => ({ id: u.user_id, name: u.name })), [users]);

  // Pré-seleciona SE o pedido citou um responsável; sem citação fica "" = a
  // própria pessoa (padrão do create_chat_task). Não sobrescreve escolha manual.
  useEffect(() => {
    if (!assigneeTouched && !assignee && assigneeOptions.length > 0) {
      const match = matchAssigneeHint(draft.assignee_hint, assigneeOptions);
      if (match) setAssignee(match);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assigneeOptions]);

  // Cliente CITADO mas NÃO encontrado (client_query preenchido, sem resolvido, sem
  // candidatos): em vez de criar com client_id null silenciosamente, bloqueia e
  // oferece o cadastro em linha — mas só quando o container fornece o handler.
  // Tarefa sem cliente citado (client_query vazio) NÃO cai aqui — segue livre.
  const clientNotFound =
    !clientId && !draft.client_resolved && draft.client_candidates.length === 0 && !!draft.client_query?.trim();
  const showCadastrarBtn = clientNotFound && !!onCadastrarCliente;

  // [FIX-EXPEDIENTE] Prazo dentro do expediente. Defesa em profundidade (a autoridade
  // é o banco): usamos o carimbo `deadline_ok` do edge, sem reimplementar a regra.
  // `!== false` (não `=== true`): draft antigo / edge ainda não deployado (undefined)
  // NÃO bloqueia — não regride tarefa válida. `horarioErro` cobre a edição para um
  // horário inválido, detectada só na recusa do banco.
  const horarioOk = draft.deadline_ok !== false && !horarioErro;

  // Tipo fixo + autorização própria (todos menos tech); responsável default = eu.
  // Só o título é obrigatório — E, quando um cliente foi citado, ele precisa estar
  // cadastrado (decisão do dono: tarefa pelo chat não nasce com cliente fantasma) —
  // E o prazo precisa estar dentro do expediente.
  const canConfirm = title.trim().length > 0 && !busy && !clientNotFound && horarioOk;

  // Snapshot AO VIVO do rascunho — para a criação pós-cadastro reaproveitar tudo.
  const buildSnapshot = (): PendingTask => ({
    client_name_hint: draft.client_query,
    title: title.trim() || null,
    description: description.trim() || null,
    deadline_at: deadline ? new Date(deadline).toISOString() : null,
    deadline_ok: draft.deadline_ok, // [FIX-EXPEDIENTE] carimbo do edge; DB é a autoridade
    priority: priority ?? "medium",
    assignee_user_id: assignee || null,
  });

  const confirm = async () => {
    if (!canConfirm || created) return;
    setBusy(true);
    try {
      await createChatTask({
        title: title.trim(),
        description: description.trim() || undefined,
        client_id: clientId ?? undefined,
        deadline_at: deadline ? new Date(deadline).toISOString() : undefined,
        assignee_user_id: assignee || undefined, // undefined → o próprio criador
        priority: priority ?? "medium",
      });
      setCreated(true);
      toast.success("Tarefa criada.");
    } catch (e) {
      // [FIX-EXPEDIENTE] Backstop do banco: prazo fora do expediente → mantém o cartão
      // aberto, sinaliza inline e NÃO cria. Distingue pela hint/mensagem do PostgrestError.
      const err = e as { hint?: string; message?: string };
      if (err?.hint === "business_hours" || /fora do expediente/i.test(err?.message ?? "")) {
        setHorarioErro(true);
        toast.error("Horário fora do expediente (dias úteis, 08h–17h). Ajuste o prazo e confirme.");
      } else {
        toast.error(err?.message ?? "Falha ao criar tarefa.");
      }
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
        <label style={{ fontSize: 12, color: "var(--text2)" }}>Título</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="O que fazer"        />

        <label style={{ fontSize: 12, color: "var(--text2)" }}>Descrição</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}        />

        <label style={{ fontSize: 12, color: "var(--text2)" }}>
          Prazo{" "}
          {draft.deadline_display && (
            <span style={{ color: "var(--text2)" }}>(sugerido: {draft.deadline_display})</span>
          )}
        </label>
        <input
          type="datetime-local"
          value={deadline}
          onChange={(e) => { setDeadline(e.target.value); setHorarioErro(false); }}        />

        <label style={{ fontSize: 12, color: "var(--text2)" }}>Prioridade</label>
        <select
          value={priority ?? "medium"}
          onChange={(e) => setPriority(e.target.value as TarefaDraft["priority"])}        >
          <option value="critical">Crítica</option>
          <option value="high">Alta</option>
          <option value="medium">Média</option>
          <option value="low">Baixa</option>
        </select>

        <label style={{ fontSize: 12, color: "var(--text2)" }}>
          Responsável <span style={{ color: "var(--text3, #8a8a99)" }}>(eu, por padrão)</span>
        </label>
        <select
          value={assignee}
          onChange={(e) => { setAssignee(e.target.value); setAssigneeTouched(true); }}        >
          <option value="">Eu (padrão)</option>
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
            >
              <option value="">Sem cliente</option>
              {draft.client_candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {[c.name, c.cpf_masked, c.status].filter(Boolean).join(" · ")}
                </option>
              ))}
            </select>
          </>
        ) : draft.client_resolved ? (
          <div className="action-card__row">
            <span className="action-card__label">Cliente</span>
            <span className="action-card__value">
              {[draft.client_resolved.name, draft.client_resolved.cpf_masked].filter(Boolean).join(" · ")}
            </span>
          </div>
        ) : draft.client_query ? (
          <div className="action-card__row">
            <span className="action-card__label">Cliente</span>
            <span className="action-card__value" style={{ color: "#EAB308" }}>
              "{draft.client_query}" — {clientNotFound ? "não encontrado" : "em aberto"}
            </span>
          </div>
        ) : null}
      </div>
      {showCadastrarBtn ? (
        <div style={{ padding: "0 16px 8px" }}>
          <div style={{ fontSize: 12, color: "#EAB308", marginBottom: 8 }}>Cliente não encontrado. Cadastrar agora?</div>
          <button type="button" className="action-card__btn action-card__btn--primary"
            onClick={() => onCadastrarCliente!(buildSnapshot())}>
            <UserPlus size={15} aria-hidden="true" /> Cadastrar cliente
          </button>
        </div>
      ) : (
        <>
          {clientNotFound && (
            <div style={{ fontSize: 12, color: "#EAB308", padding: "0 16px 8px" }}>
              Cliente "{draft.client_query}" não encontrado. Vincule um cliente cadastrado antes de criar.
            </div>
          )}
          {!horarioOk && (
            <div style={{ fontSize: 12, color: "#EAB308", padding: "0 16px 8px" }}>
              Horário fora do expediente (dias úteis, 08h–17h). Peça no chat um horário válido.
            </div>
          )}
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
        </>
      )}
    </div>
  );
}
