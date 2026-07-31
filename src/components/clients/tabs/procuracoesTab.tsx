import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { type ClientFull, EmptyState, TabLoading, formatDateBR } from "../shared";
import { PROCURACAO_STATUS_META, PROCURACAO_TIPO_OPTIONS, VALIDADE_MESES_DEFAULT, vigenciaMeta } from "@/lib/p2";
import {
  type ConsultaProcuracoesRes, type ErroRpc, type LinhaHistorico, type MapaSubstituicao,
  type Nota, type ProcuracaoItem, type RegistroProcuracaoRes,
  falhaConsulta, falhaRegistro, hojeISO, montarLinhagem, notasDoRegistro,
  parseValidadeMeses, selecionarAtual, tipoLabel,
} from "@/lib/procuracoes";

/* ============================================================
   Card 15 — aba Procurações do cliente
   ============================================================
   O erro que este card existe para corrigir: procuração cadastrada com a data
   do UPLOAD em vez da data de ASSINATURA. A vigência sai da assinatura, então a
   data errada mostra como vigente o que já caiu. Por isso o rótulo do campo
   grita "assinatura" e o banco tem o motivo `data_assinatura_obrigatoria`.

   ESCRITA só por `registrar_procuracao` (a mesma RPC da tool do chat): a tabela
   `procuracoes` só tem policy de SELECT, um insert do front seria recusado.

   LEITURA em três partes, porque nenhuma sozinha basta:
   1. `consultar_procuracoes` (p_incluir_historico) — tipo, datas, status,
      dias_para_vencer, vencida, tem_pdf;
   2. `procuracoes` direto — `substituida_por_id` (a linhagem), `validade_meses`
      e a observação, que a RPC NÃO devolve. A policy de SELECT da tabela
      (can_view_clients OR is_socio_or_advogado) é superconjunto do gate da RPC,
      então quem lista consegue ler;
   3. `client_documents` (document_type = 'procuracao') — para oferecer o PDF a
      vincular em `p_client_document_id`.

   O semáforo usa `dias_para_vencer` (DATA), nunca o status: o status só vira
   'vencida' quando o cron roda. Ver src/lib/procuracoes.ts.
============================================================ */

/* ---------- Leituras diretas (tipos gerados estão defasados) ---------- */

interface LinhagemRow {
  id: string;
  substituida_por_id: string | null;
  validade_meses: number;
  notes: string | null;
}

interface DocProcuracaoRow {
  id: string;
  document_name: string;
  status: string;
  created_at: string;
}

/** Cast de leitura: `procuracoes` e o filtro duplo de `client_documents` não
 *  estão nos tipos gerados. Chamada sempre ACOPLADA ao client. */
function tabela<T>(nome: string) {
  type Ordenavel = {
    order: (c: string, o: { ascending: boolean }) => Promise<{ data: T[] | null; error: ErroRpc }>;
  };
  return (supabase as unknown as {
    from: (t: string) => {
      select: (c: string) => { eq: (k: string, v: string) => Ordenavel & { eq: (k: string, v: string) => Ordenavel } };
    };
  }).from(nome);
}

function rpcProcuracao<T>(fn: string, args: Record<string, unknown>) {
  // Cast: as RPCs do Card 15 não estão nos tipos gerados. Chamada ACOPLADA ao
  // client — desacoplar o `rpc` quebra em `this.rest`.
  return (supabase as unknown as {
    rpc: (f: string, a: Record<string, unknown>) => Promise<{ data: T | null; error: ErroRpc }>;
  }).rpc(fn, args);
}

/* ---------- Procuração vigente ---------- */

function VigenteCard({ atual, extra }: { atual: ProcuracaoItem | null; extra: LinhagemRow | undefined }) {
  if (!atual) {
    return (
      <div className="cli-card lift" style={{ padding: 18 }}>
        <div className="cli-sec-title" style={{ padding: "2px 4px 10px" }}>Procuração vigente</div>
        <EmptyState icon="✍" title="Nenhuma procuração vigente"
          hint="Sem procuração em vigor não há representação: registre a que o cliente assinou usando a DATA DE ASSINATURA do documento." />
      </div>
    );
  }

  const dias = atual.dias_para_vencer ?? null;
  const meta = vigenciaMeta(dias);
  const statusMeta = PROCURACAO_STATUS_META[atual.status] ?? { label: atual.status, cls: "n" };
  // Status defasado: a data já venceu mas o cron ainda não mexeu na coluna. Dizer
  // isso evita que a divergência entre o chip e o status pareça bug da tela.
  const statusDefasado = dias !== null && dias < 0 && atual.status === "vigente";

  return (
    <div className="cli-card lift" style={{ padding: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "2px 4px 10px" }}>
        <div className="cli-sec-title" style={{ padding: 0 }}>Procuração vigente</div>
        <span className={`cli-chip ${meta.cls}`}>{meta.label}</span>
        <span className={`cli-chip ${statusMeta.cls}`}>{statusMeta.label}</span>
        {atual.tem_pdf
          ? <span className="cli-chip ok">PDF vinculado</span>
          : <span className="cli-chip p">Sem PDF vinculado</span>}
      </div>

      <div className="cli-fgrid">
        <div className="cli-field">
          <div className="k">Tipo</div>
          <div className="v">{tipoLabel(atual.tipo)}</div>
        </div>
        <div className="cli-field">
          <div className="k">Data de assinatura</div>
          <div className="v">{formatDateBR(atual.data_assinatura)}</div>
        </div>
        <div className="cli-field">
          <div className="k">Validade até</div>
          <div className="v">{formatDateBR(atual.validade_ate)}</div>
        </div>
        <div className="cli-field">
          <div className="k">Dias para vencer</div>
          <div className="v">{dias === null ? "—" : dias}</div>
        </div>
        <div className="cli-field">
          <div className="k">Validade contratada</div>
          <div className={`v${extra?.validade_meses ? "" : " empty"}`}>
            {extra?.validade_meses ? `${extra.validade_meses} mês(es)` : "—"}
          </div>
        </div>
        <div className="cli-field">
          <div className="k">Observação</div>
          <div className={`v${extra?.notes ? "" : " empty"}`}>{extra?.notes ?? "—"}</div>
        </div>
      </div>

      {dias !== null && dias < 0 && (
        <div style={{ fontSize: 13, fontWeight: 700, color: "#B4442E", marginTop: 12, lineHeight: 1.5 }}>
          VENCIDA há {Math.abs(dias)} dia(s): o cliente está sem procuração em vigor agora.
          Renove com a data de assinatura da nova.
        </div>
      )}
      {statusDefasado && (
        <div style={{ fontSize: 12, color: "var(--cli-muted)", fontWeight: 600, marginTop: 8, lineHeight: 1.5 }}>
          O status gravado ainda diz "vigente" porque a rotina diária não rodou desde o vencimento.
          O semáforo acima usa a DATA, que é o que vale.
        </div>
      )}
    </div>
  );
}

/* ---------- Registrar / renovar ---------- */

const FORM_VAZIO = {
  data_assinatura: "",
  tipo: PROCURACAO_TIPO_OPTIONS[0].value,
  validade_meses: String(VALIDADE_MESES_DEFAULT),
  client_document_id: "",
  observacao: "",
};

function RegistrarCard({ clientId, temAtual, docs, onRegistrada }: {
  clientId: string;
  temAtual: boolean;
  docs: DocProcuracaoRow[];
  onRegistrada: (res: RegistroProcuracaoRes) => void;
}) {
  const [f, setF] = useState({ ...FORM_VAZIO });
  const [salvando, setSalvando] = useState(false);

  const set = (k: keyof typeof FORM_VAZIO) => (e: { target: { value: string } }) =>
    setF(prev => ({ ...prev, [k]: e.target.value }));

  const validade = parseValidadeMeses(f.validade_meses);
  const hoje = hojeISO();
  const dataNoFuturo = f.data_assinatura !== "" && f.data_assinatura > hoje;

  async function salvar() {
    if (validade.erro) { toast.error(`Procuração NÃO registrada: ${validade.erro}`); return; }
    setSalvando(true);
    const { data, error } = await rpcProcuracao<RegistroProcuracaoRes>("registrar_procuracao", {
      // Data vazia vai como null: string vazia em coluna date levantaria 22007.
      // Null aqui é tratado pela RPC com o motivo `data_assinatura_obrigatoria`.
      p_data_assinatura: f.data_assinatura || null,
      p_client_id: clientId,
      p_cliente_nome: null,
      p_tipo: f.tipo,
      p_validade_meses: validade.valor,
      p_client_document_id: f.client_document_id || null,
      p_observacao: f.observacao.trim() || null,
    });
    const err = falhaRegistro(data, error);
    setSalvando(false);
    if (err) { toast.error(err); return; }
    toast.success(data?.renovou_anterior ? "Procuração renovada." : "Procuração registrada.");
    setF({ ...FORM_VAZIO });
    if (data) onRegistrada(data);
  }

  return (
    <div className="cli-card lift" style={{ padding: 18 }}>
      <div className="cli-sec-title" style={{ padding: "2px 4px 10px" }}>
        {temAtual ? "Renovar procuração" : "Registrar procuração"}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
        <div style={{ flex: "0 1 190px" }}>
          {/* O rótulo é o card: a vigência sai da ASSINATURA, não do upload. */}
          <label className="cli-label">Data de ASSINATURA *</label>
          <input className="cli-input" type="date" max={hoje}
            value={f.data_assinatura} onChange={set("data_assinatura")} />
          <span style={{ fontSize: 11, color: dataNoFuturo ? "#B4442E" : "var(--cli-muted)", fontWeight: 700, display: "block", marginTop: 3 }}>
            {dataNoFuturo
              ? "Data no futuro — o banco vai recusar."
              : "A data que o cliente assinou o documento, não a data do upload."}
          </span>
        </div>
        <div style={{ flex: "0 1 200px" }}>
          <label className="cli-label">Tipo</label>
          <select className="cli-select" value={f.tipo} onChange={set("tipo")}>
            {PROCURACAO_TIPO_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div style={{ flex: "0 1 150px" }}>
          <label className="cli-label">Validade (meses)</label>
          <input className="cli-input" inputMode="numeric" maxLength={3}
            value={f.validade_meses} onChange={set("validade_meses")} placeholder={String(VALIDADE_MESES_DEFAULT)} />
          {validade.erro && (
            <span style={{ fontSize: 11, color: "#B4442E", fontWeight: 700, display: "block", marginTop: 3 }}>
              {validade.erro}
            </span>
          )}
        </div>
        <div style={{ flex: "1 1 240px" }}>
          <label className="cli-label">PDF da procuração (opcional)</label>
          <select className="cli-select" value={f.client_document_id} onChange={set("client_document_id")}
            disabled={docs.length === 0}>
            <option value="">{docs.length === 0 ? "nenhum PDF de procuração anexado" : "não vincular"}</option>
            {docs.map(d => (
              <option key={d.id} value={d.id}>
                {d.document_name} · {formatDateBR(d.created_at)}
              </option>
            ))}
          </select>
          {docs.length === 0 && (
            <span style={{ fontSize: 11, color: "var(--cli-muted)", fontWeight: 600, display: "block", marginTop: 3 }}>
              Anexe o arquivo na aba Documentos com o tipo "Procuração" para poder vincular aqui.
            </span>
          )}
        </div>
        <div style={{ flex: "1 1 240px" }}>
          <label className="cli-label">Observação</label>
          <input className="cli-input" value={f.observacao} onChange={set("observacao")} placeholder="opcional" />
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ fontSize: 12, color: "var(--cli-muted)", fontWeight: 500, flex: "1 1 260px", lineHeight: 1.5 }}>
          {temAtual
            ? "Registrar aqui SUBSTITUI a procuração atual (ela passa a 'renovada') e fecha a pendência de renovação, se houver."
            : "Sem procuração anterior, esta será a primeira do cliente."}
        </div>
        <button className="cli-btn sm" disabled={salvando || !f.data_assinatura || !!validade.erro}
          onClick={() => void salvar()}>
          {salvando ? "Registrando…" : temAtual ? "Renovar procuração" : "Registrar procuração"}
        </button>
      </div>
      {!f.data_assinatura && (
        <div style={{ fontSize: 12, color: "var(--cli-muted)", fontWeight: 600, marginTop: 8 }}>
          A data de assinatura é obrigatória — é ela que define a vigência.
        </div>
      )}
    </div>
  );
}

/* ---------- Resultado do último registro ---------- */

function ResultadoCard({ res, notas }: { res: RegistroProcuracaoRes; notas: Nota[] }) {
  return (
    <div className="cli-card" style={{ padding: 18 }}>
      <div className="cli-sec-title" style={{ padding: "2px 4px 10px" }}>Resultado do último registro</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: "var(--cli-ink)" }}>
        {tipoLabel(res.tipo ?? "")} · assinada em {formatDateBR(res.data_assinatura)} · válida até {formatDateBR(res.validade_ate)}
      </div>
      <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
        {notas.map((n, i) => (
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <span className={`cli-chip ${n.cls}`} style={{ flexShrink: 0 }}>
              {n.cls === "d" ? "atenção" : n.cls === "p" ? "aviso" : n.cls === "ok" ? "ok" : "nota"}
            </span>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--cli-ink)", lineHeight: 1.5 }}>{n.texto}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Histórico ---------- */

function HistoricoCard({ linhas, linhagemIndisponivel }: {
  linhas: LinhaHistorico[]; linhagemIndisponivel: boolean;
}) {
  if (linhas.length === 0) {
    return (
      <div className="cli-card lift" style={{ padding: 18 }}>
        <div className="cli-sec-title" style={{ padding: "2px 4px 10px" }}>Histórico</div>
        <EmptyState icon="🗂" title="Nenhuma procuração no histórico"
          hint="Cada renovação mantém a anterior aqui, com a linhagem de quem substituiu quem." />
      </div>
    );
  }
  return (
    <div className="cli-card lift" style={{ padding: 18 }}>
      <div className="cli-sec-title" style={{ padding: "2px 4px 10px" }}>Histórico · {linhas.length}</div>
      {linhas.map(({ item, atual, sucessor, diasDescoberto }) => {
        const statusMeta = PROCURACAO_STATUS_META[item.status] ?? { label: item.status, cls: "n" };
        const meta = vigenciaMeta(item.dias_para_vencer ?? null);
        return (
          <div key={item.id} className="cli-row">
            <div className="dot">{atual ? "★" : "✍"}</div>
            <div className="body">
              <div className="t">
                {tipoLabel(item.tipo)}
                {atual ? " · ATUAL" : ""}
              </div>
              <div className="s">
                assinada em {formatDateBR(item.data_assinatura)} · válida até {formatDateBR(item.validade_ate)}
                {sucessor ? ` · substituída pela de ${formatDateBR(sucessor.data_assinatura)}` : ""}
              </div>
              {diasDescoberto !== null && (
                <div className="s late" style={{ fontWeight: 800 }}>
                  cliente ficou {diasDescoberto} dia(s) sem procuração até a assinatura da seguinte
                </div>
              )}
            </div>
            <span style={{ display: "flex", gap: 8, alignItems: "center", marginLeft: "auto", flexShrink: 0, flexWrap: "wrap" }}>
              {atual && <span className={`cli-chip ${meta.cls}`}>{meta.label}</span>}
              <span className={`cli-chip ${statusMeta.cls}`}>{statusMeta.label}</span>
              {item.tem_pdf && <span className="cli-chip ok">PDF</span>}
            </span>
          </div>
        );
      })}
      {linhagemIndisponivel && (
        <div style={{ fontSize: 12, color: "#B4442E", fontWeight: 700, marginTop: 12, lineHeight: 1.5 }}>
          Linhagem indisponível: a consulta não devolve `substituida_por_id` e a leitura direta da
          tabela falhou. A lista está ordenada por data de assinatura, sem o "substituída por".
        </div>
      )}
    </div>
  );
}

/* ---------- Aba ---------- */

export function ProcuracoesTab({ client }: { client: ClientFull }) {
  const [itens, setItens] = useState<ProcuracaoItem[] | null>(null);
  const [mapa, setMapa] = useState<MapaSubstituicao>({});
  const [extras, setExtras] = useState<Record<string, LinhagemRow>>({});
  const [linhagemIndisponivel, setLinhagemIndisponivel] = useState(false);
  const [docs, setDocs] = useState<DocProcuracaoRow[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [ultimo, setUltimo] = useState<RegistroProcuracaoRes | null>(null);

  const load = useCallback(async () => {
    const [consulta, linhagem, documentos] = await Promise.all([
      rpcProcuracao<ConsultaProcuracoesRes>("consultar_procuracoes", {
        p_client_id: client.id,
        p_cliente_nome: null,
        p_vencendo_em_dias: null,
        // Histórico inteiro: sem isso as 'renovada'/'revogada' não voltam e a
        // linhagem fica sem os elos anteriores.
        p_incluir_historico: true,
      }),
      tabela<LinhagemRow>("procuracoes")
        .select("id, substituida_por_id, validade_meses, notes")
        .eq("client_id", client.id)
        .order("data_assinatura", { ascending: false }),
      tabela<DocProcuracaoRow>("client_documents")
        .select("id, document_name, status, created_at")
        .eq("client_id", client.id)
        .eq("document_type", "procuracao")
        .order("created_at", { ascending: false }),
    ]);

    const falha = falhaConsulta(consulta.data, consulta.error);
    if (falha) {
      setErro(falha);
      setItens([]);
    } else {
      setErro(null);
      setItens(consulta.data?.procuracoes ?? []);
    }

    if (linhagem.error || !linhagem.data) {
      setLinhagemIndisponivel(true);
      setMapa({});
      setExtras({});
    } else {
      setLinhagemIndisponivel(false);
      const m: MapaSubstituicao = {};
      const x: Record<string, LinhagemRow> = {};
      for (const r of linhagem.data) { m[r.id] = r.substituida_por_id; x[r.id] = r; }
      setMapa(m);
      setExtras(x);
    }

    // Falha só de documentos não pode derrubar a aba: o vínculo do PDF é opcional.
    setDocs(documentos.error ? [] : documentos.data ?? []);
  }, [client.id]);

  useEffect(() => { void load(); }, [load]);

  if (itens === null) return <TabLoading />;

  const atual = selecionarAtual(itens, mapa);
  const linhas = montarLinhagem(itens, mapa);

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {erro && (
        <div className="cli-card" style={{ padding: 14, fontSize: 13, fontWeight: 700, color: "#B4442E" }}>
          {erro}
        </div>
      )}
      <VigenteCard atual={atual} extra={atual ? extras[atual.id] : undefined} />
      <RegistrarCard clientId={client.id} temAtual={!!atual} docs={docs}
        onRegistrada={res => { setUltimo(res); void load(); }} />
      {ultimo && <ResultadoCard res={ultimo} notas={notasDoRegistro(ultimo)} />}
      <HistoricoCard linhas={linhas} linhagemIndisponivel={linhagemIndisponivel && itens.length > 0} />
    </div>
  );
}

export default ProcuracoesTab;
