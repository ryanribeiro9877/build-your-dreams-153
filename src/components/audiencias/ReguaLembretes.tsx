import { useCallback, useEffect, useState } from "react";
import { LEMBRETE_CANAL_LABELS, LEMBRETE_STATUS_META } from "@/lib/p2";
import {
  rotuloDiasLembrete, textoResultadoLembrete, traduzirErroRpc, traduzirFalhaLembrete,
  type LembreteRow,
} from "@/lib/audienciaCard13";
import { fetchLembretesAudiencia, registrarLembreteAudiencia } from "@/hooks/useAudienciaCard13";
import { formatDateBR, TabLoading } from "@/components/clients/shared";
import { CARD13_ROOT, Card13Style } from "@/components/audiencias/card13Styles";

/* ============================================================
   Card 13 · 3.2 — Régua de lembretes de uma audiência
   ============================================================
   Lê `audiencia_lembretes` direto (a tabela só tem policy de SELECT; o RLS
   resolve quem vê) e registra o desfecho por `registrar_lembrete_audiencia`.

   A diferença que o card existe para tornar visível: NÃO ATENDEU mantém a
   pendência ABERTA para nova tentativa; CANCELAR encerra. Sem isso escrito na
   tela os dois botões parecem "não deu certo" e a recepção usa o errado. A fonte
   de quem encerra é o campo `encerra` de LEMBRETE_STATUS_META (src/lib/p2.ts),
   que espelha o corpo da RPC.
============================================================ */

const ACOES: { status: string; rotulo: string }[] = [
  { status: "feito", rotulo: "Feito" },
  { status: "nao_atendeu", rotulo: "Não atendeu" },
  { status: "cancelado", rotulo: "Cancelar" },
];

interface Props {
  audienciaId: string;
  /** Chamado depois de cada registro (o painel de preparação recarrega os dados). */
  onRegistrado?: () => void;
}

export function ReguaLembretes({ audienciaId, onRegistrado }: Props) {
  const [rows, setRows] = useState<LembreteRow[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [salvandoId, setSalvandoId] = useState<string | null>(null);
  const [obs, setObs] = useState<Record<string, string>>({});
  const [resultado, setResultado] = useState<{ texto: string; falha: boolean } | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const { rows: r, error } = await fetchLembretesAudiencia(audienciaId);
    if (error) {
      setErro(traduzirErroRpc(error, "Lembretes NÃO carregados"));
      setRows([]);
    } else {
      setErro(null);
      setRows(r);
    }
    setCarregando(false);
  }, [audienciaId]);

  useEffect(() => { void carregar(); }, [carregar]);

  const registrar = async (l: LembreteRow, status: string) => {
    setSalvandoId(l.id);
    setResultado(null);
    const { data, error } = await registrarLembreteAudiencia({
      lembreteId: l.id, status, observacao: obs[l.id],
    });
    setSalvandoId(null);
    if (error) {
      setResultado({ texto: traduzirErroRpc(error, "Lembrete NÃO registrado"), falha: true });
      return;
    }
    if (!data || data.ok !== true) {
      setResultado({ texto: traduzirFalhaLembrete(data?.motivo, data?.mensagem), falha: true });
      return;
    }
    setResultado({ texto: textoResultadoLembrete(data), falha: false });
    setObs((o) => ({ ...o, [l.id]: "" }));
    await carregar();
    onRegistrado?.();
  };

  return (
    <div className={CARD13_ROOT}>
      <Card13Style />
      <div className="card13-stack">
        <div>
          <div className="cli-sec-title">Régua de lembretes</div>
          <div className="card13-sub">
            Um lembrete por offset combinado (só para datas a partir de hoje). Registre o
            desfecho de cada ligação aqui.
          </div>
        </div>

        {/* Exigência do card: a diferença entre os dois desfechos precisa estar ESCRITA. */}
        <div className="card13-info">
          <strong>Não atendeu</strong> MANTÉM A PENDÊNCIA ABERTA para nova tentativa —
          o lembrete continua na sua fila. <strong>Cancelar</strong> ENCERRA a pendência:
          não haverá nova tentativa. <strong>Feito</strong> também encerra (você falou com o cliente).
        </div>

        {erro && <div className="card13-warn">{erro}</div>}
        {resultado && (
          <div className={resultado.falha ? "card13-warn" : "card13-note"} role="status">{resultado.texto}</div>
        )}

        {carregando ? (
          <TabLoading />
        ) : rows.length === 0 ? (
          <div className="card13-info">
            Nenhum lembrete cadastrado para esta audiência. Lembretes são criados na
            importação da planilha (ou pelo tickler) apenas para datas futuras — audiência
            que já passou não gera lembrete. Se o seu perfil não enxerga clientes nem
            audiências, esta lista vem vazia mesmo existindo lembretes.
          </div>
        ) : (
          rows.map((l) => {
            const meta = LEMBRETE_STATUS_META[l.status] ?? { label: l.status, cls: "n", encerra: false };
            const dias = rotuloDiasLembrete(l.data_prevista, meta.encerra);
            const canal = LEMBRETE_CANAL_LABELS[l.canal] ?? l.canal;
            return (
              <div className="card13-lembrete" key={l.id}>
                <div className="lb-body">
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span className="card13-num">{formatDateBR(l.data_prevista)}</span>
                    <span className={`cli-chip ${dias.cls}`}>{dias.texto}</span>
                    <span className={`cli-chip ${meta.cls}`}>{meta.label}</span>
                    <span className="card13-sub">{canal}</span>
                  </div>
                  {l.observacao && <div className="card13-sub">Obs.: {l.observacao}</div>}
                  {l.feito_em && (
                    <div className="card13-sub">Registrado em {formatDateBR(l.feito_em)}</div>
                  )}
                  {meta.encerra ? (
                    // MEDIDO no corpo da RPC: o UPDATE em user_tasks só FECHA a tarefa
                    // (completed_at = now()); não existe caminho que reabra. Voltar este
                    // lembrete para "não atendeu" deixaria o lembrete pendente com a
                    // tarefa já fechada — a tela mentiria sobre a pendência. Por isso
                    // lembrete encerrado não oferece ação.
                    <div className="card13-sub" style={{ marginTop: 6 }}>
                      Encerrado. Não há ação de reabertura: a RPC só fecha a tarefa vinculada,
                      nunca a reabre — registrar outro desfecho agora deixaria o lembrete
                      pendente com a tarefa já fechada.
                    </div>
                  ) : (
                    <div className="card13-acts" style={{ marginTop: 8 }}>
                      <input
                        className="cli-input"
                        style={{ flex: "1 1 170px", minWidth: 0 }}
                        placeholder="Observação (opcional)"
                        value={obs[l.id] ?? ""}
                        onChange={(e) => setObs((o) => ({ ...o, [l.id]: e.target.value }))}
                      />
                      {ACOES.map((a) => {
                        const encerraEsta = LEMBRETE_STATUS_META[a.status].encerra;
                        return (
                          <button
                            key={a.status}
                            type="button"
                            className={`cli-btn sm${a.status === "feito" ? "" : " ghost"}`}
                            disabled={salvandoId === l.id}
                            title={encerraEsta ? "Encerra a pendência" : "Mantém a pendência aberta para nova tentativa"}
                            onClick={() => void registrar(l, a.status)}
                          >
                            {salvandoId === l.id ? "…" : a.rotulo}
                            <span style={{ fontWeight: 600, opacity: 0.75, fontSize: 10.5 }}>
                              {encerraEsta ? "encerra" : "mantém aberta"}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
