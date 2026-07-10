import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useMeetingLawyers } from "@/hooks/useMeetingLawyers";
import { ClientAutocomplete } from "@/components/agenda/ClientAutocomplete";
import {
  createAudiencia, updateAudiencia, fetchProcessesByClientName,
  type AudienciaRow, type ClientProcessOption,
} from "@/hooks/useAudiencias";
import {
  AUDIENCIA_STATUS_OPTIONS, audienciaStatusOptionsFor,
  isoToLocalInput, localInputToISO, type AudienciaStatus,
} from "@/lib/audiencias";

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

  // Picker de processo: lista por client_name (processes não tem FK confiável p/
  // clients — mesmo vínculo textual do ProcessosTab). Recarrega ao trocar cliente.
  useEffect(() => {
    let cancelled = false;
    const name = clientName.trim();
    if (!name) { setProcesses([]); return; }
    fetchProcessesByClientName(name)
      .then((rows) => { if (!cancelled) setProcesses(rows); })
      .catch(() => { if (!cancelled) setProcesses([]); });
    return () => { cancelled = true; };
  }, [clientName]);

  // Na criação, status arranca em "marcada"; na edição, respeita a máquina de estados.
  const statusChoices = isEdit && audiencia
    ? audienciaStatusOptionsFor(audiencia.status)
    : AUDIENCIA_STATUS_OPTIONS.filter((o) => o.value === "marcada" || o.value === "confirmada");

  const save = async () => {
    const iso = localInputToISO(dataHora);
    if (!iso) { toast.error("Data e hora da audiência são obrigatórias."); return; }
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
      toast.error(`Falha ao salvar: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const labelStyle = { display: "grid", gap: 4, fontSize: 13, fontWeight: 600 } as const;
  const inputStyle = { width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border, #ddd)", background: "var(--surface, #fff)", color: "var(--text1, #111)", font: "inherit", fontWeight: 400 } as const;

  return (
    <div role="dialog" aria-modal="true"
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}
      onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ background: "var(--surface, #fff)", color: "var(--text1, #111)", borderRadius: 12, padding: 20, width: "min(560px, 92vw)", maxHeight: "88vh", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, flex: 1 }}>{isEdit ? "Editar audiência" : "Nova audiência"}</h2>
          <button type="button" onClick={onClose} aria-label="Fechar"><IcX size={18} /></button>
        </div>

        <div style={{ display: "grid", gap: 12 }}>
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
          </label>

          {/* Processo — picker por client_name */}
          <label style={labelStyle}>Processo / Ação
            <select value={processId ?? ""} onChange={(e) => setProcessId(e.target.value || null)} style={inputStyle}
              disabled={!clientName.trim()}>
              <option value="">{clientName.trim() ? (processes.length ? "— Selecionar processo —" : "Nenhum processo vinculado a este cliente") : "Selecione o cliente primeiro"}</option>
              {processes.map((p) => (
                <option key={p.id} value={p.id}>{p.process_number}{p.description ? ` · ${p.description}` : ""}</option>
              ))}
            </select>
          </label>

          <label style={labelStyle}>Tipo de ação
            <input value={tipoAcao} onChange={(e) => setTipoAcao(e.target.value)} placeholder="Ex.: Trabalhista, Cível…" style={inputStyle} />
          </label>

          <label style={labelStyle}>Parte contrária
            <input value={parteContraria} onChange={(e) => setParteContraria(e.target.value)} style={inputStyle} />
          </label>

          <label style={labelStyle}>Data e hora
            <input type="datetime-local" value={dataHora} onChange={(e) => setDataHora(e.target.value)} style={inputStyle} />
          </label>

          <label style={labelStyle}>Link / Local
            <input value={linkLocal} onChange={(e) => setLinkLocal(e.target.value)} placeholder="Link da audiência virtual ou endereço do fórum" style={inputStyle} />
          </label>

          <label style={labelStyle}>Advogado responsável
            <select value={advogadoId} onChange={(e) => setAdvogadoId(e.target.value)} style={inputStyle}>
              <option value="">—</option>
              {lawyers.map((u) => <option key={u.user_id} value={u.user_id}>{u.name}</option>)}
            </select>
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
          <button type="button" onClick={save} disabled={saving}
            style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#EAB308", color: "#111", fontWeight: 700, cursor: saving ? "not-allowed" : "pointer" }}>
            {saving ? "Salvando…" : "Salvar"}
          </button>
          <button type="button" onClick={onClose} style={{ padding: "8px 16px", borderRadius: 8 }}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}
