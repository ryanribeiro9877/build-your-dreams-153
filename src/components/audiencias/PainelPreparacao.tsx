import { useCallback, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { audienciaStatusLabel, formatAudienciaDateTime, type AudienciaStatus } from "@/lib/audiencias";
import {
  avisoTeseNaoResolvida, docLabel, semaforoDocumentos, teseViaLabel, traduzirErroRpc,
  traduzirFalhaPreparacao, type PreparacaoRet,
} from "@/lib/audienciaCard13";
import { prepararAudiencia } from "@/hooks/useAudienciaCard13";
import { TabLoading } from "@/components/clients/shared";
import { ReguaLembretes } from "@/components/audiencias/ReguaLembretes";
import { CARD13_ROOT, Card13Style } from "@/components/audiencias/card13Styles";
// Mesmos tokens dos outros modais do /sistema (dark surface, âmbar, overlay
// centralizado) — não inventar hex.
import { overlay, modal, btnGhost, COLORS, FONT } from "@/components/kanban/kanbanStyles";

/* ============================================================
   Card 13 · 3.3 — Painel de preparação da audiência
   ============================================================
   Chama `preparar_audiencia(p_audiencia_id)` e mostra TUDO o que ela devolve,
   inclusive o que é ruim: tese não resolvida, cliente sem vínculo e a `limitacao`
   (a matriz completa de documentos por tese é o Card 12, pendente com o Rodrigo).

   O ponto do card é a tela não mentir: sem tese resolvida a RPC devolve
   `documentos_esperados = ['procuracao']` e a preparação PARECE completa.
============================================================ */

type IconProps = { size?: number };
function Svg({ size = 16, children }: IconProps & { children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
  );
}
const IcX = (p: IconProps) => <Svg {...p}><path d="M18 6 6 18M6 6l12 12" /></Svg>;

function Kv({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="card13-kv">
      <div className="k">{label}</div>
      <div className="v">{children}</div>
    </div>
  );
}

function ListaDocs({ codigos, vazio }: { codigos: string[]; vazio: string }) {
  if (codigos.length === 0) return <span className="card13-sub">{vazio}</span>;
  return (
    <div className="card13-doclist">
      {codigos.map((c) => <span className="cli-chip n" key={c}>{docLabel(c)}</span>)}
    </div>
  );
}

interface Props {
  audienciaId: string;
  onClose: () => void;
}

export function PainelPreparacao({ audienciaId, onClose }: Props) {
  const [dados, setDados] = useState<PreparacaoRet | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const { data, error } = await prepararAudiencia(audienciaId);
    if (error) {
      setErro(traduzirErroRpc(error, "Preparação NÃO gerada"));
      setDados(null);
    } else if (!data || data.ok !== true) {
      setErro(traduzirFalhaPreparacao(data?.motivo));
      setDados(null);
    } else {
      setErro(null);
      setDados(data);
    }
    setCarregando(false);
  }, [audienciaId]);

  useEffect(() => { void carregar(); }, [carregar]);

  const aviso = dados ? avisoTeseNaoResolvida(dados) : null;
  const semaforo = dados ? semaforoDocumentos(dados) : null;

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Preparação da audiência"
      style={{ ...overlay, position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}
      onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ ...modal, color: COLORS.text1, maxWidth: 760, width: "min(760px, 96vw)", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, flex: 1, color: COLORS.text1, fontFamily: FONT }}>
            Preparar audiência
          </h2>
          <button type="button" onClick={onClose} aria-label="Fechar"
            style={{ background: "transparent", border: "none", color: COLORS.text2, cursor: "pointer" }}>
            <IcX size={18} />
          </button>
        </div>

        <div className={CARD13_ROOT}>
          <Card13Style />
          <div className="card13-stack">
            {carregando && <TabLoading />}
            {erro && <div className="card13-warn">{erro}</div>}

            {dados && (
              <>
                <div className="card13-grid">
                  <Kv label="Cliente">
                    {dados.cliente ?? "—"}
                    {dados.cliente_vinculado === false && (
                      <span className="cli-chip d" style={{ marginLeft: 6 }}>sem vínculo</span>
                    )}
                  </Kv>
                  <Kv label="Data e hora">
                    {dados.data_hora ? formatAudienciaDateTime(dados.data_hora) : "—"}
                  </Kv>
                  <Kv label="Situação">
                    {dados.status ? audienciaStatusLabel(dados.status as AudienciaStatus) : "—"}
                  </Kv>
                  <Kv label="Tipo de ação (planilha)">{dados.tipo_acao ?? "—"}</Kv>
                  <Kv label="Parte contrária">{dados.parte_contraria ?? "—"}</Kv>
                  <Kv label="Local / link">{dados.local_ou_link ?? "—"}</Kv>
                </div>

                {/* Tese: sempre com a VIA, porque é ela que explica de onde veio a
                    lista de documentos abaixo. */}
                <div className="card13-kv">
                  <div className="k">Tese reconhecida</div>
                  <div className="v" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    {dados.tese ?? "não resolvida"}
                    <span className={`cli-chip ${dados.tese_resolvida ? "ok" : "d"}`}>
                      {dados.tese_resolvida ? "resolvida" : "NÃO resolvida"}
                    </span>
                    <span className="card13-sub">via: {teseViaLabel(dados.tese_resolvida_via)}</span>
                  </div>
                </div>

                {aviso && <div className="card13-warn" role="alert">{aviso}</div>}

                <div>
                  <div className="cli-sec-title">Documentos</div>
                  {semaforo && (
                    <div className={semaforo.cls === "ok" ? "card13-note" : "card13-warn"} style={{ marginBottom: 10 }}>
                      {semaforo.texto}
                    </div>
                  )}
                  <div className="card13-grid">
                    <div className="card13-kv">
                      <div className="k">Esperados ({dados.documentos_esperados?.length ?? 0})</div>
                      <div className="v"><ListaDocs codigos={dados.documentos_esperados ?? []} vazio="nenhum" /></div>
                    </div>
                    <div className="card13-kv">
                      <div className="k">Presentes ({dados.documentos_presentes?.length ?? 0})</div>
                      <div className="v"><ListaDocs codigos={dados.documentos_presentes ?? []} vazio="nenhum" /></div>
                    </div>
                    <div className="card13-kv">
                      <div className="k">FALTANDO ({dados.documentos_faltando?.length ?? 0})</div>
                      <div className="v"><ListaDocs codigos={dados.documentos_faltando ?? []} vazio="nenhum" /></div>
                    </div>
                  </div>
                </div>

                {/* Limitação declarada pela própria RPC — vai para a tela como veio. */}
                {dados.limitacao && <div className="card13-info">Limitação: {dados.limitacao}</div>}

                <ReguaLembretes audienciaId={audienciaId} onRegistrado={() => void carregar()} />
              </>
            )}

            <div className="card13-acts" style={{ marginTop: 4 }}>
              <button type="button" style={btnGhost} onClick={onClose}>Fechar</button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
