import { useEffect, useState } from "react";
import { Check, Pencil, CalendarPlus, AlertCircle } from "lucide-react";
import { createMeeting, getAvailableSlots } from "@/hooks/useMeetings";
import { useAssignableUsers } from "@/hooks/useAssignableUsers";
import { MEETING_TYPE_OPTIONS } from "@/lib/meetings";
import type { ReuniaoDraft } from "@/components/juris-cloud/types";
import { toast } from "sonner";

function friendlyError(msg: string): string {
  if (/slot cheio \(capacidade/i.test(msg)) return "Esse horário está cheio.";
  if (/fora do expediente/i.test(msg)) return "Fora do expediente (dia útil, janela ou feriado). Escolha outro horário.";
  if (/apenas recep/i.test(msg)) return "Só a recepção pode agendar reuniões.";
  if (/estado final/i.test(msg)) return "Essa reunião já foi finalizada e não pode mudar.";
  return msg;
}

/**
 * Cartão de agendamento (kind === 'reuniao_confirm'): renderiza o rascunho
 * extraído pelo agente, pré-preenchido e editável. Só cria a reunião ao
 * confirmar (trava re-submit). Horário via get_available_slots (só slots livres).
 */
export function ReuniaoConfirmCard({ draft }: { draft: ReuniaoDraft }) {
  const [date, setDate] = useState(draft.scheduled_date ?? "");
  const [slots, setSlots] = useState<string[]>([]);
  const [time, setTime] = useState(draft.start_time ?? "");
  const [type, setType] = useState(draft.type ?? "");
  const [clientId, setClientId] = useState<string | null>(draft.client_resolved?.id ?? null);
  const [lawyer, setLawyer] = useState("");
  const [phone, setPhone] = useState(draft.phone ?? "");
  const [suggest, setSuggest] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(false);
  const { users } = useAssignableUsers();

  useEffect(() => {
    if (!date) { setSlots([]); return; }
    getAvailableSlots(date).then(setSlots).catch(() => setSlots([]));
  }, [date]);

  const canConfirm = !!date && !!time && !busy;

  const confirm = async () => {
    if (!canConfirm || created) return;
    setBusy(true); setSuggest(null);
    try {
      await createMeeting({
        p_scheduled_date: date, p_start_time: time,
        p_client_id: clientId ?? undefined,
        p_client_name: !clientId && draft.client_query ? draft.client_query : undefined,
        p_type: type || undefined, p_lawyer_user_id: lawyer || undefined,
        p_phone: phone || undefined, p_status: "scheduled",
      });
      setCreated(true); toast.success("Atendimento agendado.");
    } catch (e) {
      const raw = (e as { message?: string })?.message ?? "";
      toast.error(friendlyError(raw));
      if (/slot cheio \(capacidade/i.test(raw)) {
        try { setSuggest(await getAvailableSlots(date)); } catch { /* ignore */ }
      }
    } finally { setBusy(false); }
  };

  if (created) return (<div className="action-card--done"><Check size={15} style={{ color: "#FACC15" }} /> Atendimento agendado.</div>);

  return (
    <div className="action-card">
      <div className="action-card__head"><CalendarPlus size={15} aria-hidden="true" /> Confirmar atendimento</div>
      <div className="action-card__fields">
        <label style={{ fontSize: 12, color: "var(--text2)" }}>Data {draft.display && <span>(sugerido: {draft.display})</span>}</label>
        <input type="date" value={date} onChange={(e) => { setDate(e.target.value); setTime(""); }} style={{ padding: "6px 8px", borderRadius: 6 }} />

        <label style={{ fontSize: 12, color: "var(--text2)" }}>Horário</label>
        <select value={time} onChange={(e) => setTime(e.target.value)} style={{ padding: "6px 8px", borderRadius: 6 }}>
          <option value="">Selecione…</option>
          {slots.map((s) => <option key={s} value={s}>{s}</option>)}
          {time && !slots.includes(time) && <option value={time}>{time}</option>}
        </select>

        <label style={{ fontSize: 12, color: "var(--text2)" }}>Tipo</label>
        <select value={type} onChange={(e) => setType(e.target.value)} style={{ padding: "6px 8px", borderRadius: 6 }}>
          <option value="">(sem tipo)</option>
          {MEETING_TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>

        {draft.client_candidates.length > 1 ? (
          <>
            <label style={{ fontSize: 12, color: "#EAB308" }}><AlertCircle size={12} style={{ verticalAlign: "middle" }} /> Cliente ambíguo — escolha</label>
            <select value={clientId ?? ""} onChange={(e) => setClientId(e.target.value || null)} style={{ padding: "6px 8px", borderRadius: 6 }}>
              <option value="">Sem cliente</option>
              {draft.client_candidates.map((c) => <option key={c.id} value={c.id}>{[c.name, c.cpf_masked, c.status].filter(Boolean).join(" · ")}</option>)}
            </select>
          </>
        ) : draft.client_resolved ? (
          <div className="action-card__row"><span className="action-card__label">Cliente</span>
            <span className="action-card__value">{[draft.client_resolved.name, draft.client_resolved.cpf_masked].filter(Boolean).join(" · ")}</span></div>
        ) : draft.client_query ? (
          <div className="action-card__row"><span className="action-card__label">Cliente</span>
            <span className="action-card__value" style={{ color: "#EAB308" }}>"{draft.client_query}" — em aberto</span></div>
        ) : null}

        <label style={{ fontSize: 12, color: "var(--text2)" }}>Advogado <span style={{ color: "var(--text3, #8a8a99)" }}>(opcional)</span></label>
        <select value={lawyer} onChange={(e) => setLawyer(e.target.value)} style={{ padding: "6px 8px", borderRadius: 6 }}>
          <option value="">(nenhum)</option>
          {users.map((u) => <option key={u.user_id} value={u.user_id}>{u.name}</option>)}
        </select>

        <label style={{ fontSize: 12, color: "var(--text2)" }}>Telefone <span style={{ color: "var(--text3, #8a8a99)" }}>(opcional)</span></label>
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(00) 00000-0000" style={{ padding: "6px 8px", borderRadius: 6 }} />

        {suggest && (<div style={{ fontSize: 12, color: "#EAB308" }}>Horários livres em {date}: {suggest.length ? suggest.join(", ") : "nenhum"}.</div>)}
      </div>
      <div className="action-card__actions">
        <button type="button" className="action-card__btn action-card__btn--primary" disabled={!canConfirm} onClick={confirm}><Check size={15} aria-hidden="true" /> Confirmar</button>
        <button type="button" className="action-card__btn action-card__btn--ghost" disabled={busy} onClick={() => toast.message("Ajuste os campos e confirme quando estiver certo.")}><Pencil size={14} aria-hidden="true" /> Corrigir</button>
      </div>
    </div>
  );
}
