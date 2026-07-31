import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { formatDateBR } from "@/components/clients/shared";
import { DILIGENCIA_TIPO_LABELS } from "@/lib/p2";
import { rpcDiligencia } from "./diligenciasApi";
import {
  avisosCumprir, falhaCumprir, processoLabel,
  type DiligenciaRow,
} from "./diligenciasLogic";

/* ============================================================
   Card 11 — “Cumprir diligência”
   ============================================================
   O PROTOCOLO é o centro da tela porque é a única prova de que o ato foi
   praticado. Mas o campo NÃO bloqueia: o motivo `protocolo_obrigatorio` foi
   REMOVIDO de `cumprir_diligencia` (conferido no corpo da função em 30/07/2026)
   — hoje o banco cumpre sem protocolo e apenas AVISA, e travar aqui seria a tela
   inventando uma regra que o banco não tem (e que o chat não teria).

   Cuidado que a RPC impõe: `protocolo` e `resultado` são SOBRESCRITOS pelo que
   vier (`nullif(btrim(...),'')`). Campo em branco APAGA o valor que já estava
   gravado. Por isso os dois campos entram pré-preenchidos com o valor atual.
============================================================ */

export default function CumprirDiligenciaModal({ d, onFechar, onCumprida }: {
  d: DiligenciaRow;
  onFechar: () => void;
  onCumprida: (titulo: string, avisos: string[]) => void;
}) {
  const [protocolo, setProtocolo] = useState(d.protocolo ?? "");
  const [resultado, setResultado] = useState(d.resultado ?? "");
  const [rediligenciarEm, setRediligenciarEm] = useState("");
  const [salvando, setSalvando] = useState(false);
  const protocoloRef = useRef<HTMLInputElement>(null);

  useEffect(() => { protocoloRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onFechar(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onFechar]);

  const semProtocolo = protocolo.trim() === "";
  const apagariaProtocolo = semProtocolo && !!d.protocolo?.trim();
  const balcao = d.tipo === "balcao_virtual";
  const proc = processoLabel(d);

  async function cumprir() {
    setSalvando(true);
    const { data, error } = await rpcDiligencia("cumprir_diligencia", {
      p_diligencia_id: d.id,
      p_protocolo: protocolo.trim() || null,
      p_resultado: resultado.trim() || null,
      // Data vazia do input NUNCA vai como "": coluna date recusa string vazia (22007).
      p_rediligenciar_em: rediligenciarEm || null,
    });
    const err = falhaCumprir(data, error);
    setSalvando(false);
    if (err) { toast.error(err); return; }
    const avisos = avisosCumprir(data, !!d.pendencia_task_id);
    toast.success(semProtocolo ? "Diligência cumprida — SEM protocolo." : "Diligência cumprida.");
    onCumprida(`Diligência do processo ${proc.texto} cumprida.`, avisos);
  }

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Cumprir diligência"
      onClick={onFechar}
      style={{
        position: "fixed", inset: 0, zIndex: 60, background: "#0B0A06CC",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
      }}>
      {/* `.cli-root` traz as variáveis do tema; o portal fica fora da página, por
          isso o reset de altura/fundo (mesmo truque do `.jc-messages .cli-root`). */}
      <div className="cli-root" style={{ minHeight: 0, padding: 0, background: "transparent", width: "100%", maxWidth: 620 }}
        onClick={e => e.stopPropagation()}>
        <div className="cli-card" style={{ maxHeight: "88vh", overflowY: "auto" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 14 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="cli-sec-title" style={{ margin: 0 }}>Cumprir diligência</div>
              <div style={{ fontWeight: 800, fontSize: 15 }}>{proc.texto}</div>
              <div style={{ fontSize: 12.5, color: "var(--cli-muted)", fontWeight: 600 }}>
                {DILIGENCIA_TIPO_LABELS[d.tipo] ?? d.tipo}
                {d.vara ? ` · ${d.vara}` : ""}
                {d.prazo ? ` · prazo ${formatDateBR(d.prazo)}` : " · sem prazo"}
              </div>
            </div>
            <button className="cli-btn sm ghost" onClick={onFechar} aria-label="Fechar">✕</button>
          </div>

          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>{d.descricao}</div>

          {/* Protocolo — destacado */}
          <div style={{
            border: "2.5px solid var(--cli-ink)", borderRadius: 12, padding: 14,
            background: "var(--cli-amber)", boxShadow: "4px 4px 0 var(--cli-ink)", marginBottom: 14,
          }}>
            <label className="cli-label" htmlFor="dil-protocolo"
              style={{ color: "var(--cli-amber-deep)", fontSize: 12 }}>
              Número do protocolo
            </label>
            <input id="dil-protocolo" ref={protocoloRef} className="cli-input" value={protocolo}
              onChange={e => setProtocolo(e.target.value)}
              placeholder="cole aqui o protocolo do peticionamento"
              style={{ fontSize: 19, fontWeight: 800, letterSpacing: .5, fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace" }} />
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--cli-amber-deep)", marginTop: 8 }}>
              {balcao
                ? "Balcão virtual sem protocolo fica sem comprovação. Se salvar em branco, o banco marca “[cumprida sem protocolo]” nas observações e devolve aviso."
                : "Balcão virtual sem protocolo fica sem comprovação. Neste tipo o banco NÃO grava marca nenhuma nem devolve aviso — o campo em branco passa em silêncio."}
            </div>
            {apagariaProtocolo && (
              <div style={{ fontSize: 12, fontWeight: 800, color: "var(--cli-red-deep)", background: "var(--cli-red)", border: "2px solid var(--cli-ink)", borderRadius: 8, padding: "5px 8px", marginTop: 8 }}>
                Esta diligência JÁ tem protocolo gravado ({d.protocolo}). Salvar em branco APAGA esse número.
              </div>
            )}
          </div>

          <div style={{ marginBottom: 12 }}>
            <label className="cli-label" htmlFor="dil-resultado">Resultado</label>
            <textarea id="dil-resultado" className="cli-textarea" value={resultado}
              onChange={e => setResultado(e.target.value)}
              placeholder="o que foi feito / o que a vara respondeu" />
            {resultado.trim() === "" && !!d.resultado?.trim() && (
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--cli-red-deep)", marginTop: 4 }}>
                Já havia resultado gravado — em branco, ele é apagado.
              </div>
            )}
          </div>

          <div style={{ marginBottom: 6 }}>
            <label className="cli-label" htmlFor="dil-redil">Rediligenciar em (opcional)</label>
            <input id="dil-redil" className="cli-input" type="date" style={{ maxWidth: 220 }}
              value={rediligenciarEm} onChange={e => setRediligenciarEm(e.target.value)} />
            <div style={{ fontSize: 12, color: "var(--cli-muted)", fontWeight: 600, marginTop: 6 }}>
              {rediligenciarEm
                ? `Cria uma NOVA diligência (mesmo processo, vara, tipo e descrição) com prazo ${formatDateBR(rediligenciarEm)}, ligada a esta como rediligência, e abre a pendência no Kanban.`
                : "Em branco, nada é reagendado: a diligência só é encerrada."}
            </div>
          </div>

          <div className="cli-form-actions">
            <button className="cli-btn" disabled={salvando} onClick={() => void cumprir()}>
              {salvando ? "Salvando…" : semProtocolo ? "Cumprir SEM protocolo" : "Cumprir"}
            </button>
            <button className="cli-btn ghost" disabled={salvando} onClick={onFechar}>Cancelar</button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
