import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { type ClientFull, EmptyState, TabLoading, formatDateBR } from "../shared";
import {
  PREMIO_PERIODICIDADE_LABELS, PREMIO_PERIODICIDADE_OPTIONS,
  ORIGEM_DESCONTO_LABELS, ORIGEM_DESCONTO_OPTIONS,
  reconhecidaMeta, type Reconhecida,
} from "@/lib/p2";

/* ============================================================
   Card 14 — aba Apólices (seguros SUSEP) da ficha do cliente
   ============================================================
   LEITURA pela RPC `consultar_apolices`, não pela tabela. Três motivos, todos
   medidos no corpo da função em 30/07/2026:
   · a RPC é SECURITY DEFINER com gate interno — quem não tem papel recebe
     42501, que viramos "você não tem acesso". Um SELECT direto barrado pela RLS
     devolveria LISTA VAZIA, que mentiria dizendo "cliente sem apólice";
   · `premio_mensal_somado` é somado pelo BANCO (é o rodapé do card);
   · o atalho "só as não reconhecidas" é um argumento DELA, não um filtro local.

   ESCRITA só por RPC (`registrar_apolice` / `atualizar_apolice`) — a tabela não
   tem policy de INSERT/UPDATE. São as MESMAS RPCs das tools do chat, então tela
   e chat gravam idêntico.

   O QUE ESTA ABA NÃO MOSTRA: `consultar_apolices` projeta 11 campos e NÃO
   devolve numero_processo_susep, vigencia_inicio/fim, observação nem data de
   cadastro. O formulário grava esses campos (a RPC de escrita os aceita), mas
   a lista não tem como relê-los — a tela diz isso em vez de fingir que o dado
   se perdeu.
============================================================ */

/** Linha como `consultar_apolices` devolve (chaves do jsonb, não da tabela:
 *  `premio` = premio_valor, `restituicao` = restituicao_valor).
 *  A RPC também devolve `cliente` (nome completo) — omitido de propósito: numa
 *  ficha já sabemos de quem é, e repetir PII na tela não agrega. */
interface ApoliceRow {
  id: string;
  seguradora: string;
  produto: string | null;
  numero_apolice: string | null;
  premio: number | string | null;
  periodicidade: string | null;
  origem_desconto: string | null;
  reconhecida: Reconhecida;
  cancelada_em: string | null;
  restituicao: number | string | null;
}

interface ConsultaRes {
  ok?: boolean;
  motivo?: string;
  total?: number;
  /** NULL — não 0 — quando nenhuma apólice do conjunto é mensal. */
  premio_mensal_somado?: number | string | null;
  apolices?: ApoliceRow[];
}

interface EscritaRes {
  ok?: boolean;
  motivo?: string;
  apolice_id?: string;
  seguradora?: string;
  /** Texto que a RPC devolve quando reconhecida é FALSE ou NULL. */
  nota?: string | null;
}

type RpcErro = { code?: string; message?: string } | null;

function rpc<T>(fn: string, args: Record<string, unknown>) {
  // Cast: as RPCs do P2 ainda não estão nos tipos gerados. Chamada ACOPLADA ao
  // client (`.rpc` sobre a expressão) — desacoplar quebra em `this.rest`.
  return (supabase as unknown as {
    rpc: (f: string, a: Record<string, unknown>) => Promise<{ data: T | null; error: RpcErro }>;
  }).rpc(fn, args);
}

/* ---------- Helpers puros (testados em apolicesTab.test.ts) ---------- */

/**
 * Traduz a falha dizendo sempre o que NÃO foi feito. Os `motivo` cobertos saíram
 * do CORPO das três RPCs; não há outro valor possível hoje.
 * 42501 é acesso, nunca "sem apólice".
 */
export function mensagemDeFalha(data: { ok?: boolean; motivo?: string } | null, error: RpcErro, oQue: string): string | null {
  if (error) {
    const semAcesso = error.code === "42501" || /sem permiss/i.test(error.message ?? "");
    return `${oQue}: ${semAcesso ? "você não tem acesso a apólices." : error.message ?? "erro na chamada."}`;
  }
  if (!data) return `${oQue}: a chamada não retornou resultado.`;
  if (data.ok) return null;
  const motivos: Record<string, string> = {
    seguradora_obrigatoria: "informe a seguradora.",
    cliente_nao_encontrado: "cliente não encontrado.",
    cliente_nao_informado: "cliente não informado.",
    ambiguo: "mais de um cliente com esse nome.",
    apolice_nao_encontrada: "apólice não encontrada (pode ter sido removida).",
  };
  return `${oQue}: ${motivos[data.motivo ?? ""] ?? `erro${data.motivo ? ` (${data.motivo})` : ""}.`}`;
}

/** numeric em jsonb chega como número, mas aceito string para não quebrar a tela. */
export function paraNumero(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export function formatBRL(v: number | string | null | undefined): string {
  const n = paraNumero(v);
  return n === null ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * Lê valor digitado em pt-BR. "1.234,56" → 1234.56 · "45,90" → 45.9.
 * Só ponto: grupos de exatamente 3 dígitos são milhar ("1.234" → 1234);
 * qualquer outro caso é decimal ("45.90" → 45.9). Vazio → null (para a RPC
 * receber NULL e não gravar 0, que significaria "prêmio zero").
 */
export function parseValorBR(texto: string): number | null {
  const t = texto.trim();
  if (t === "") return null;
  const limpo = t.replace(/[^\d.,-]/g, "");
  if (limpo === "") return null;
  let normal: string;
  if (limpo.includes(",")) {
    normal = limpo.replace(/\./g, "").replace(",", ".");
  } else if (limpo.includes(".")) {
    const partes = limpo.split(".");
    const milhar = partes.length > 1 && partes.slice(1).every(p => /^\d{3}$/.test(p));
    normal = milhar ? partes.join("") : limpo;
  } else {
    normal = limpo;
  }
  const n = Number(normal);
  return Number.isFinite(n) ? n : null;
}

/**
 * Rodapé do card. MEDIDO: `premio_mensal_somado` é
 * `sum(premio_valor) FILTER (WHERE premio_periodicidade='mensal')` — logo vem
 * NULL (não 0) quando nada é mensal. Escrever "R$ 0,00" aí afirmaria que o
 * cliente paga zero por mês, o que é falso: pode haver apólice anual ou única.
 * NULL com apólice mensal na lista é outro caso ainda: mensal SEM prêmio
 * informado. Os três estados têm texto próprio.
 */
export function resumoPremioMensal(
  somado: number | string | null | undefined,
  periodicidades: (string | null)[],
  filtroNaoReconhecidas: boolean,
): { valor: string; detalhe: string } {
  const total = periodicidades.length;
  const mensais = periodicidades.filter(p => p === "mensal").length;
  const fora = total - mensais;
  const soma = paraNumero(somado);
  const escopo = filtroNaoReconhecidas
    ? "Conjunto exibido: apenas as que o cliente NÃO reconhece."
    : "";

  const base = `Só apólices de periodicidade MENSAL entram na soma`
    + (fora > 0
      ? ` — ${fora} de ${total} ficou de fora (única, anual, outra ou sem periodicidade informada).`
      : total > 0 ? ` — todas as ${total} são mensais.` : ".");

  if (soma !== null) {
    return { valor: formatBRL(soma), detalhe: [base, escopo].filter(Boolean).join(" ") };
  }
  if (mensais > 0) {
    return {
      valor: "sem valor somável",
      detalhe: [`${mensais} apólice(s) mensal(is), mas nenhuma com prêmio informado — não há o que somar.`, escopo]
        .filter(Boolean).join(" "),
    };
  }
  return { valor: "nenhuma apólice mensal", detalhe: [base, escopo].filter(Boolean).join(" ") };
}

/** Contagem por estado de reconhecimento — os três, separados. */
export function contarReconhecimento(rows: { reconhecida: Reconhecida }[]) {
  return {
    reconhece: rows.filter(r => r.reconhecida === true).length,
    naoReconhece: rows.filter(r => r.reconhecida === false).length,
    naoPerguntado: rows.filter(r => r.reconhecida === null).length,
  };
}

/* ---------- Nova apólice ---------- */

const FORM_VAZIO = {
  seguradora: "", produto: "", numero_apolice: "", numero_processo_susep: "",
  premio_valor: "", premio_periodicidade: "", origem_desconto: "",
  reconhecida: "", vigencia_inicio: "", observacao: "",
};

function NovaApoliceCard({ clientId, onCriada }: { clientId: string; onCriada: () => void }) {
  const [aberto, setAberto] = useState(false);
  const [f, setF] = useState({ ...FORM_VAZIO });
  const [salvando, setSalvando] = useState(false);
  // A `nota` da RPC fica fixa na tela: some do toast em segundos, e é ela que
  // diz se a apólice virou insumo da tese ou trabalho pendente de ligação.
  const [nota, setNota] = useState<string | null>(null);

  const set = (k: keyof typeof FORM_VAZIO) => (e: { target: { value: string } }) =>
    setF(prev => ({ ...prev, [k]: e.target.value }));

  async function salvar() {
    const seguradora = f.seguradora.trim();
    if (!seguradora) { toast.error("Apólice NÃO registrada: informe a seguradora."); return; }
    setSalvando(true);
    const { data, error } = await rpc<EscritaRes>("registrar_apolice", {
      p_seguradora: seguradora,
      p_client_id: clientId,
      p_cliente_nome: null,
      p_produto: f.produto.trim() || null,
      p_numero_apolice: f.numero_apolice.trim() || null,
      p_premio_valor: parseValorBR(f.premio_valor),
      p_premio_periodicidade: f.premio_periodicidade || null,
      p_origem_desconto: f.origem_desconto || null,
      // Três estados: "" é NÃO PERGUNTADO (null), não "não reconhece".
      p_reconhecida: f.reconhecida === "" ? null : f.reconhecida === "sim",
      // Data vazia vai como null: string vazia em coluna date é 22007.
      p_vigencia_inicio: f.vigencia_inicio || null,
      p_numero_processo_susep: f.numero_processo_susep.trim() || null,
      p_observacao: f.observacao.trim() || null,
    });
    const err = mensagemDeFalha(data, error, "Apólice NÃO registrada");
    setSalvando(false);
    if (err) { toast.error(err); return; }
    setNota(data?.nota ?? null);
    toast.success(data?.nota ? `Apólice registrada. ${data.nota}` : "Apólice registrada.");
    setF({ ...FORM_VAZIO });
    setAberto(false);
    onCriada();
  }

  return (
    <>
      {nota && (
        <div className="cli-card" style={{ padding: "12px 16px", display: "flex", gap: 10, alignItems: "flex-start" }}>
          <span style={{ fontSize: 16, lineHeight: 1.2 }}>⚠</span>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--cli-ink)", lineHeight: 1.5, flex: 1 }}>{nota}</div>
          <button className="cli-btn sm ghost" onClick={() => setNota(null)}>Ok</button>
        </div>
      )}

      {!aberto ? (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button className="cli-btn sm" onClick={() => setAberto(true)}>+ Nova apólice</button>
        </div>
      ) : (
        <div className="cli-card lift" style={{ padding: 18 }}>
          <div className="cli-sec-title" style={{ padding: "2px 4px 10px" }}>Nova apólice de seguro</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
            <div style={{ flex: "1 1 200px" }}>
              <label className="cli-label">Seguradora *</label>
              <input className="cli-input" value={f.seguradora} onChange={set("seguradora")}
                placeholder="Ex.: SEGURADORA EXEMPLO S.A." />
            </div>
            <div style={{ flex: "1 1 180px" }}>
              <label className="cli-label">Produto</label>
              <input className="cli-input" value={f.produto} onChange={set("produto")}
                placeholder="Ex.: vida em grupo" />
            </div>
            <div style={{ flex: "0 1 160px" }}>
              <label className="cli-label">Nº da apólice</label>
              <input className="cli-input" value={f.numero_apolice} onChange={set("numero_apolice")} placeholder="opcional" />
            </div>
            <div style={{ flex: "0 1 170px" }}>
              <label className="cli-label">Processo SUSEP</label>
              <input className="cli-input" value={f.numero_processo_susep} onChange={set("numero_processo_susep")} placeholder="opcional" />
            </div>
            <div style={{ flex: "0 1 140px" }}>
              <label className="cli-label">Prêmio (R$)</label>
              <input className="cli-input" inputMode="decimal" value={f.premio_valor}
                onChange={set("premio_valor")} placeholder="Ex.: 45,90" />
            </div>
            <div style={{ flex: "0 1 150px" }}>
              <label className="cli-label">Periodicidade</label>
              <select className="cli-select" value={f.premio_periodicidade} onChange={set("premio_periodicidade")}>
                <option value="">Não informada</option>
                {PREMIO_PERIODICIDADE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div style={{ flex: "0 1 175px" }}>
              <label className="cli-label">Origem do desconto</label>
              <select className="cli-select" value={f.origem_desconto} onChange={set("origem_desconto")}>
                <option value="">Não informada</option>
                {ORIGEM_DESCONTO_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div style={{ flex: "0 1 190px" }}>
              <label className="cli-label">Cliente reconhece?</label>
              <select className="cli-select" value={f.reconhecida} onChange={set("reconhecida")}>
                <option value="">Ainda não perguntado</option>
                <option value="sim">Sim, reconhece</option>
                <option value="nao">NÃO reconhece</option>
              </select>
            </div>
            <div style={{ flex: "0 1 160px" }}>
              <label className="cli-label">Início da vigência</label>
              <input className="cli-input" type="date" value={f.vigencia_inicio} onChange={set("vigencia_inicio")} />
            </div>
            <div style={{ flex: "1 1 240px" }}>
              <label className="cli-label">Observação</label>
              <input className="cli-input" value={f.observacao} onChange={set("observacao")} placeholder="opcional" />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ fontSize: 12, color: "var(--cli-muted)", fontWeight: 500, flex: "1 1 320px", lineHeight: 1.5 }}>
              "Ainda não perguntado" é um estado real e diferente de "não reconhece" — não escolha
              "NÃO reconhece" sem ter perguntado ao cliente. A gravação <strong>não</strong> deduplica:
              chamar duas vezes cria duas apólices. Processo SUSEP, vigência e observação são gravados,
              mas <strong>não</strong> voltam na listagem desta aba.
            </div>
            <button className="cli-btn sm" disabled={salvando || !f.seguradora.trim()} onClick={() => void salvar()}>
              {salvando ? "Registrando…" : "Registrar"}
            </button>
            <button className="cli-btn sm ghost" disabled={salvando}
              onClick={() => { setF({ ...FORM_VAZIO }); setAberto(false); }}>Cancelar</button>
          </div>
        </div>
      )}
    </>
  );
}

/* ---------- Atualizar apólice ---------- */

function AtualizarApolice({ apolice, aberto, onAbrir, onFechar, onFeito }: {
  apolice: ApoliceRow;
  aberto: boolean;
  onAbrir: () => void;
  onFechar: () => void;
  onFeito: () => void;
}) {
  const [reconhecida, setReconhecida] = useState("");
  const [canceladaEm, setCanceladaEm] = useState("");
  const [restituicao, setRestituicao] = useState("");
  const [observacao, setObservacao] = useState("");
  const [salvando, setSalvando] = useState(false);

  // MEDIDO: `atualizar_apolice` usa coalesce(p_x, valor_atual) em todos os campos.
  // Campo vazio = MANTÉM. Chamar com tudo vazio devolve ok:true sem mudar nada, e
  // o toast de sucesso viraria mentira — por isso o botão exige pelo menos um campo.
  //
  // O guard olha o valor JÁ PARSEADO, não o texto: "abc" (ou "-", ou "R$") é texto
  // não-vazio mas parseValorBR devolve null, então o guard passaria e os 4
  // parâmetros iriam nulos — de volta ao "sucesso sem execução" que ele existe para
  // impedir. Valor não numérico agora é ERRO próprio, não silêncio.
  const restituicaoParseada = parseValorBR(restituicao);
  const restituicaoInvalida = restituicao.trim() !== "" && restituicaoParseada === null;
  const nadaPreenchido = reconhecida === "" && canceladaEm === ""
    && restituicaoParseada === null && observacao.trim() === "";

  function limpar() {
    setReconhecida(""); setCanceladaEm(""); setRestituicao(""); setObservacao("");
  }

  async function salvar() {
    if (restituicaoInvalida) {
      toast.error(`Apólice NÃO atualizada: "${restituicao.trim()}" não é um valor. Use algo como 1.234,56.`);
      return;
    }
    setSalvando(true);
    const { data, error } = await rpc<EscritaRes>("atualizar_apolice", {
      p_apolice_id: apolice.id,
      p_reconhecida: reconhecida === "" ? null : reconhecida === "sim",
      p_cancelada_em: canceladaEm || null,
      p_restituicao_valor: restituicaoParseada,
      p_observacao: observacao.trim() || null,
    });
    const err = mensagemDeFalha(data, error, "Apólice NÃO atualizada");
    setSalvando(false);
    if (err) { toast.error(err); return; }
    toast.success(`Apólice atualizada · ${apolice.seguradora}`);
    limpar();
    onFechar();
    onFeito();
  }

  if (!aberto) {
    return <button className="cli-btn sm ghost" onClick={onAbrir}>Atualizar</button>;
  }

  return (
    <div style={{ width: "100%", marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--cli-line, rgba(0,0,0,.08))" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end" }}>
        <div style={{ flex: "0 1 195px" }}>
          <label className="cli-label">Cliente reconhece?</label>
          <select className="cli-select" value={reconhecida} onChange={e => setReconhecida(e.target.value)}>
            <option value="">Não alterar</option>
            <option value="sim">Sim, reconhece</option>
            <option value="nao">NÃO reconhece</option>
          </select>
        </div>
        <div style={{ flex: "0 1 155px" }}>
          <label className="cli-label">Cancelada em</label>
          <input className="cli-input" type="date" value={canceladaEm} onChange={e => setCanceladaEm(e.target.value)} />
        </div>
        <div style={{ flex: "0 1 150px" }}>
          <label className="cli-label">Restituição (R$)</label>
          <input className="cli-input" inputMode="decimal" value={restituicao}
            onChange={e => setRestituicao(e.target.value)} placeholder="Ex.: 1.234,56" />
        </div>
        <div style={{ flex: "1 1 220px" }}>
          <label className="cli-label">Observação (acrescenta)</label>
          <input className="cli-input" value={observacao} onChange={e => setObservacao(e.target.value)} placeholder="opcional" />
        </div>
        <button className="cli-btn sm" disabled={salvando || nadaPreenchido || restituicaoInvalida}
          title={restituicaoInvalida ? "A restituição não é um valor numérico." : undefined}
          onClick={() => void salvar()}>
          {salvando ? "Salvando…" : "Salvar"}
        </button>
        <button className="cli-btn sm ghost" disabled={salvando} onClick={() => { limpar(); onFechar(); }}>Cancelar</button>
      </div>
      {restituicaoInvalida && (
        <div style={{ fontSize: 12, color: "#c0392b", fontWeight: 600, marginTop: 6 }}>
          "{restituicao.trim()}" não é um valor. Use algo como 1.234,56 — texto não numérico
          viraria nulo e a atualização passaria sem mudar nada.
        </div>
      )}
      <div style={{ fontSize: 12, color: "var(--cli-muted)", fontWeight: 500, marginTop: 8, lineHeight: 1.5 }}>
        Campo em branco <strong>mantém</strong> o valor atual — esta atualização não apaga nada.
        Por isso não é possível voltar uma apólice para "não perguntado", nem zerar cancelamento
        ou restituição, por aqui. A observação é <strong>acrescentada</strong> às anteriores.
      </div>
    </div>
  );
}

/* ---------- Aba ---------- */

export function ApolicesTab({ client }: { client: ClientFull }) {
  const [rows, setRows] = useState<ApoliceRow[] | null>(null);
  const [somado, setSomado] = useState<number | string | null>(null);
  const [soNaoReconhecidas, setSoNaoReconhecidas] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRows(null);
    const { data, error } = await rpc<ConsultaRes>("consultar_apolices", {
      p_client_id: client.id,
      p_cliente_nome: null,
      // MEDIDO: o filtro é `NOT p_apenas_nao_reconhecidas OR reconhecida IS FALSE`.
      // Com NULL, `NOT NULL` é NULL e só sobra a linha com reconhecida = FALSE —
      // isto é, NULL se comporta como TRUE. Sempre mandar o booleano explícito.
      p_apenas_nao_reconhecidas: soNaoReconhecidas,
      p_seguradora: null,
    });
    const err = mensagemDeFalha(data, error, "Apólices NÃO carregadas");
    if (err) { toast.error(err); setRows([]); setSomado(null); return; }
    setRows(data?.apolices ?? []);
    setSomado(data?.premio_mensal_somado ?? null);
  }, [client.id, soNaoReconhecidas]);

  useEffect(() => { void load(); }, [load]);

  const resumo = useMemo(
    () => resumoPremioMensal(somado, (rows ?? []).map(r => r.periodicidade), soNaoReconhecidas),
    [somado, rows, soNaoReconhecidas],
  );
  const contagem = useMemo(() => contarReconhecimento(rows ?? []), [rows]);

  if (rows === null) return <TabLoading />;

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <NovaApoliceCard clientId={client.id} onCriada={() => void load()} />

      <div className="cli-card lift" style={{ padding: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "2px 4px 10px" }}>
          <div className="cli-sec-title" style={{ padding: 0 }}>
            Apólices de seguro{rows.length > 0 ? ` · ${rows.length}` : ""}
          </div>
          {contagem.naoReconhece > 0 && (
            <span className="cli-chip d">{contagem.naoReconhece} não reconhecida(s)</span>
          )}
          {contagem.naoPerguntado > 0 && (
            <span className="cli-chip n">{contagem.naoPerguntado} sem perguntar</span>
          )}
          <span style={{ flex: 1 }} />
          <button className={`cli-btn sm${soNaoReconhecidas ? "" : " ghost"}`}
            onClick={() => { setEditando(null); setSoNaoReconhecidas(v => !v); }}>
            {soNaoReconhecidas ? "✓ só as não reconhecidas" : "só as não reconhecidas"}
          </button>
        </div>

        {soNaoReconhecidas && (
          <div style={{ fontSize: 12, color: "var(--cli-muted)", fontWeight: 600, padding: "0 4px 10px", lineHeight: 1.5 }}>
            Filtro do banco: mostra <strong>apenas</strong> as apólices que o cliente afirmou NÃO
            reconhecer. As "ainda não perguntado" <strong>também ficam escondidas</strong> —
            desligue o filtro para vê-las.
          </div>
        )}

        {rows.length === 0 ? (
          <EmptyState icon="🛡"
            title={soNaoReconhecidas ? "Nenhuma apólice marcada como não reconhecida" : "Nenhuma apólice registrada"}
            hint={soNaoReconhecidas
              ? "Pode haver apólices ainda não perguntadas ao cliente — desligue o filtro para conferir."
              : "Seguros descontados do benefício ou da conta aparecem aqui — registre pelo botão acima ou pelo chat."} />
        ) : rows.map(r => {
          const rec = reconhecidaMeta(r.reconhecida);
          const emEdicao = editando === r.id;
          return (
            <div key={r.id} style={{ borderBottom: "1px solid var(--cli-line, rgba(0,0,0,.06))", padding: "10px 4px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <div style={{ minWidth: 0, flex: "1 1 260px" }}>
                  <div style={{ fontWeight: 800, fontSize: 14, color: "var(--cli-ink)" }}>
                    {r.seguradora}{r.produto ? ` — ${r.produto}` : ""}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--cli-muted)", fontWeight: 600 }}>
                    {r.numero_apolice ? `apólice ${r.numero_apolice}` : "sem nº de apólice"}
                    {" · "}
                    {paraNumero(r.premio) === null
                      ? "prêmio não informado"
                      : `${formatBRL(r.premio)} ${r.periodicidade
                          ? (PREMIO_PERIODICIDADE_LABELS[r.periodicidade] ?? r.periodicidade).toLowerCase()
                          : "(periodicidade não informada)"}`}
                    {r.origem_desconto
                      ? ` · descontado em ${ORIGEM_DESCONTO_LABELS[r.origem_desconto] ?? r.origem_desconto}`
                      : ""}
                    {r.cancelada_em ? ` · cancelada em ${formatDateBR(r.cancelada_em)}` : ""}
                    {paraNumero(r.restituicao) !== null ? ` · restituição ${formatBRL(r.restituicao)}` : ""}
                  </div>
                </div>
                <span className={`cli-chip ${rec.cls}`} title={r.reconhecida === false
                  ? "Insumo da tese de seguro não autorizado (SUSEP)"
                  : r.reconhecida === null ? "Ninguém perguntou ao cliente ainda" : undefined}>
                  {rec.icone} {rec.label}
                </span>
                {/* "Não perguntado" é trabalho pendente, não um veredito: a ação leva
                    direto ao campo onde a resposta da ligação é registrada. */}
                {r.reconhecida === null && !emEdicao && (
                  <button className="cli-btn sm" onClick={() => setEditando(r.id)}>
                    ☎ Perguntar na próxima ligação
                  </button>
                )}
                <AtualizarApolice apolice={r} aberto={emEdicao}
                  onAbrir={() => setEditando(r.id)}
                  onFechar={() => setEditando(null)}
                  onFeito={() => void load()} />
              </div>
            </div>
          );
        })}

        {/* Rodapé: a soma vem do banco e cobre SÓ periodicidade mensal. */}
        <div style={{
          display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap",
          marginTop: 14, paddingTop: 12, borderTop: "2px solid var(--cli-ink)",
        }}>
          <div className="cli-sec-title" style={{ padding: 0 }}>Prêmio mensal somado</div>
          <div style={{ fontWeight: 800, fontSize: 17, color: "var(--cli-ink)" }}>{resumo.valor}</div>
          <div style={{ flex: "1 1 260px", fontSize: 12, color: "var(--cli-muted)", fontWeight: 500, lineHeight: 1.5 }}>
            {resumo.detalhe}
          </div>
        </div>

        {/* Legenda dos TRÊS estados — é a razão de existir do card. */}
        <div style={{ fontSize: 12, color: "var(--cli-muted)", fontWeight: 600, marginTop: 12, lineHeight: 1.6 }}>
          <span className="cli-chip ok">✅ Reconhece</span>{" "}o cliente confirma o seguro. ·{" "}
          <span className="cli-chip d">❌ NÃO reconhece</span>{" "}é a <strong>tese</strong>: insumo da
          ação de seguro não autorizado (SUSEP). ·{" "}
          <span className="cli-chip n">⚪ Não perguntado</span>{" "}ninguém perguntou ainda — não conta
          como reconhecimento nem como recusa.
        </div>
      </div>
    </div>
  );
}
