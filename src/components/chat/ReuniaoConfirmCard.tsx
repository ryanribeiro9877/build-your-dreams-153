import { useEffect, useMemo, useState } from "react";
import { Check, Pencil, CalendarPlus, AlertCircle, UserPlus } from "lucide-react";
import { createMeeting, getAvailableSlots } from "@/hooks/useMeetings";
import { useMeetingLawyers } from "@/hooks/useMeetingLawyers";
import { supabase } from "@/integrations/supabase/client";
import { MEETING_TYPE_OPTIONS } from "@/lib/meetings";
import type { PendingMeeting, ReuniaoDraft } from "@/components/juris-cloud/types";
import { toast } from "sonner";

// Tipo pré-selecionado para cliente NOVO / prospect (sem histórico) — string EXATA
// já existente no dropdown (não duplicar a lista). Robusto a reordenação da lista.
const DEFAULT_MEETING_TYPE =
  MEETING_TYPE_OPTIONS.find((t) => /consulta inicial/i.test(t)) ?? MEETING_TYPE_OPTIONS[0];

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
 *
 * `onCadastrarCliente`: quando o cliente não é encontrado (0 candidatos), em vez
 * de só bloquear, o cartão oferece "Cadastrar cliente" e devolve um snapshot ao
 * vivo do que já foi preenchido — o container leva ao cadastro (Modelo A) e agenda
 * automaticamente ao concluir. Ausente → comportamento antigo (só bloqueia).
 */
export function ReuniaoConfirmCard({
  draft, onCadastrarCliente,
}: { draft: ReuniaoDraft; onCadastrarCliente?: (snapshot: PendingMeeting) => void }) {
  const [date, setDate] = useState(draft.scheduled_date ?? "");
  const [slots, setSlots] = useState<string[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [time, setTime] = useState(draft.start_time ?? "");
  const [type, setType] = useState(draft.type ?? "");
  const [typeTouched, setTypeTouched] = useState(!!draft.type); // rascunho c/ tipo = respeitar
  const [clientId, setClientId] = useState<string | null>(draft.client_resolved?.id ?? null);
  // Cartão REABERTO após cadastro pode trazer o advogado já escolhido (preserva o trabalho).
  const [lawyer, setLawyer] = useState(draft.lawyer_user_id ?? "");
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
  // e preenche o Telefone. Reusa as RPCs CANÔNICAS do sistema (client_has_meeting_history
  // e get_client_priority_phone — mesma regra usada nas demais telas; não recriar no
  // front), ambas recepção-only. Fora dos tipos gerados → cast; supabase.rpc chamado
  // ACOPLADO (desacoplar quebra o this.rest). Só age se o campo não veio do rascunho
  // nem foi editado à mão; mantém tudo editável.
  useEffect(() => {
    if (typeTouched && phoneTouched) return;
    if (!clientId) { if (!typeTouched) setType(DEFAULT_MEETING_TYPE); return; } // prospect/não-resolvido → Consulta inicial
    let cancelled = false;
    const sb = supabase as unknown as {
      rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
    };
    (async () => {
      if (!typeTouched) {
        // Com histórico → abre sem seleção (lista completa); sem histórico → default.
        // Erro de leitura → trata como "tem histórico" (não decide default por falha).
        const { data, error } = await sb.rpc("client_has_meeting_history", { p_client_id: clientId });
        if (!cancelled) setType(error || data === true ? "" : DEFAULT_MEETING_TYPE);
      }
      if (!phoneTouched) {
        // Telefone marcado como WhatsApp pela prioridade canônica do sistema; sem
        // WhatsApp → null → campo vazio (não inventa).
        const { data } = await sb.rpc("get_client_priority_phone", { p_client_id: clientId });
        if (!cancelled) setPhone(typeof data === "string" ? data : "");
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

  // Cliente NÃO ENCONTRADO (sem resolvido, sem candidatos): em vez de só bloquear,
  // oferece o cadastro em linha — mas só quando o container fornece o handler.
  const clientNotFound = !clientId && draft.client_candidates.length === 0 && !draft.client_resolved;
  const showCadastrarBtn = clientNotFound && !!onCadastrarCliente;

  // Snapshot AO VIVO do que o usuário já preencheu — para o agendamento pós-cadastro
  // reaproveitar tudo (não perder o trabalho). Vazios viram null.
  const buildSnapshot = (): PendingMeeting => ({
    client_name_hint: draft.client_query,
    scheduled_date: date || null,
    start_time: time || null,
    type: type || null,
    lawyer_user_id: lawyer || null,
    lawyer_hint: draft.lawyer_hint,
    phone: phone || null,
    display: draft.display,
  });

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
          {confirmBlockReason && <div style={{ fontSize: 12, color: "#EAB308", padding: "0 16px 8px" }}>{confirmBlockReason}</div>}
          <div className="action-card__actions">
            <button type="button" className="action-card__btn action-card__btn--primary" disabled={!canConfirm} onClick={confirm}><Check size={15} aria-hidden="true" /> Confirmar</button>
            <button type="button" className="action-card__btn action-card__btn--ghost" disabled={busy} onClick={() => toast.message("Ajuste os campos e confirme quando estiver certo.")}><Pencil size={14} aria-hidden="true" /> Corrigir</button>
          </div>
        </>
      )}
    </div>
  );
}
