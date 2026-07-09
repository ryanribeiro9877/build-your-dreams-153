import { useEffect, useState } from "react";
import { CalendarClock, Check, X, AlertTriangle } from "lucide-react";
import { rescheduleUserTask } from "@/hooks/useUserTasks";
import {
  loadBusinessHours,
  isWithinBusinessHours,
  nextBusinessSlot,
  DEFAULT_BUSINESS_HOURS,
  type BusinessHours,
} from "@/lib/businessHours";
import { toast } from "sonner";

/** Converte um Date para o formato aceito por <input type="datetime-local"> (fuso local). */
function toDatetimeLocalValue(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function RescheduleInline({ taskId, onDone }: { taskId: string; onDone: () => void }) {
  const [when, setWhen] = useState("");         // datetime-local
  const [justificativa, setJustificativa] = useState("");
  const [busy, setBusy] = useState(false);
  const [businessHours, setBusinessHours] = useState<BusinessHours>(DEFAULT_BUSINESS_HOURS);
  const [suggestion, setSuggestion] = useState<Date | null>(null);

  // Carrega a config de horário comercial uma vez (com fallback aos defaults).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cfg = await loadBusinessHours();
      if (!cancelled) setBusinessHours(cfg);
    })();
    return () => { cancelled = true; };
  }, []);

  // Recalcula o aviso "fora do expediente" a cada mudança do prazo escolhido.
  // NUNCA bloqueia o envio — apenas avisa e sugere o próximo horário útil.
  useEffect(() => {
    if (!when) { setSuggestion(null); return; }
    const chosen = new Date(when);
    if (Number.isNaN(chosen.getTime())) { setSuggestion(null); return; }
    setSuggestion(isWithinBusinessHours(chosen, businessHours) ? null : nextBusinessSlot(chosen, businessHours));
  }, [when, businessHours]);

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
      {suggestion && (
        <div
          style={{
            display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
            fontSize: 11.5, color: "#facc15", background: "rgba(234,179,8,0.08)",
            border: "1px solid rgba(234,179,8,0.3)", borderRadius: 6, padding: "6px 8px",
          }}
        >
          <AlertTriangle size={13} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1 }}>
            Fora do expediente. Próximo horário útil: {suggestion.toLocaleString("pt-BR")}
          </span>
          <button
            type="button"
            onClick={() => setWhen(toDatetimeLocalValue(suggestion))}
            style={{
              padding: "3px 8px", borderRadius: 6,
              border: "1px solid rgba(234,179,8,0.5)", background: "transparent",
              color: "#facc15", fontSize: 11, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
            }}
          >
            Usar sugestão
          </button>
        </div>
      )}
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
