import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CalendarClock, Trash2, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useAssignableUsers } from "@/hooks/useAssignableUsers";
import {
  createMeeting, updateMeeting, deleteMeeting, getMeetingAudit, getAvailableSlots,
  type MeetingRow, type MeetingAuditRow,
} from "@/hooks/useMeetings";
import {
  MEETING_STATUS_OPTIONS, MEETING_TYPE_OPTIONS, statusOptionsFor, type MeetingStatus,
} from "@/lib/meetings";

interface Props {
  meeting: MeetingRow | null; // null = criação
  defaultDate: string;        // "YYYY-MM-DD"
  onClose: () => void;
  onSaved: () => void;
  onOpenClient: (clientId: string) => void;
}

export function MeetingDetailModal({ meeting, defaultDate, onClose, onSaved, onOpenClient }: Props) {
  const isEdit = !!meeting;
  const { hasRole } = useAuth();
  // useAssignableUsers retorna { users, loading, error, refetch } com itens
  // { user_id, name, role_label } (ver src/hooks/useAssignableUsers.ts) —
  // não { assignableUsers } com full_name/display_name como no brief original.
  const { users: assignableUsers } = useAssignableUsers();
  const canDelete = hasRole("admin"); // sócio/admin — o gate real é no banco

  const [scheduledDate, setScheduledDate] = useState(meeting?.scheduled_date ?? defaultDate);
  const [startTime, setStartTime] = useState((meeting?.start_time ?? "09:00").slice(0, 5));
  const [type, setType] = useState(meeting?.type ?? "");
  const [clientName, setClientName] = useState(meeting?.client_name ?? "");
  const [phone, setPhone] = useState(meeting?.phone ?? "");
  const [lawyerId, setLawyerId] = useState(meeting?.lawyer_user_id ?? "");
  const [status, setStatus] = useState<MeetingStatus>(meeting?.status ?? "scheduled");
  const [summary, setSummary] = useState(meeting?.summary ?? "");
  const [notes, setNotes] = useState(meeting?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [audit, setAudit] = useState<MeetingAuditRow[]>([]);
  const [slots, setSlots] = useState<string[]>([]);

  useEffect(() => {
    if (meeting) getMeetingAudit(meeting.id).then(setAudit).catch(() => setAudit([]));
  }, [meeting]);

  // Slots disponíveis para a data escolhida (5.2): cheios/fora do expediente somem.
  useEffect(() => {
    let cancelled = false;
    getAvailableSlots(scheduledDate)
      .then((s) => { if (!cancelled) setSlots(s); })
      .catch(() => { if (!cancelled) setSlots([]); });
    return () => { cancelled = true; };
  }, [scheduledDate]);

  // Inclui o horário atual (edição) mesmo que o slot já esteja cheio por conta desta reunião.
  const slotOptions = Array.from(new Set([startTime, ...slots].filter(Boolean))).sort();
  const statusChoices = isEdit && meeting
    ? statusOptionsFor(meeting.status)
    : MEETING_STATUS_OPTIONS.filter((o) => o.value === "scheduled" || o.value === "confirmed" || o.value === "rescheduled");

  const save = async () => {
    if (!scheduledDate || !startTime) { toast.error("Data e horário são obrigatórios."); return; }
    setSaving(true);
    try {
      if (isEdit && meeting) {
        await updateMeeting({
          p_id: meeting.id, p_scheduled_date: scheduledDate, p_start_time: startTime,
          p_end_time: null, p_type: type || null, p_lawyer_user_id: lawyerId || null,
          p_receptionist_user_id: meeting.receptionist_user_id, p_client_id: meeting.client_id,
          p_client_name: clientName || null, p_phone: phone || null, p_summary: summary || null,
          p_notes: notes || null, p_status: status,
        });
        toast.success("Reunião atualizada.");
      } else {
        await createMeeting({
          p_scheduled_date: scheduledDate, p_start_time: startTime, p_end_time: null,
          p_type: type || null, p_lawyer_user_id: lawyerId || null, p_client_name: clientName || null,
          p_phone: phone || null, p_summary: summary || null, p_notes: notes || null, p_status: status,
        });
        toast.success("Reunião criada.");
      }
      onSaved();
    } catch (e) {
      toast.error(`Falha ao salvar: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!meeting) return;
    if (!window.confirm("Excluir esta reunião? Esta ação não pode ser desfeita.")) return;
    try {
      await deleteMeeting(meeting.id);
      toast.success("Reunião excluída.");
      onSaved();
    } catch (e) {
      toast.error(`Falha ao excluir: ${(e as Error).message}`);
    }
  };

  return (
    <div role="dialog" aria-modal="true" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--surface, #fff)", color: "var(--text1, #111)", borderRadius: 12, padding: 20, width: "min(560px, 92vw)", maxHeight: "88vh", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, flex: 1 }}>{isEdit ? "Editar reunião" : "Nova reunião"}</h2>
          <button type="button" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          <label>Data<input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} style={{ width: "100%" }} /></label>
          <label>Horário
            <select value={startTime} onChange={(e) => setStartTime(e.target.value)} style={{ width: "100%" }}>
              {slotOptions.length === 0 && <option value="">Sem horários disponíveis</option>}
              {slotOptions.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label>Tipo
            <select value={type} onChange={(e) => setType(e.target.value)} style={{ width: "100%" }}>
              <option value="">—</option>
              {MEETING_TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label>Cliente (nome)<input value={clientName} onChange={(e) => setClientName(e.target.value)} style={{ width: "100%" }} /></label>
          <label>Telefone<input value={phone} onChange={(e) => setPhone(e.target.value)} style={{ width: "100%" }} /></label>
          <label>Advogado
            <select value={lawyerId} onChange={(e) => setLawyerId(e.target.value)} style={{ width: "100%" }}>
              <option value="">—</option>
              {assignableUsers.map((u) => <option key={u.user_id} value={u.user_id}>{u.name}</option>)}
            </select>
          </label>
          <label>Status
            <select value={status} onChange={(e) => setStatus(e.target.value as MeetingStatus)} style={{ width: "100%" }}>
              {statusChoices.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label>Resumo<textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={2} style={{ width: "100%" }} /></label>
          <label>Observações<textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} style={{ width: "100%" }} /></label>
        </div>

        {/* Gancho Trilha D: desabilitado até OAuth existir. */}
        <button type="button" disabled title="Requer conexão Google (em breve)"
          style={{ marginTop: 14, display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 8, opacity: 0.5, cursor: "not-allowed" }}>
          <CalendarClock size={16} /> Sincronizar com Google Agenda
        </button>

        {isEdit && meeting?.client_id && (
          <button type="button" onClick={() => onOpenClient(meeting.client_id!)} style={{ marginTop: 8, display: "block" }}>
            Abrir cadastro do cliente
          </button>
        )}

        {isEdit && (
          <section style={{ marginTop: 16 }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Histórico</h3>
            {audit.length === 0 ? <div style={{ fontSize: 12, color: "var(--text3, #999)" }}>Sem alterações registradas.</div> : (
              <ul style={{ fontSize: 12, display: "grid", gap: 4 }}>
                {audit.map((a) => (
                  <li key={a.id}>
                    <strong>{a.field}</strong>: {a.old_value ?? "—"} → {a.new_value ?? "—"} <span style={{ color: "var(--text3, #999)" }}>({a.actor_name ?? "Sistema"}, {new Date(a.created_at).toLocaleString("pt-BR")})</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
          <button type="button" onClick={save} disabled={saving} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#EAB308", color: "#111", fontWeight: 600, cursor: "pointer" }}>
            {saving ? "Salvando…" : "Salvar"}
          </button>
          <button type="button" onClick={onClose} style={{ padding: "8px 16px", borderRadius: 8 }}>Cancelar</button>
          {isEdit && canDelete && (
            <button type="button" onClick={remove} style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 8, color: "#DC2626" }}>
              <Trash2 size={16} /> Excluir
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
