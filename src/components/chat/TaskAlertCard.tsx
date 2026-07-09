import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlarmClock, Check, CalendarClock, User2, Eye } from "lucide-react";
import { updateUserTaskStatus } from "@/hooks/useUserTasks";
import { RescheduleInline } from "./RescheduleInline";
import { toast } from "sonner";

export interface TaskAlertPayload {
  task_id: string; title: string; type_label: string;
  deadline_at: string | null; client_id: string | null;
  status: string; is_creator_notice?: boolean;
}

function fmt(dt: string | null): string {
  if (!dt) return "sem prazo";
  return new Date(dt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function TaskAlertCard({ payload }: { payload: TaskAlertPayload }) {
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"idle" | "reschedule">("idle");
  const [done, setDone] = useState<string | null>(null);

  // Aviso ao criador (tarefa concluída): card informativo, sem ações de execução.
  if (payload.is_creator_notice) {
    return (
      <div className="action-card">
        <div className="action-card__head"><Check size={15} /> Tarefa concluída</div>
        <div className="action-card__desc">
          "{payload.title}" — prazo original {fmt(payload.deadline_at)}.
        </div>
        <div className="action-card__actions">
          <button type="button" className="action-card__btn action-card__btn--ghost"
            onClick={() => nav(`/sistema/tarefas?task=${payload.task_id}`)}>
            <Eye size={14} /> Ver detalhes
          </button>
        </div>
      </div>
    );
  }

  if (done) return <div className="action-card--done"><Check size={15} style={{ color: "#FACC15" }} /> {done}</div>;

  const concluir = async () => {
    setBusy(true);
    try { await updateUserTaskStatus(payload.task_id, "completed"); setDone("Tarefa concluída."); }
    catch (e) { toast.error((e as { message?: string })?.message ?? "Falha ao concluir."); }
    finally { setBusy(false); }
  };

  return (
    <div className="action-card">
      <div className="action-card__head"><AlarmClock size={15} /> Alerta de tarefa</div>
      <div className="action-card__fields">
        <div className="action-card__row"><span className="action-card__label">Tarefa</span><span className="action-card__value">{payload.title}</span></div>
        <div className="action-card__row"><span className="action-card__label">Tipo</span><span className="action-card__value">{payload.type_label}</span></div>
        <div className="action-card__row"><span className="action-card__label">Prazo</span><span className="action-card__value">{fmt(payload.deadline_at)}</span></div>
      </div>
      {mode === "reschedule" ? (
        <RescheduleInline taskId={payload.task_id} onDone={() => { setMode("idle"); setDone("Tarefa reagendada."); }} />
      ) : (
        <div className="action-card__actions" style={{ flexWrap: "wrap" }}>
          <button type="button" className="action-card__btn action-card__btn--primary" disabled={busy} onClick={concluir}>
            <Check size={14} /> Concluir
          </button>
          <button type="button" className="action-card__btn action-card__btn--ghost" disabled={busy} onClick={() => setMode("reschedule")}>
            <CalendarClock size={14} /> Adiar / Reagendar
          </button>
          {payload.client_id && (
            <button type="button" className="action-card__btn action-card__btn--ghost"
              onClick={() => nav(`/clientes/${payload.client_id}`)}>
              <User2 size={14} /> Abrir cliente
            </button>
          )}
          <button type="button" className="action-card__btn action-card__btn--ghost"
            onClick={() => nav(`/sistema/tarefas?task=${payload.task_id}`)}>
            <Eye size={14} /> Ver detalhes
          </button>
        </div>
      )}
    </div>
  );
}
