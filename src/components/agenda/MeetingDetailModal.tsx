import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useMeetingLawyers } from "@/hooks/useMeetingLawyers";
import {
  createMeeting, updateMeeting, deleteMeeting, getMeetingAudit, getAvailableSlots, createMeetingTask,
  type MeetingRow, type MeetingAuditRow,
} from "@/hooks/useMeetings";
import {
  MEETING_STATUS_OPTIONS, MEETING_TYPE_OPTIONS, statusOptionsFor, type MeetingStatus,
} from "@/lib/meetings";
import { GOOGLE_SYNC_ENABLED, syncMeetingToGoogle } from "@/lib/googleCalendarSync";
import { ClientAutocomplete } from "@/components/agenda/ClientAutocomplete";

// Ícones em SVG inline (sem a classe .lucide) — este app esconde os ícones do
// lucide-react globalmente (ver src/index.css) e mostra o texto do aria-label em
// botões só-de-ícone (ex.: o "X" de fechar virava o texto "Fechar"). SVG próprio
// não é atingido pela regra global.
type IconProps = { size?: number };
function Svg({ size = 16, children }: IconProps & { children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}
const IcX = (p: IconProps) => <Svg {...p}><path d="M18 6 6 18M6 6l12 12" /></Svg>;
const IcTrash = (p: IconProps) => <Svg {...p}><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6" /></Svg>;
const IcCalendarClock = (p: IconProps) => <Svg {...p}><path d="M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4.5M16 2v4M8 2v4M3 10h7M16 14v2l1.5 1.5" /><circle cx="16" cy="16" r="6" /></Svg>;

// Estilo dos campos do formulário — mesmo padrão usado no resto do app
// (dashboardKit/CronJobs/RevisaoPecaPanel): fundo escuro, borda sutil, texto
// claro. Sem isso, input/select/textarea caem no branco padrão do navegador,
// que não herda o tema do modal.
const modalInputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 10px", borderRadius: 6,
  background: "var(--bg1, #09090f)", border: "1px solid var(--border, #1e1e2e)",
  color: "var(--text1, #eeeef5)", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box",
};
const modalLabelStyle: React.CSSProperties = {
  fontSize: 12, color: "var(--text3, #888)", display: "grid", gap: 4,
};
const modalButtonStyle: React.CSSProperties = {
  padding: "8px 16px", borderRadius: 8, border: "1px solid var(--border, #1e1e2e)",
  background: "transparent", color: "var(--text2, #ccc)", cursor: "pointer", fontSize: 13,
};

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
  // Só sócio + advogadas (role_templates.code) podem ser o advogado da reunião —
  // via list_meeting_lawyers, mesmo modelo de papel do RLS. Ver useMeetingLawyers.
  const { lawyers } = useMeetingLawyers();
  const canDelete = hasRole("admin"); // sócio/admin — o gate real é no banco

  const [scheduledDate, setScheduledDate] = useState(meeting?.scheduled_date ?? defaultDate);
  const [startTime, setStartTime] = useState((meeting?.start_time ?? "09:00").slice(0, 5));
  const [type, setType] = useState(meeting?.type ?? "");
  const [clientName, setClientName] = useState(meeting?.client_name ?? "");
  // client_id (uuid) só é gravado quando um cliente do cadastro é selecionado no
  // autocomplete; segue null para prospect ainda não cadastrado (intencional).
  const [clientId, setClientId] = useState<string | null>(meeting?.client_id ?? null);
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
    // Advogado responsável obrigatório para reuniões ativas (espelha create_meeting/
    // update_meeting no banco). Estados terminais (cancelar/realizada/não-compareceu)
    // não exigem — permite fechar o ciclo de reuniões antigas sem advogado.
    if (["scheduled", "confirmed", "rescheduled"].includes(status) && !lawyerId) {
      toast.error("Selecione o advogado responsável."); return;
    }
    setSaving(true);
    try {
      if (isEdit && meeting) {
        await updateMeeting({
          p_id: meeting.id, p_scheduled_date: scheduledDate, p_start_time: startTime,
          p_end_time: null, p_type: type || null, p_lawyer_user_id: lawyerId || null,
          p_receptionist_user_id: meeting.receptionist_user_id, p_client_id: clientId,
          p_client_name: clientName || null, p_phone: phone || null, p_summary: summary || null,
          p_notes: notes || null, p_status: status,
        });
        toast.success("Reunião atualizada.");
      } else {
        await createMeeting({
          p_scheduled_date: scheduledDate, p_start_time: startTime, p_end_time: null,
          p_type: type || null, p_lawyer_user_id: lawyerId || null, p_client_id: clientId,
          p_client_name: clientName || null,
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

  const createTask = async () => {
    if (!meeting) return;
    try {
      await createMeetingTask(meeting.id);
      toast.success("Tarefa vinculada criada.");
    } catch (e) {
      toast.error(`Falha ao criar tarefa: ${(e as Error).message}`);
    }
  };

  return (
    <div role="dialog" aria-modal="true" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--bg3, #13131f)", color: "var(--text1, #eeeef5)", border: "1px solid var(--border, #1e1e2e)", borderRadius: 12, padding: 20, width: "min(560px, 92vw)", maxHeight: "88vh", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, flex: 1 }}>{isEdit ? "Editar reunião" : "Nova reunião"}</h2>
          <button type="button" onClick={onClose} aria-label="Fechar"><IcX size={18} /></button>
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          <label style={modalLabelStyle}>Data<input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} style={modalInputStyle} /></label>
          <label style={modalLabelStyle}>Horário
            <select value={startTime} onChange={(e) => setStartTime(e.target.value)} style={modalInputStyle}>
              {slotOptions.length === 0 && <option value="">Sem horários disponíveis</option>}
              {slotOptions.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label style={modalLabelStyle}>Tipo
            <select value={type} onChange={(e) => setType(e.target.value)} style={modalInputStyle}>
              <option value="">—</option>
              {MEETING_TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label style={modalLabelStyle}>Cliente
            <ClientAutocomplete
              clientName={clientName}
              clientId={clientId}
              onChange={(name, id) => { setClientName(name); setClientId(id); }}
            />
          </label>
          <label style={modalLabelStyle}>Telefone<input value={phone} onChange={(e) => setPhone(e.target.value)} style={modalInputStyle} /></label>
          <label style={modalLabelStyle}>Advogado
            <select value={lawyerId} onChange={(e) => setLawyerId(e.target.value)} style={modalInputStyle}>
              <option value="">—</option>
              {lawyers.map((u) => <option key={u.user_id} value={u.user_id}>{u.name}</option>)}
            </select>
          </label>
          <label style={modalLabelStyle}>Status
            <select value={status} onChange={(e) => setStatus(e.target.value as MeetingStatus)} style={modalInputStyle}>
              {statusChoices.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label style={modalLabelStyle}>Resumo<textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={2} style={modalInputStyle} /></label>
          <label style={modalLabelStyle}>Observações<textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} style={modalInputStyle} /></label>
        </div>

        {/* Gancho Trilha D: fiado porém desabilitado até OAuth/edge existirem
            (ver src/lib/googleCalendarSync.ts — vira GOOGLE_SYNC_ENABLED=true). */}
        <button type="button"
          disabled={!GOOGLE_SYNC_ENABLED || !isEdit}
          title={GOOGLE_SYNC_ENABLED ? "Sincronizar esta reunião com o Google Agenda" : "Requer conexão Google (em breve)"}
          onClick={async () => {
            if (!meeting) return;
            const r = await syncMeetingToGoogle(meeting.id);
            if (r.status === "synced") toast.success("Reunião sincronizada com o Google Agenda.");
            else if (r.status === "error") toast.error(r.message ?? "Falha ao sincronizar com o Google Agenda.");
            else toast.info(r.message ?? "Integração Google Agenda ainda não configurada.");
          }}
          style={{ marginTop: 14, display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border, #1e1e2e)", background: "transparent", color: "var(--text2, #ccc)", opacity: GOOGLE_SYNC_ENABLED && isEdit ? 1 : 0.5, cursor: GOOGLE_SYNC_ENABLED && isEdit ? "pointer" : "not-allowed" }}>
          <IcCalendarClock size={16} /> Sincronizar com Google Agenda
        </button>

        {isEdit && meeting?.client_id && (
          <button type="button" onClick={() => onOpenClient(meeting.client_id!)} style={{ ...modalButtonStyle, marginTop: 8, display: "block" }}>
            Abrir cadastro do cliente
          </button>
        )}

        {isEdit && (
          <button type="button" onClick={createTask} style={{ ...modalButtonStyle, marginTop: 8, display: "block" }}>
            Criar tarefa vinculada
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
          <button type="button" onClick={save} disabled={saving} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "var(--gold, #c9a84c)", color: "#0a0a12", fontWeight: 600, cursor: "pointer" }}>
            {saving ? "Salvando…" : "Salvar"}
          </button>
          <button type="button" onClick={onClose} style={modalButtonStyle}>Cancelar</button>
          {isEdit && canDelete && (
            <button type="button" onClick={remove} style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(239,68,68,0.35)", background: "transparent", color: "#ef4444", cursor: "pointer" }}>
              <IcTrash size={16} /> Excluir
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
