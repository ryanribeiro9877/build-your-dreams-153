import { useEffect, useMemo, useState } from "react";
import { Check, Pencil, CalendarPlus, AlertCircle } from "lucide-react";
import { createMeeting, getAvailableSlots } from "@/hooks/useMeetings";
import { useMeetingLawyers } from "@/hooks/useMeetingLawyers";
import { supabase } from "@/integrations/supabase/client";
import { MEETING_TYPE_OPTIONS } from "@/lib/meetings";
import type { ReuniaoDraft } from "@/components/juris-cloud/types";
import { toast } from "sonner";

// Tipo pré-selecionado para cliente NOVO / prospect (sem histórico) — string EXATA
// já existente no dropdown (não duplicar a lista). Robusto a reordenação da lista.
const DEFAULT_MEETING_TYPE =
  MEETING_TYPE_OPTIONS.find((t) => /consulta inicial/i.test(t)) ?? MEETING_TYPE_OPTIONS[0];

// Campos de telefone/WhatsApp de `clients` (fora dos tipos gerados — desync repo↔banco;
// colunas confirmadas no banco). Leitura direta (não são _enc/criptografados).
type ClientPhones = {
  phone: string | null; phone_is_whatsapp: boolean | null;
  phone_home: string | null; phone_home_is_whatsapp: boolean | null;
  phone_commercial: string | null; phone_commercial_is_whatsapp: boolean | null;
};

function friendlyError(msg: string): string {
  if (/slot cheio \(capacidade/i.test(msg)) return "Esse horário está cheio.";
  if (/fora do expediente/i.test(msg)) return "Fora do expediente (dia útil, janela ou feriado). Escolha outro horário.";
  if (/apenas recep/i.test(msg)) return "Só a recepção pode agendar reuniões.";
  if (/advogado.*obrigat/i.test(msg)) return "Selecione o advogado responsável.";
  if (/estado final/i.test(msg)) return "Essa reunião já foi finalizada e não pode mudar.";
  return msg;
}

// Casa o lawyer_hint ("para <nome>" extraído pelo edge) com o roster de advogados
// (useMeetingLawyers = sócio + adv_*). Substring nos dois sentidos, sem acentos/caixa
// (mesmo critério do matchAssigneeHint da tarefa). Devolve os user_ids que casam:
// 1 → pré-seleção; N → seletor destacado p/ escolher; 0 → (nenhum).
function matchLawyerHint(hint: string | null, options: { user_id: string; name: string }[]): string[] {
  if (!hint) return [];
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const h = norm(hint);
  if (!h) return [];
  return options.filter((o) => { const n = norm(o.name); return !!n && (n.includes(h) || h.includes(n)); }).map((o) => o.user_id);
}

/**
 * Cartão de agendamento (kind === 'reuniao_confirm'): renderiza o rascunho
 * extraído pelo agente, pré-preenchido e editável. Só cria a reunião ao
 * confirmar (trava re-submit). Horário via get_available_slots (só slots livres).
 */
export function ReuniaoConfirmCard({ draft }: { draft: ReuniaoDraft }) {
  const [date, setDate] = useState(draft.scheduled_date ?? "");
  const [slots, setSlots] = useState<string[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [time, setTime] = useState(draft.start_time ?? "");
  const [type, setType] = useState(draft.type ?? "");
  const [typeTouched, setTypeTouched] = useState(!!draft.type); // rascunho c/ tipo = respeitar
  const [clientId, setClientId] = useState<string | null>(draft.client_resolved?.id ?? null);
  const [lawyer, setLawyer] = useState("");
  const [lawyerTouched, setLawyerTouched] = useState(false);
  const [phone, setPhone] = useState(draft.phone ?? "");
  const [phoneTouched, setPhoneTouched] = useState(!!draft.phone); // rascunho c/ telefone = respeitar
  const [suggest, setSuggest] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(false);
  const { lawyers } = useMeetingLawyers();

  useEffect(() => {
    if (!date) { setSlots([]); return; }
    setSlotsLoading(true);
    getAvailableSlots(date).then(setSlots).catch(() => setSlots([])).finally(() => setSlotsLoading(false));
  }, [date]);

  // Correção 3+5: ao resolver/trocar o cliente, pré-seleciona o Tipo pelo histórico
  // e preenche o Telefone com o número marcado como WhatsApp. Ambos sob o JWT da
  // recepção (RLS de meetings/clients já libera SELECT direto — sem RPC nova). Só age
  // se o campo não veio do rascunho nem foi editado à mão; mantém tudo editável.
  useEffect(() => {
    if (typeTouched && phoneTouched) return;
    if (!clientId) { if (!typeTouched) setType(DEFAULT_MEETING_TYPE); return; } // prospect/não-resolvido → Consulta inicial
    let cancelled = false;
    (async () => {
      if (!typeTouched) {
        // Histórico = reuniões não-canceladas do cliente. count>0 → sem seleção
        // (lista completa); count===0 → default. Erro de leitura → trata como count>0.
        const { count, error } = await supabase
          .from("meetings").select("id", { count: "exact", head: true })
          .eq("client_id", clientId).neq("status", "canceled");
        if (!cancelled) setType(error || (count ?? 0) > 0 ? "" : DEFAULT_MEETING_TYPE);
      }
      if (!phoneTouched) {
        // Telefone WhatsApp (prioridade pessoal > residencial > comercial). Nenhum
        // marcado → vazio (não inventa). Colunas fora dos tipos gerados → cast.
        const { data } = await (supabase as unknown as {
          from: (t: string) => { select: (c: string) => { eq: (col: string, v: string) => { maybeSingle: () => Promise<{ data: ClientPhones | null }> } } };
        }).from("clients")
          .select("phone, phone_is_whatsapp, phone_home, phone_home_is_whatsapp, phone_commercial, phone_commercial_is_whatsapp")
          .eq("id", clientId).maybeSingle();
        const auto =
          (data?.phone_is_whatsapp ? data.phone : null) ??
          (data?.phone_home_is_whatsapp ? data.phone_home : null) ??
          (data?.phone_commercial_is_whatsapp ? data.phone_commercial : null) ?? "";
        if (!cancelled) setPhone(auto);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  // Advogado a partir do "para <nome>": 1 correspondência pré-seleciona; N deixa
  // o seletor destacado para escolha; 0 fica em (nenhum). Não sobrescreve escolha manual.
  const lawyerMatches = useMemo(() => matchLawyerHint(draft.lawyer_hint, lawyers), [draft.lawyer_hint, lawyers]);
  useEffect(() => {
    if (!lawyerTouched && !lawyer && lawyerMatches.length === 1) setLawyer(lawyerMatches[0]);
  }, [lawyerMatches, lawyerTouched, lawyer]);

  // Correção 4: só permite confirmar um horário realmente OFERTADO (válido + livre)
  // para a data — a lista vem de get_available_slots (mesma fonte da Agenda, que já
  // aplica business_hours_config + holidays + capacidade). Espelha o que create_meeting
  // recusa no servidor, evitando prometer sábado/feriado/fora de janela/ocupado.
  const timeOffered = !!time && slots.includes(time);
  const slotBlockReason = (!date || !time || timeOffered || slotsLoading) ? null
    : slots.length === 0
      ? "Sem horários nesse dia (fim de semana, feriado ou fora do expediente). Escolha outra data."
      : "Esse horário não está disponível (fora da janela ou já ocupado). Escolha um dos horários livres.";

  // Correção 4+6: só confirma com campos em estado REAL (sem placeholder). Advogado,
  // Tipo e Cliente CADASTRADO obrigatórios (decisão do dono: agendamento pelo chat
  // exige client_id — sem nome livre/prospect aqui; o modal manual da Agenda segue
  // permitindo prospect). Havendo ambiguidade (candidatos > 0), escolher um; sem
  // candidatos (não cadastrado), precisa cadastrar/vincular antes.
  const lawyerOk = !!lawyer;
  const typeOk = !!type;
  const clientOk = !!clientId;
  const canConfirm = !!date && timeOffered && lawyerOk && typeOk && clientOk && !busy;
  const confirmBlockReason =
    !lawyerOk ? "Selecione o advogado responsável."
    : !typeOk ? "Selecione o tipo de atendimento."
    : !clientOk
      ? (draft.client_candidates.length > 0
          ? "Escolha o cliente entre os candidatos listados."
          : "Vincule um cliente cadastrado antes de agendar.")
    : null;

  const confirm = async () => {
    if (!canConfirm || created) return;
    setBusy(true); setSuggest(null);
    try {
      await createMeeting({
        p_scheduled_date: date, p_start_time: time,
        p_client_id: clientId ?? undefined, // cliente cadastrado obrigatório (canConfirm garante)
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
        <input type="date" value={date} onChange={(e) => { setDate(e.target.value); setTime(""); }} />

        <label style={{ fontSize: 12, color: "var(--text2)" }}>Horário</label>
        <select value={time} onChange={(e) => setTime(e.target.value)}>
          <option value="">Selecione…</option>
          {slots.map((s) => <option key={s} value={s}>{s}</option>)}
          {time && !slots.includes(time) && <option value={time}>{time}</option>}
        </select>
        {slotBlockReason && <div style={{ fontSize: 12, color: "#EAB308", padding: "0 16px 4px" }}>{slotBlockReason}</div>}

        <label style={{ fontSize: 12, color: "var(--text2)" }}>Tipo</label>
        <select value={type} onChange={(e) => { setType(e.target.value); setTypeTouched(true); }}>
          <option value="">Selecione…</option>
          {MEETING_TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>

        {draft.client_candidates.length > 1 ? (
          <>
            <label style={{ fontSize: 12, color: "#EAB308" }}><AlertCircle size={12} style={{ verticalAlign: "middle" }} /> Cliente ambíguo — escolha</label>
            <select value={clientId ?? ""} onChange={(e) => setClientId(e.target.value || null)}>
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

        {draft.lawyer_hint && lawyerMatches.length > 1 ? (
          <label style={{ fontSize: 12, color: "#EAB308" }}><AlertCircle size={12} style={{ verticalAlign: "middle" }} /> Advogado ambíguo ("{draft.lawyer_hint}") — escolha</label>
        ) : (
          <label style={{ fontSize: 12, color: "var(--text2)" }}>
            Advogado
            {draft.lawyer_hint && lawyerMatches.length === 0 && <span style={{ color: "#EAB308" }}> — não achei "{draft.lawyer_hint}"</span>}
          </label>
        )}
        <select value={lawyer} onChange={(e) => { setLawyer(e.target.value); setLawyerTouched(true); }}>
          <option value="">Selecione…</option>
          {lawyers.map((u) => <option key={u.user_id} value={u.user_id}>{u.name}</option>)}
        </select>

        <label style={{ fontSize: 12, color: "var(--text2)" }}>Telefone <span style={{ color: "var(--text3, #8a8a99)" }}>(opcional)</span></label>
        <input value={phone} onChange={(e) => { setPhone(e.target.value); setPhoneTouched(true); }} placeholder="(00) 00000-0000" />

        {suggest && (<div style={{ fontSize: 12, color: "#EAB308", padding: "0 16px 4px" }}>Horários livres em {date}: {suggest.length ? suggest.join(", ") : "nenhum"}.</div>)}
      </div>
      {confirmBlockReason && <div style={{ fontSize: 12, color: "#EAB308", padding: "0 16px 8px" }}>{confirmBlockReason}</div>}
      <div className="action-card__actions">
        <button type="button" className="action-card__btn action-card__btn--primary" disabled={!canConfirm} onClick={confirm}><Check size={15} aria-hidden="true" /> Confirmar</button>
        <button type="button" className="action-card__btn action-card__btn--ghost" disabled={busy} onClick={() => toast.message("Ajuste os campos e confirme quando estiver certo.")}><Pencil size={14} aria-hidden="true" /> Corrigir</button>
      </div>
    </div>
  );
}
