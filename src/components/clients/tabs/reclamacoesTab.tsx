import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { type ClientFull, EmptyState, TabLoading, formatDateBR } from "../shared";
import {
  RECLAMACAO_ORGAO_LABELS, RECLAMACAO_ORGAO_OPTIONS,
  RECLAMACAO_DESFECHO_META, RECLAMACAO_DESFECHO_OPTIONS,
} from "@/lib/motores23";

/* ============================================================
   Card 6 — Reclamações administrativas do cliente
   ============================================================
   Leitura direto da tabela (a RLS resolve: recepção + advogado + sócio + admin).
   ESCRITA só por RPC — não há policy de INSERT/UPDATE, um insert do front seria
   recusado. As mesmas RPCs que o chat usa, então tela e chat gravam idêntico:
   `registrar_reclamacao` e `registrar_resposta_reclamacao`.

   Os prazos informados aqui viram pendência automática no dashboard de prazos
   (quem cria é a RPC, não esta tela).
============================================================ */

interface ReclamacaoRow {
  id: string;
  orgao: string;
  tese: string | null;
  protocolo: string | null;
  data_reclamacao: string;
  prazo_resposta: string | null;
  prazo_fatal: string | null;
  desfecho: string;
  resposta_em: string | null;
  resposta_texto: string | null;
  notes: string | null;
  created_at: string;
}

type RpcRes = { ok?: boolean; motivo?: string; mensagem?: string; nota?: string; cliente?: string };

function rpc(fn: string, args: Record<string, unknown>) {
  // Cast: as RPCs dos Motores 2/3 ainda não estão nos tipos gerados. Chamada
  // ACOPLADA ao client (desacoplar `rpc` quebra em `this.rest`).
  return (supabase as unknown as {
    rpc: (f: string, a: Record<string, unknown>) => Promise<{ data: RpcRes | null; error: { message?: string } | null }>;
  }).rpc(fn, args);
}

/** Traduz a falha da RPC dizendo sempre o que NÃO foi gravado. */
function falha(data: RpcRes | null, error: { message?: string } | null, oQue: string): string | null {
  if (error) return `${oQue}: ${error.message ?? "erro na chamada"}`;
  if (!data) return `${oQue}: a chamada não retornou resultado.`;
  if (data.ok) return null;
  const motivos: Record<string, string> = {
    ambiguo: "mais de um cliente com esse nome",
    cliente_nao_encontrado: "cliente não encontrado",
    cliente_nao_informado: "cliente não informado",
    reclamacao_nao_encontrada: "reclamação não encontrada",
    desfecho_invalido: data.mensagem ?? "desfecho inválido",
    orgao_invalido: data.mensagem ?? "órgão inválido",
  };
  return `${oQue}: ${motivos[data.motivo ?? ""] ?? data.mensagem ?? data.motivo ?? "erro"}`;
}

/** Vence hoje ou já venceu, e ainda está pendente → destaque. */
function prazoVencido(r: ReclamacaoRow): boolean {
  if (r.desfecho !== "pendente") return false;
  const p = r.prazo_fatal ?? r.prazo_resposta;
  if (!p) return false;
  return p <= new Date().toLocaleDateString("en-CA");
}

/* ---------- Nova reclamação ---------- */

const FORM_VAZIO = {
  orgao: RECLAMACAO_ORGAO_OPTIONS[0].value,
  tese: "", protocolo: "", data_reclamacao: "",
  prazo_resposta: "", prazo_fatal: "", observacao: "",
};

function NovaReclamacaoCard({ clientId, onCriada }: { clientId: string; onCriada: () => void }) {
  const [aberto, setAberto] = useState(false);
  const [f, setF] = useState({ ...FORM_VAZIO });
  const [salvando, setSalvando] = useState(false);

  const set = (k: keyof typeof FORM_VAZIO) => (e: { target: { value: string } }) =>
    setF(prev => ({ ...prev, [k]: e.target.value }));

  async function salvar() {
    setSalvando(true);
    const { data, error } = await rpc("registrar_reclamacao", {
      p_orgao: f.orgao,
      p_client_id: clientId,
      p_cliente_nome: null,
      p_tese: f.tese.trim() || null,
      // Vazio vai como null para a RPC aplicar o default (hoje) — string vazia
      // em coluna date levantaria 22007.
      p_data_reclamacao: f.data_reclamacao || null,
      p_protocolo: f.protocolo.trim() || null,
      p_prazo_resposta: f.prazo_resposta || null,
      p_prazo_fatal: f.prazo_fatal || null,
      p_process_id: null,
      p_observacao: f.observacao.trim() || null,
    });
    const err = falha(data, error, "Reclamação NÃO registrada");
    setSalvando(false);
    if (err) { toast.error(err); return; }
    toast.success(
      f.prazo_fatal || f.prazo_resposta
        ? "Reclamação registrada — a pendência de prazo entra no dashboard."
        : "Reclamação registrada.",
    );
    setF({ ...FORM_VAZIO });
    setAberto(false);
    onCriada();
  }

  if (!aberto) {
    return (
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button className="cli-btn sm" onClick={() => setAberto(true)}>+ Nova reclamação</button>
      </div>
    );
  }

  return (
    <div className="cli-card lift" style={{ padding: 18 }}>
      <div className="cli-sec-title" style={{ padding: "2px 4px 10px" }}>Nova reclamação administrativa</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
        <div style={{ flex: "0 1 190px" }}>
          <label className="cli-label">Órgão</label>
          <select className="cli-select" value={f.orgao} onChange={set("orgao")}>
            {RECLAMACAO_ORGAO_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div style={{ flex: "1 1 220px" }}>
          <label className="cli-label">Tese / assunto</label>
          <input className="cli-input" value={f.tese} onChange={set("tese")} placeholder="Ex.: tarifa indevida" />
        </div>
        <div style={{ flex: "0 1 170px" }}>
          <label className="cli-label">Protocolo</label>
          <input className="cli-input" value={f.protocolo} onChange={set("protocolo")} placeholder="Ex.: BCB-123" />
        </div>
        <div style={{ flex: "0 1 160px" }}>
          <label className="cli-label">Data da reclamação</label>
          <input className="cli-input" type="date" value={f.data_reclamacao} onChange={set("data_reclamacao")} />
        </div>
        <div style={{ flex: "0 1 160px" }}>
          <label className="cli-label">Prazo de resposta</label>
          <input className="cli-input" type="date" value={f.prazo_resposta} onChange={set("prazo_resposta")} />
        </div>
        <div style={{ flex: "0 1 160px" }}>
          <label className="cli-label">Prazo FATAL</label>
          <input className="cli-input" type="date" value={f.prazo_fatal} onChange={set("prazo_fatal")} />
        </div>
        <div style={{ flex: "1 1 220px" }}>
          <label className="cli-label">Observação</label>
          <input className="cli-input" value={f.observacao} onChange={set("observacao")} placeholder="opcional" />
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center" }}>
        <div style={{ fontSize: 12, color: "var(--cli-muted)", fontWeight: 500, flex: 1 }}>
          Sem data de reclamação, vale hoje. Cada prazo informado vira pendência no dashboard de prazos.
        </div>
        <button className="cli-btn sm" disabled={salvando} onClick={() => void salvar()}>
          {salvando ? "Registrando…" : "Registrar"}
        </button>
        <button className="cli-btn sm ghost" disabled={salvando}
          onClick={() => { setF({ ...FORM_VAZIO }); setAberto(false); }}>Cancelar</button>
      </div>
    </div>
  );
}

/* ---------- Registrar resposta ---------- */

function RegistrarResposta({ reclamacao, onFeito }: { reclamacao: ReclamacaoRow; onFeito: () => void }) {
  const [aberto, setAberto] = useState(false);
  const [desfecho, setDesfecho] = useState(RECLAMACAO_DESFECHO_OPTIONS[0].value);
  const [texto, setTexto] = useState("");
  const [quando, setQuando] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    setSalvando(true);
    const { data, error } = await rpc("registrar_resposta_reclamacao", {
      p_reclamacao_id: reclamacao.id,
      p_desfecho: desfecho,
      p_resposta_texto: texto.trim() || null,
      p_resposta_em: quando || null,
    });
    const err = falha(data, error, "Resposta NÃO registrada");
    setSalvando(false);
    if (err) { toast.error(err); return; }
    // A RPC devolve a nota jurídica quando o desfecho é negado/silêncio; mostramos
    // o texto DELA em vez de reescrever a regra aqui.
    toast.success(data?.nota ? `Resposta registrada. ${data.nota}` : "Resposta registrada.");
    setAberto(false);
    onFeito();
  }

  if (!aberto) {
    return <button className="cli-btn sm" onClick={() => setAberto(true)}>Registrar resposta</button>;
  }
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end", width: "100%", marginTop: 8 }}>
      <div style={{ flex: "0 1 160px" }}>
        <label className="cli-label">Desfecho</label>
        <select className="cli-select" value={desfecho} onChange={e => setDesfecho(e.target.value)}>
          {RECLAMACAO_DESFECHO_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      <div style={{ flex: "0 1 150px" }}>
        <label className="cli-label">Data da resposta</label>
        <input className="cli-input" type="date" value={quando} onChange={e => setQuando(e.target.value)} />
      </div>
      <div style={{ flex: "1 1 220px" }}>
        <label className="cli-label">Resumo da resposta</label>
        <input className="cli-input" value={texto} onChange={e => setTexto(e.target.value)} placeholder="opcional" />
      </div>
      <button className="cli-btn sm" disabled={salvando} onClick={() => void salvar()}>
        {salvando ? "Salvando…" : "Salvar"}
      </button>
      <button className="cli-btn sm ghost" disabled={salvando} onClick={() => setAberto(false)}>Cancelar</button>
    </div>
  );
}

/* ---------- Aba ---------- */

export function ReclamacoesTab({ client }: { client: ClientFull }) {
  const [rows, setRows] = useState<ReclamacaoRow[] | null>(null);

  const load = useCallback(async () => {
    // Cast: `reclamacoes_administrativas` ainda não está nos tipos gerados.
    const sb = supabase as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (k: string, v: string) => {
            order: (c: string, o: { ascending: boolean }) => Promise<{ data: ReclamacaoRow[] | null; error: { message?: string } | null }>;
          };
        };
      };
    };
    const { data, error } = await sb.from("reclamacoes_administrativas")
      .select("id, orgao, tese, protocolo, data_reclamacao, prazo_resposta, prazo_fatal, desfecho, resposta_em, resposta_texto, notes, created_at")
      .eq("client_id", client.id)
      .order("data_reclamacao", { ascending: false });
    if (error) { toast.error(`Erro ao carregar reclamações: ${error.message}`); setRows([]); return; }
    setRows(data ?? []);
  }, [client.id]);

  useEffect(() => { void load(); }, [load]);

  if (rows === null) return <TabLoading />;

  const pendentes = rows.filter(r => r.desfecho === "pendente").length;

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <NovaReclamacaoCard clientId={client.id} onCriada={() => void load()} />

      <div className="cli-card lift" style={{ padding: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "2px 4px 10px" }}>
          <div className="cli-sec-title" style={{ padding: 0 }}>
            Reclamações administrativas{rows.length > 0 ? ` · ${rows.length}` : ""}
          </div>
          {pendentes > 0 && <span className="cli-chip p">{pendentes} pendente{pendentes !== 1 ? "s" : ""}</span>}
        </div>

        {rows.length === 0 ? (
          <EmptyState icon="⚖" title="Nenhuma reclamação administrativa"
            hint="Procon, Bacen, INSS, consumidor.gov, ouvidoria ou e-mail ao banco — registre pelo botão acima ou pelo chat." />
        ) : rows.map(r => {
          const meta = RECLAMACAO_DESFECHO_META[r.desfecho] ?? { label: r.desfecho, cls: "n" };
          const vencido = prazoVencido(r);
          return (
            <div key={r.id} style={{ borderBottom: "1px solid var(--cli-line, rgba(0,0,0,.06))", padding: "10px 4px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <div style={{ minWidth: 0, flex: "1 1 240px" }}>
                  <div style={{ fontWeight: 800, fontSize: 14, color: "var(--cli-ink)" }}>
                    {RECLAMACAO_ORGAO_LABELS[r.orgao] ?? r.orgao}
                    {r.tese ? ` — ${r.tese}` : ""}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--cli-muted)", fontWeight: 600 }}>
                    {r.protocolo ? `protocolo ${r.protocolo} · ` : ""}
                    {formatDateBR(r.data_reclamacao)}
                    {r.prazo_resposta ? ` · resposta até ${formatDateBR(r.prazo_resposta)}` : ""}
                    {r.prazo_fatal ? ` · FATAL ${formatDateBR(r.prazo_fatal)}` : ""}
                    {r.resposta_em ? ` · respondida em ${formatDateBR(r.resposta_em)}` : ""}
                  </div>
                  {r.resposta_texto && (
                    <div style={{ fontSize: 12, color: "var(--cli-muted)", marginTop: 3 }}>{r.resposta_texto}</div>
                  )}
                </div>
                {vencido && <span className="cli-chip d">prazo vencido</span>}
                <span className={`cli-chip ${meta.cls}`}>{meta.label}</span>
                {r.desfecho === "pendente" && (
                  <RegistrarResposta reclamacao={r} onFeito={() => void load()} />
                )}
              </div>
            </div>
          );
        })}

        {/* Nota do card, fixa: é a razão de existir do registro. */}
        <div style={{ fontSize: 12, color: "var(--cli-muted)", fontWeight: 600, marginTop: 12, lineHeight: 1.5 }}>
          Resposta negada ou silêncio pode servir de prova (interesse de agir).
        </div>
      </div>
    </div>
  );
}
