import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { EmptyState, TabLoading, formatDateBR } from "@/components/clients/shared";
import { vigenciaMeta } from "@/lib/p2";
import {
  type CampanhaRenovacaoRes, type ConsultaProcuracoesRes, type ErroRpc,
  type Nota, type ProcuracaoItem,
  falhaCampanha, falhaConsulta, notasDaCampanha, ordenarFilaRenovacao, tipoLabel,
} from "@/lib/procuracoes";

/* ============================================================
   Card 15 — Painel de renovação de procurações (autônomo)
   ============================================================
   Lista `consultar_procuracoes(p_vencendo_em_dias: 30)`, que é a MESMA janela
   que `gerar_campanha_renovacao_procuracao(p_janela_dias: 30)` usa para montar
   a fila. Ler e gerar com janelas diferentes daria uma tela que não descreve a
   campanha que ela cria.

   A JANELA INCLUI AS JÁ VENCIDAS. Isso não é detalhe: quem já venceu está sem
   representação AGORA, é o mais urgente da lista, e ordenar só por data
   crescente esconderia essas linhas no meio. Daí `ordenarFilaRenovacao`.

   Três nomes parecidos no contrato do banco (ver src/lib/procuracoes.ts):
   `ja_vencidas` (int, cabeçalho da consulta) · `vencida` (boolean, item) ·
   `ja_vencida` (boolean, retorno do registro). Aqui usamos os dois primeiros.

   LIMITE CONHECIDO DA BASE (medido em 30/07/2026): a carteira importada tem
   centenas de clientes e telefone em pouquíssimos cadastros. A fila de renovação
   nasce quase toda inacionável — a RPC devolve `sem_telefone` e a tela declara
   isso ANTES e DEPOIS de gerar, em vez de fingir uma fila trabalhável.

   Autônomo de propósito: sem props obrigatórias e com o `.cli-root` neutralizado
   (o `.cli-root` de página traz min-height 100vh, padding e fundo próprios), para
   poder ser montado em qualquer dashboard sem empurrar o layout de quem monta.
============================================================ */

/** Janela padrão: 30 dias, o mesmo default de `p_janela_dias` no banco. */
const JANELA_PADRAO = 30;

function rpcProcuracao<T>(fn: string, args: Record<string, unknown>) {
  // Cast: as RPCs do Card 15 não estão nos tipos gerados. Chamada ACOPLADA ao
  // client — desacoplar o `rpc` quebra em `this.rest`.
  return (supabase as unknown as {
    rpc: (f: string, a: Record<string, unknown>) => Promise<{ data: T | null; error: ErroRpc }>;
  }).rpc(fn, args);
}

function NotasLista({ notas }: { notas: Nota[] }) {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {notas.map((n, i) => (
        <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          <span className={`cli-chip ${n.cls}`} style={{ flexShrink: 0 }}>
            {n.cls === "d" ? "atenção" : n.cls === "p" ? "aviso" : n.cls === "ok" ? "ok" : "nota"}
          </span>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--cli-ink)", lineHeight: 1.5 }}>{n.texto}</span>
        </div>
      ))}
    </div>
  );
}

export function PainelRenovacao({ janelaDias = JANELA_PADRAO }: { janelaDias?: number } = {}) {
  const [itens, setItens] = useState<ProcuracaoItem[] | null>(null);
  const [jaVencidas, setJaVencidas] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [gerando, setGerando] = useState(false);
  const [campanha, setCampanha] = useState<CampanhaRenovacaoRes | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await rpcProcuracao<ConsultaProcuracoesRes>("consultar_procuracoes", {
      p_client_id: null,
      p_cliente_nome: null,
      p_vencendo_em_dias: janelaDias,
      // Histórico fora: a fila é sobre quem PRECISA renovar, e a janela já
      // restringe a vigente/vencida não substituída.
      p_incluir_historico: false,
    });
    const falha = falhaConsulta(data, error);
    if (falha) { setErro(falha); setItens([]); setJaVencidas(0); return; }
    setErro(null);
    setItens(ordenarFilaRenovacao(data?.procuracoes ?? []));
    setJaVencidas(data?.ja_vencidas ?? 0);
  }, [janelaDias]);

  useEffect(() => { void load(); }, [load]);

  async function gerarCampanha() {
    setGerando(true);
    const { data, error } = await rpcProcuracao<CampanhaRenovacaoRes>("gerar_campanha_renovacao_procuracao", {
      p_janela_dias: janelaDias,
      // Nome nulo: a RPC monta um nome com a data-limite da janela. Melhor o dela
      // que um nome inventado aqui que não descreve o filtro gravado.
      p_nome: null,
    });
    const falha = falhaCampanha(data, error);
    setGerando(false);
    if (falha) { setCampanha(null); toast.error(falha); return; }
    setCampanha(data);
    // Fila 0 com ok:true é campanha VAZIA — não pode virar toast de sucesso.
    if ((data?.clientes_na_fila ?? 0) === 0) toast.warning("Campanha criada, porém VAZIA (0 clientes na fila).");
    else toast.success(`Campanha criada com ${data?.clientes_na_fila} cliente(s).`);
  }

  if (itens === null) {
    return (
      <div className="cli-root" style={{ minHeight: 0, padding: 0, background: "transparent" }}>
        <TabLoading />
      </div>
    );
  }

  const total = itens.length;

  return (
    <div className="cli-root" style={{ minHeight: 0, padding: 0, background: "transparent" }}>
      <div style={{ display: "grid", gap: 14 }}>
        <div className="cli-card lift" style={{ padding: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "2px 4px 10px" }}>
            <div className="cli-sec-title" style={{ padding: 0 }}>
              Renovação de procurações · janela de {janelaDias} dias
            </div>
            <span className="cli-chip n">{total} na janela</span>
            {jaVencidas > 0 && <span className="cli-chip d">{jaVencidas} JÁ VENCIDA(S)</span>}
            <span style={{ flex: 1 }} />
            <button className="cli-btn sm ghost" onClick={() => void load()}>↻ Atualizar</button>
            <button className="cli-btn sm" disabled={gerando || total === 0} onClick={() => void gerarCampanha()}>
              {gerando ? "Gerando…" : "Gerar campanha de renovação"}
            </button>
          </div>

          {erro && (
            <div style={{ fontSize: 13, fontWeight: 700, color: "#B4442E", marginBottom: 10 }}>{erro}</div>
          )}

          <div style={{ fontSize: 12, color: "var(--cli-muted)", fontWeight: 600, lineHeight: 1.5 }}>
            A janela <strong>inclui as já vencidas</strong> — quem já venceu está sem representação agora e
            aparece no topo da lista. A campanha usa exatamente esta janela e não repete cliente que já
            esteja em campanha de renovação aberta.
          </div>
          <div style={{ fontSize: 12, color: "#B4442E", fontWeight: 700, lineHeight: 1.5, marginTop: 8 }}>
            Limitação da base: a carteira importada tem telefone em pouquíssimos cadastros. A fila tende a
            nascer inacionável — depois de gerar, o número exato de clientes SEM TELEFONE aparece abaixo.
          </div>
        </div>

        {campanha && (
          <div className="cli-card" style={{ padding: 18 }}>
            <div className="cli-sec-title" style={{ padding: "2px 4px 10px" }}>Campanha gerada</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--cli-ink)", marginBottom: 12 }}>
              {campanha.nome ?? "—"} · janela de {campanha.janela_dias ?? janelaDias} dias
            </div>
            <NotasLista notas={notasDaCampanha(campanha)} />
          </div>
        )}

        <div className="cli-card lift" style={{ padding: 18 }}>
          <div className="cli-sec-title" style={{ padding: "2px 4px 10px" }}>Fila · vencidas primeiro</div>
          {total === 0 ? (
            <EmptyState icon="✍" title={`Nenhuma procuração vencendo em ${janelaDias} dias`}
              hint="Nada a renovar nesta janela. Procurações já substituídas por uma renovação não entram aqui." />
          ) : (
            <div style={{ maxHeight: 460, overflowY: "auto" }}>
              {itens.map(p => {
                const meta = vigenciaMeta(p.dias_para_vencer ?? null);
                return (
                  <div key={p.id} className="cli-row">
                    <div className="dot">{p.vencida ? "!" : "✍"}</div>
                    <div className="body">
                      <div className="t">{p.cliente}</div>
                      <div className={`s${p.vencida ? " late" : ""}`}>
                        {tipoLabel(p.tipo)} · assinada em {formatDateBR(p.data_assinatura)} · válida até {formatDateBR(p.validade_ate)}
                      </div>
                    </div>
                    <span style={{ display: "flex", gap: 8, alignItems: "center", marginLeft: "auto", flexShrink: 0, flexWrap: "wrap" }}>
                      {p.vencida && <span className="cli-chip d">vencida</span>}
                      <span className={`cli-chip ${meta.cls}`}>{meta.label}</span>
                      {!p.tem_pdf && <span className="cli-chip p">sem PDF</span>}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default PainelRenovacao;
