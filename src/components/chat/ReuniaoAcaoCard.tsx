import { useEffect, useState } from "react";
import { Check, X, CalendarClock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { updateMeeting, getAvailableSlots } from "@/hooks/useMeetings";
import { MEETING_STATUS_LABELS } from "@/lib/meetings";
import type { ReuniaoAcaoPayload } from "@/components/juris-cloud/types";
import { toast } from "sonner";

const ACTION_LABEL: Record<string, string> = {
  confirmed: "Confirmar", done: "Marcar como realizada", canceled: "Cancelar",
  no_show: "Registrar não-comparecimento", reschedule: "Reagendar",
};
function friendlyError(msg: string): string {
  if (/slot cheio \(capacidade/i.test(msg)) return "Esse horário está cheio.";
  if (/fora do expediente/i.test(msg)) return "Fora do expediente (dia útil, janela ou feriado).";
  if (/apenas recep/i.test(msg)) return "Só a recepção pode alterar reuniões.";
  if (/advogado.*obrigat/i.test(msg)) return "Essa reunião não tem advogado. Defina o advogado responsável na Agenda antes de confirmar/reagendar.";
  if (/estado final/i.test(msg)) return "Essa reunião já foi finalizada e não pode mudar.";
  return msg;
}

/**
 * Cartão de ciclo/reagendar (kind === 'reuniao_acao'). Status = confirmar/cancelar
 * simples; reschedule = editável (nova data/hora via slots livres). Se N candidatas,
 * seletor no topo. No confirmar, busca a linha atual e chama update_meeting
 * (overwrite) preservando os demais campos.
 */
export function ReuniaoAcaoCard({ payload }: { payload: ReuniaoAcaoPayload }) {
  const multi = payload.candidates.length > 1;
  const [selId, setSelId] = useState(payload.candidates[0]?.id ?? "");
  const sel = payload.candidates.find((c) => c.id === selId) ?? payload.candidates[0];
  const isReschedule = payload.action === "reschedule";
  const [date, setDate] = useState(payload.new_date_local ?? sel?.scheduled_date ?? "");
  const [slots, setSlots] = useState<string[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [time, setTime] = useState(payload.new_time_local ?? "");
  const [suggest, setSuggest] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!isReschedule || !date) { setSlots([]); return; }
    setSlotsLoading(true);
    getAvailableSlots(date).then(setSlots).catch(() => setSlots([])).finally(() => setSlotsLoading(false));
  }, [date, isReschedule]);

  // Correção 4 (reagendar): só confirma um horário ofertado (válido + livre) para a
  // data — mesma fonte da Agenda (get_available_slots). Não promete slot que o banco recusa.
  const timeOffered = !!time && slots.includes(time);
  const rescheduleBlocked = isReschedule && !!date && !!time && !timeOffered && !slotsLoading;
  const slotBlockReason = !rescheduleBlocked ? null
    : slots.length === 0
      ? "Sem horários nesse dia (fim de semana, feriado ou fora do expediente). Escolha outra data."
      : "Esse horário não está disponível (fora da janela ou já ocupado). Escolha um dos horários livres.";

  const confirm = async () => {
    if (busy || done || !sel) return;
    if (isReschedule && (!date || !time)) { toast.message("Escolha a nova data e horário."); return; }
    setBusy(true); setSuggest(null);
    try {
      const { data: row, error } = await supabase.from("meetings").select("*").eq("id", sel.id).maybeSingle();
      if (error || !row) throw new Error("Reunião não encontrada.");
      const r = row as Record<string, unknown>;
      await updateMeeting({
        p_id: sel.id,
        p_scheduled_date: isReschedule ? date : (r.scheduled_date as string),
        p_start_time: isReschedule ? time : (r.start_time as string),
        p_end_time: isReschedule ? null : (r.end_time as string | null),
        p_type: (r.type as string | null) ?? null,
        p_lawyer_user_id: (r.lawyer_user_id as string | null) ?? null,
        p_receptionist_user_id: (r.receptionist_user_id as string | null) ?? null,
        p_client_id: (r.client_id as string | null) ?? null,
        p_client_name: (r.client_name as string | null) ?? null,
        p_phone: (r.phone as string | null) ?? null,
        p_summary: (r.summary as string | null) ?? null,
        p_notes: (r.notes as string | null) ?? null,
        p_status: payload.action === "reschedule" ? "rescheduled" : payload.action,
      });
      setDone(true); toast.success("Reunião atualizada.");
    } catch (e) {
      const raw = (e as { message?: string })?.message ?? "";
      toast.error(friendlyError(raw));
      if (isReschedule && /slot cheio \(capacidade/i.test(raw) && date) {
        try { setSuggest(await getAvailableSlots(date)); } catch { /* ignore */ }
      }
    } finally { setBusy(false); }
  };

  if (done) return (<div className="action-card--done"><Check size={15} style={{ color: "#FACC15" }} /> Reunião atualizada.</div>);

  return (
    <div className="action-card">
      <div className="action-card__head"><CalendarClock size={15} aria-hidden="true" /> {ACTION_LABEL[payload.action]}</div>
      <div className="action-card__fields">
        {multi ? (
          <>
            <label style={{ fontSize: 12, color: "#EAB308" }}>Qual reunião?</label>
            <select value={selId} onChange={(e) => setSelId(e.target.value)}>
              {payload.candidates.map((c) => <option key={c.id} value={c.id}>{[c.scheduled_date, c.start_time, c.client_name, MEETING_STATUS_LABELS[c.status as keyof typeof MEETING_STATUS_LABELS] ?? c.status].filter(Boolean).join(" · ")}</option>)}
            </select>
          </>
        ) : sel ? (
          <div className="action-card__row"><span className="action-card__label">Reunião</span>
            <span className="action-card__value">{[sel.scheduled_date, sel.start_time, sel.client_name].filter(Boolean).join(" · ")}</span></div>
        ) : null}

        {isReschedule && (
          <>
            <label style={{ fontSize: 12, color: "var(--text2)" }}>Nova data</label>
            <input type="date" value={date} onChange={(e) => { setDate(e.target.value); setTime(""); }} />
            <label style={{ fontSize: 12, color: "var(--text2)" }}>Novo horário</label>
            <select value={time} onChange={(e) => setTime(e.target.value)}>
              <option value="">Selecione…</option>
              {slots.map((s) => <option key={s} value={s}>{s}</option>)}
              {time && !slots.includes(time) && <option value={time}>{time}</option>}
            </select>
            {slotBlockReason && <div style={{ fontSize: 12, color: "#EAB308", padding: "0 16px 4px" }}>{slotBlockReason}</div>}
            {suggest && (<div style={{ fontSize: 12, color: "#EAB308", padding: "0 16px 4px" }}>Horários livres em {date}: {suggest.length ? suggest.join(", ") : "nenhum"}.</div>)}
          </>
        )}
      </div>
      <div className="action-card__actions">
        <button type="button" className="action-card__btn action-card__btn--primary" disabled={busy || !sel || (isReschedule && !timeOffered)} onClick={confirm}><Check size={15} aria-hidden="true" /> Confirmar</button>
        <button type="button" className="action-card__btn action-card__btn--ghost" disabled={busy} onClick={() => toast.message("Sem alterações.")}><X size={14} aria-hidden="true" /> Fechar</button>
      </div>
    </div>
  );
}
