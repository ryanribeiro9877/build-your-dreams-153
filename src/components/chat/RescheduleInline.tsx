import { useState } from "react";
import { CalendarClock, Check, X } from "lucide-react";
import { rescheduleUserTask } from "@/hooks/useUserTasks";
import { toast } from "sonner";

export function RescheduleInline({ taskId, onDone }: { taskId: string; onDone: () => void }) {
  const [when, setWhen] = useState("");         // datetime-local
  const [justificativa, setJustificativa] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!when) { toast.error("Escolha o novo prazo."); return; }
    if (justificativa.trim().length === 0) { toast.error("Justificativa é obrigatória."); return; }
    setBusy(true);
    try {
      await rescheduleUserTask(taskId, new Date(when).toISOString(), justificativa.trim());
      toast.success("Tarefa reagendada.");
      onDone();
    } catch (e) {
      toast.error((e as { message?: string })?.message ?? "Falha ao reagendar.");
    } finally { setBusy(false); }
  };

  return (
    <div className="action-card__fields" style={{ gap: 8 }}>
      <label style={{ fontSize: 12, color: "var(--text2)" }}>Novo prazo</label>
      <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)}
        style={{ padding: "6px 8px", borderRadius: 6 }} />
      <label style={{ fontSize: 12, color: "var(--text2)" }}>Justificativa (obrigatória)</label>
      <textarea value={justificativa} onChange={(e) => setJustificativa(e.target.value)}
        rows={2} placeholder="Por que está sendo reagendada?" style={{ padding: "6px 8px", borderRadius: 6 }} />
      <div className="action-card__actions">
        <button type="button" className="action-card__btn action-card__btn--primary" disabled={busy} onClick={submit}>
          <Check size={14} /> Reagendar
        </button>
        <button type="button" className="action-card__btn action-card__btn--ghost" disabled={busy} onClick={onDone}>
          <X size={14} /> Cancelar
        </button>
      </div>
    </div>
  );
}
