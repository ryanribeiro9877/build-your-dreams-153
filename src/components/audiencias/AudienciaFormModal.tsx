import { useEffect, useState, type ReactNode, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { useMeetingLawyers } from "@/hooks/useMeetingLawyers";
import { ClientAutocomplete } from "@/components/agenda/ClientAutocomplete";
import {
  createAudiencia, updateAudiencia, fetchClientProcesses, fetchAudienciaDatetimeAviso,
  type AudienciaRow, type ClientProcessOption,
} from "@/hooks/useAudiencias";
import {
  AUDIENCIA_STATUS_OPTIONS, audienciaStatusOptionsFor,
  isoToLocalInput, localInputToISO, mapAudienciaError, type AudienciaStatus,
} from "@/lib/audiencias";
// Reutiliza os MESMOS tokens/estilos dos modais do /sistema (dark surface, âmbar,
// overlay centralizado, caixa com rolagem interna) — não inventar hex.
import { overlay, modal, input, btnPrimary, btnGhost, COLORS, FONT } from "@/components/kanban/kanbanStyles";

// Ícones SVG inline — o app esconde os ícones do lucide-react globalmente e
// mostra o texto do aria-label em botões só-de-ícone (ver src/index.css); SVG
// próprio não é atingido por essa regra.
type IconProps = { size?: number };
function Svg({ size = 16, children }: IconProps & { children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
  );
}
const IcX = (p: IconProps) => <Svg {...p}><path d="M18 6 6 18M6 6l12 12" /></Svg>;

interface Props {
  /** null = criação; preenchido = edição. */
  audiencia: AudienciaRow | null;
  /**
   * Cliente fixo (aba do cliente): trava o vínculo e esconde o autocomplete.
   * Ausente no módulo geral, onde o cliente é buscado via ClientAutocomplete.
   */
  fixedClient?: { id: string; name: string };
  onClose: () => void;
  onSaved: () => void;
}

export function AudienciaFormModal({ audiencia, fixedClient, onClose, onSaved }: Props) {
  const isEdit = !!audiencia;
  const { lawyers } = useMeetingLawyers();

  // Cliente: fixo (aba) tem prioridade; senão o valor da audiência (edição) ou vazio.
  const [clientName, setClientName] = useState(fixedClient?.name ?? audiencia?.client_name ?? "");
  const [clientId, setClientId] = useState<string | null>(fixedClient?.id ?? audiencia?.client_id ?? null);

  const [processId, setProcessId] = useState<string | null>(audiencia?.process_id ?? null);
  const [processes, setProcesses] = useState<ClientProcessOption[]>([]);
  const [tipoAcao, setTipoAcao] = useState(audiencia?.tipo_acao ?? "");
  const [parteContraria, setParteContraria] = useState(audiencia?.parte_contraria ?? "");
  const [dataHora, setDataHora] = useState(isoToLocalInput(audiencia?.data_hora));
  const [linkLocal, setLinkLocal] = useState(audiencia?.link_local ?? "");
  const [advogadoId, setAdvogadoId] = useState(audiencia?.advogado_user_id ?? "");
  const [status, setStatus] = useState<AudienciaStatus>(audiencia?.status ?? "marcada");
  const [observacoes, setObservacoes] = useState(audiencia?.observacoes ?? "");
  const [saving, setSaving] = useState(false);
  // Só mostramos os erros inline depois que o usuário interage (evita abrir o
  // formulário todo vermelho). Vira true no primeiro blur de qualquer campo.
  const [showErrors, setShowErrors] = useState(false);
  // Aviso não-bloqueante sobre a data/hora (fora do padrão de audiências).
  const [dateAviso, setDateAviso] = useState("");

  // Picker de processo: casa por client_id OU client_name (processes tem FK
  // parcial — mesmo vínculo do ProcessosTab). Recarrega ao trocar cliente.
  useEffect(() => {
    let cancelled = false;
    const name = clientName.trim();
    if (!clientId && !name) { setProcesses([]); return; }
    fetchClientProcesses(clientId, name)
      .then((rows) => { if (!cancelled) setProcesses(rows); })
      .catch(() => { if (!cancelled) setProcesses([]); });
    return () => { cancelled = true; };
  }, [clientId, clientName]);

  // Aviso de data/hora: consulta a RPC quando muda (débito leve; degrada p/ '').
  useEffect(() => {
    let cancelled = false;
    const iso = localInputToISO(dataHora);
    if (!iso) { setDateAviso(""); return; }
    fetchAudienciaDatetimeAviso(iso)
      .then((motivo) => { if (!cancelled) setDateAviso(motivo); })
      .catch(() => { if (!cancelled) setDateAviso(""); });
    return () => { cancelled = true; };
  }, [dataHora]);

  // Na criação, status arranca em "marcada"; na edição, respeita a máquina de estados.
  const statusChoices = isEdit && audiencia
    ? audienciaStatusOptionsFor(audiencia.status)
    : AUDIENCIA_STATUS_OPTIONS.filter((o) => o.value === "marcada" || o.value === "confirmada");

  // Obrigatórios (casam com o backstop da RPC create_audiencia). Cliente e
  // processo só valem na criação — o update não persiste esses vínculos. Data/
  // hora e advogado valem sempre. Link/Local e o resto seguem opcionais.
  const errClient = !isEdit && !clientId ? "Selecione o cliente." : null;
  const errProcess = !isEdit && !processId ? "Selecione o processo / ação." : null;
  const errAdvogado = !advogadoId ? "Selecione o advogado responsável." : null;
  const errDataHora = !localInputToISO(dataHora) ? "Informe a data e hora da audiência." : null;
  const invalid = !!(errClient || errProcess || errAdvogado || errDataHora);

  const save = async () => {
    const iso = localInputToISO(dataHora);
    if (invalid || !iso) {
      setShowErrors(true);
      toast.error(errClient || errProcess || errAdvogado || errDataHora || "Preencha os campos obrigatórios.");
      return;
    }
    setSaving(true);
    try {
      if (isEdit && audiencia) {
        await updateAudiencia({
          p_id: audiencia.id,
          p_data_hora: iso,
          p_tipo_acao: tipoAcao.trim() || null,
          p_parte_contraria: parteContraria.trim() || null,
          p_link_local: linkLocal.trim() || null,
          p_advogado_user_id: advogadoId || null,
          p_status: status,
          p_observacoes: observacoes.trim() || null,
        });
        toast.success("Audiência atualizada.");
      } else {
        await createAudiencia({
          p_client_id: clientId,
          p_process_id: processId,
          p_data_hora: iso,
          p_tipo_acao: tipoAcao.trim() || null,
          p_parte_contraria: parteContraria.trim() || null,
          p_link_local: linkLocal.trim() || null,
          p_advogado_user_id: advogadoId || null,
          p_observacoes: observacoes.trim() || null,
        });
        toast.success("Audiência registrada.");
      }
      onSaved();
    } catch (e) {
      toast.error(mapAudienciaError((e as Error).message));
    } finally {
      setSaving(false);
    }
  };

  const labelStyle: CSSProperties = { display: "grid", gap: 4, fontSize: 12, fontWeight: 600, color: COLORS.goldBright, fontFamily: FONT };
  const inputStyle: CSSProperties = { ...input, width: "100%", colorScheme: "dark" };
  const errStyle = { color: "#dc2626", fontSize: 12, fontWeight: 500 } as const;
  const warnStyle = { color: "#a16207", background: "rgba(234,179,8,0.15)", border: "1px solid rgba(234,179,8,0.55)", borderRadius: 8, padding: "6px 10px", fontSize: 12, fontWeight: 500 } as const;
  // Borda vermelha em campo obrigatório vazio, mas só depois de o usuário interagir.
  const invalidBorder = (err: string | null) =>
    showErrors && err ? { ...inputStyle, border: "1px solid #dc2626" } : inputStyle;

  // Portal para document.body: tira o overlay de qualquer ancestral com
  // transform/filter (shell/página), que faria o `position: fixed` ancorar no
  // topo do ancestral em vez de centralizar na viewport. Vale para os dois
  // caminhos de render (módulo e aba via fixedClient) — é o único return.
  return createPortal(
    <div role="dialog" aria-modal="true"
      style={{
        // Cor de backdrop do token; alinhamento FORÇADO aqui (não depende do
        // kanbanStyles.overlay — evita regredir a ancoragem no topo se o token mudar).
        ...overlay,
        position: "fixed", inset: 0, display: "flex",
        alignItems: "center", justifyContent: "center", padding: 0,
      }}
      onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ ...modal, color: COLORS.text1, maxHeight: "88vh", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, flex: 1, color: COLORS.text1, fontFamily: FONT }}>{isEdit ? "Editar audiência" : "Nova audiência"}</h2>
          <button type="button" onClick={onClose} aria-label="Fechar" style={{ background: "transparent", border: "none", color: COLORS.text2, cursor: "pointer" }}><IcX size={18} /></button>
        </div>

        <div style={{ display: "grid", gap: 12 }} onBlur={() => setShowErrors(true)}>
          {/* Cliente */}
          <label style={labelStyle}>Cliente
            {fixedClient ? (
              <input value={clientName} readOnly disabled style={{ ...inputStyle, opacity: 0.8 }} />
            ) : (
              <ClientAutocomplete
                clientName={clientName}
                clientId={clientId}
                onChange={(name, id) => { setClientName(name); setClientId(id); if (id !== clientId) setProcessId(null); }}
              />
            )}
            {showErrors && errClient && <span style={errStyle}>{errClient}</span>}
          </label>

          {/* Processo — picker por cliente (id ou nome) */}
          <label style={labelStyle}>Processo / Ação
            <select value={processId ?? ""} onChange={(e) => setProcessId(e.target.value || null)} style={invalidBorder(errProcess)}
              disabled={!clientName.trim()} aria-invalid={showErrors && !!errProcess}>
              <option value="">{clientName.trim() ? (processes.length ? "— Selecionar processo —" : "Nenhum processo vinculado a este cliente") : "Selecione o cliente primeiro"}</option>
              {processes.map((p) => (
                <option key={p.id} value={p.id}>{p.process_number}{p.description ? ` · ${p.description}` : ""}</option>
              ))}
            </select>
            {showErrors && errProcess && <span style={errStyle}>{errProcess}</span>}
          </label>

          <label style={labelStyle}>Tipo de ação
            <input value={tipoAcao} onChange={(e) => setTipoAcao(e.target.value)} placeholder="Ex.: Trabalhista, Cível…" style={inputStyle} />
          </label>

          <label style={labelStyle}>Parte contrária
            <input value={parteContraria} onChange={(e) => setParteContraria(e.target.value)} style={inputStyle} />
          </label>

          <label style={labelStyle}>Data e hora
            <input type="datetime-local" value={dataHora} onChange={(e) => setDataHora(e.target.value)}
              style={invalidBorder(errDataHora)} aria-invalid={showErrors && !!errDataHora} />
            {showErrors && errDataHora && <span style={errStyle}>{errDataHora}</span>}
            {dateAviso && (
              <span style={warnStyle} role="alert">
                Atenção: horário fora do padrão de audiências ({dateAviso}). Você ainda pode salvar.
              </span>
            )}
          </label>

          <label style={labelStyle}>Link / Local
            <input value={linkLocal} onChange={(e) => setLinkLocal(e.target.value)} placeholder="Link da audiência virtual ou endereço do fórum" style={inputStyle} />
          </label>

          <label style={labelStyle}>Advogado responsável
            <select value={advogadoId} onChange={(e) => setAdvogadoId(e.target.value)} style={invalidBorder(errAdvogado)}
              aria-invalid={showErrors && !!errAdvogado}>
              <option value="">—</option>
              {lawyers.map((u) => <option key={u.user_id} value={u.user_id}>{u.name}</option>)}
            </select>
            {showErrors && errAdvogado && <span style={errStyle}>{errAdvogado}</span>}
          </label>

          <label style={labelStyle}>Status
            <select value={status} onChange={(e) => setStatus(e.target.value as AudienciaStatus)} style={inputStyle}>
              {statusChoices.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>

          <label style={labelStyle}>Observações
            <textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={3} style={{ ...inputStyle, resize: "vertical" }} />
          </label>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
          <button type="button" onClick={save} disabled={saving || invalid}
            title={invalid ? (errClient || errProcess || errAdvogado || errDataHora || "") : undefined}
            style={{ ...btnPrimary, opacity: saving || invalid ? 0.6 : 1, cursor: saving || invalid ? "not-allowed" : "pointer" }}>
            {saving ? "Salvando…" : "Salvar"}
          </button>
          <button type="button" onClick={onClose} style={btnGhost}>Cancelar</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
