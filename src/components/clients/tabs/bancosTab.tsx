import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { type ClientFull, EmptyState, TabLoading, formatDateBR } from "../shared";
import { TIPO_RELACAO_LABELS, TIPO_RELACAO_OPTIONS } from "@/lib/motor1";
import { useBancosConhecidos } from "@/hooks/useBancosConhecidos";

/* ============================================================
   Card 3 — aba Bancos (segmentação bancária do cliente)
   ============================================================
   Duas informações distintas, propositalmente separadas na tela:

   · BANCO DO BENEFÍCIO (clients.banco_beneficio) — onde o cliente RECEBE.
     É 1 por cliente e alimenta o filtro "recebe em" das campanhas.
   · RELAÇÕES (client_bank_relations) — com quem o cliente TEM contrato
     (consignado, seguro, cartão…). São N por cliente, chave única
     (client_id, banco, tipo_relacao), e alimentam "consignado com".

   ESCRITA: só pela RPC `registrar_relacao_bancaria`. A tabela não tem policy
   de INSERT/UPDATE — um insert direto do front seria recusado pela RLS. A RPC
   é a MESMA que a tool do chat usa, então tela e chat gravam idêntico.

   Leitura de banco_beneficio: direto de `clients` (gate can_view_clients),
   porque a view `clients_decrypted` — de onde vem o resto da ficha — não
   projeta essa coluna (conferido em 29/07).
============================================================ */

interface BankRelationRow {
  id: string;
  banco: string;
  tipo_relacao: string;
  reconhece: boolean | null;
  extrato_em_posse: boolean;
  extrato_ano: number | null;
  contrato_em_posse: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface RpcResult {
  ok?: boolean;
  motivo?: string;
  relation_id?: string | null;
  cliente?: string;
}

const RECONHECE_META: Record<string, { label: string; cls: string }> = {
  sim: { label: "Reconhece", cls: "ok" },
  nao: { label: "Não reconhece", cls: "d" },
};

function chamarRpc(args: Record<string, unknown>) {
  // Cast: a RPC do Motor 1 ainda não está nos tipos gerados. Chamada ACOPLADA
  // ao client (`.rpc` sobre a expressão) — desacoplar quebra em `this.rest`.
  return (supabase as unknown as {
    rpc: (fn: string, a: Record<string, unknown>) => Promise<{ data: RpcResult | null; error: { message?: string } | null }>;
  }).rpc("registrar_relacao_bancaria", args);
}

/** Traduz o `motivo` devolvido pela RPC; sempre diz o que NÃO foi gravado. */
function mensagemDeFalha(res: RpcResult | null, erro: { message?: string } | null): string | null {
  if (erro) return `Nada foi gravado: ${erro.message ?? "erro na chamada"}`;
  if (!res) return "Nada foi gravado: a chamada não retornou resultado.";
  if (res.ok) return null;
  const motivos: Record<string, string> = {
    cliente_nao_encontrado: "Nada foi gravado: cliente não encontrado.",
    cliente_nao_informado: "Nada foi gravado: cliente não informado.",
    ambiguo: "Nada foi gravado: mais de um cliente com esse nome.",
  };
  return motivos[res.motivo ?? ""] ?? `Nada foi gravado${res.motivo ? ` (${res.motivo})` : "."}`;
}

/* ---------- Banco do benefício ---------- */

// Id único do <datalist> de bancos, renderizado UMA vez pela aba (dois elementos
// com o mesmo id fariam o navegador ignorar o segundo).
const BANCOS_LIST_ID = "cli-bancos-conhecidos";

function BancoBeneficioCard({ clientId, atual, onSaved }: {
  clientId: string; atual: string | null; onSaved: () => void;
}) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(atual ?? "");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => { setValor(atual ?? ""); }, [atual]);

  async function salvar() {
    const banco = valor.trim().toUpperCase();
    if (!banco) { toast.error("Informe o banco do benefício."); return; }
    setSalvando(true);
    const { data, error } = await chamarRpc({ p_client_id: clientId, p_banco_beneficio: banco });
    const falha = mensagemDeFalha(data, error);
    setSalvando(false);
    if (falha) { toast.error(falha); return; }
    toast.success(`Banco do benefício: ${banco}`);
    setEditando(false);
    onSaved();
  }

  return (
    <div className="cli-card lift" style={{ padding: 18 }}>
      <div className="cli-sec-title" style={{ padding: "2px 4px 10px" }}>Banco do benefício</div>
      {editando ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
          <div style={{ flex: "1 1 240px" }}>
            <label className="cli-label">Onde o cliente recebe</label>
            <input className="cli-input" list={BANCOS_LIST_ID} value={valor}
              placeholder="Ex.: BRADESCO"
              onChange={e => setValor(e.target.value.toUpperCase())} />
          </div>
          <button className="cli-btn sm" disabled={salvando} onClick={() => void salvar()}>
            {salvando ? "Salvando…" : "Salvar"}
          </button>
          <button className="cli-btn sm ghost" disabled={salvando}
            onClick={() => { setValor(atual ?? ""); setEditando(false); }}>Cancelar</button>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 800, fontSize: 15, color: "var(--cli-ink)" }}>
            {atual?.trim() ? atual : "—"}
          </span>
          {!atual?.trim() && (
            <span style={{ fontSize: 13, color: "var(--cli-muted)", fontWeight: 500 }}>
              não informado — sem isso o cliente não entra no filtro "recebe em" das campanhas
            </span>
          )}
          <span style={{ flex: 1 }} />
          <button className="cli-btn sm" onClick={() => setEditando(true)}>✎ Alterar</button>
        </div>
      )}
    </div>
  );
}

/* ---------- Registrar relação ---------- */

const FORM_VAZIO = {
  banco: "", tipo_relacao: TIPO_RELACAO_OPTIONS[0].value, reconhece: "",
  extrato_em_posse: false, extrato_ano: "", contrato_em_posse: false, notes: "",
};

function NovaRelacaoCard({ clientId, onSaved }: { clientId: string; onSaved: () => void }) {
  const [f, setF] = useState({ ...FORM_VAZIO });
  const [salvando, setSalvando] = useState(false);

  const set = <K extends keyof typeof FORM_VAZIO>(k: K, v: (typeof FORM_VAZIO)[K]) =>
    setF(prev => ({ ...prev, [k]: v }));

  const anoInvalido = f.extrato_ano !== "" &&
    (!/^\d{4}$/.test(f.extrato_ano) || Number(f.extrato_ano) < 2000 || Number(f.extrato_ano) > 2100);

  async function salvar() {
    const banco = f.banco.trim().toUpperCase();
    if (!banco) { toast.error("Informe o banco."); return; }
    // O CHECK do banco recusa ano fora de 2000–2100; barro antes para o erro
    // aparecer no campo, e não como 23514 vindo do servidor.
    if (anoInvalido) { toast.error("Ano do extrato deve ter 4 dígitos, entre 2000 e 2100."); return; }
    setSalvando(true);
    const { data, error } = await chamarRpc({
      p_client_id: clientId,
      p_banco: banco,
      p_tipo_relacao: f.tipo_relacao,
      p_reconhece: f.reconhece === "" ? null : f.reconhece === "sim",
      p_extrato_em_posse: f.extrato_em_posse,
      p_extrato_ano: f.extrato_ano === "" ? null : Number(f.extrato_ano),
      p_contrato_em_posse: f.contrato_em_posse,
      p_notes: f.notes.trim() || null,
    });
    const falha = mensagemDeFalha(data, error);
    setSalvando(false);
    if (falha) { toast.error(falha); return; }
    toast.success(`${TIPO_RELACAO_LABELS[f.tipo_relacao] ?? f.tipo_relacao} · ${banco} registrado`);
    setF({ ...FORM_VAZIO });
    onSaved();
  }

  return (
    <div className="cli-card lift" style={{ padding: 18 }}>
      <div className="cli-sec-title" style={{ padding: "2px 4px 10px" }}>Registrar relação bancária</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
        <div style={{ flex: "1 1 200px" }}>
          <label className="cli-label">Banco</label>
          <input className="cli-input" list={BANCOS_LIST_ID} value={f.banco}
            placeholder="Ex.: AGIBANK"
            onChange={e => set("banco", e.target.value.toUpperCase())} />
        </div>
        <div style={{ flex: "0 1 190px" }}>
          <label className="cli-label">Tipo de relação</label>
          <select className="cli-select" value={f.tipo_relacao}
            onChange={e => set("tipo_relacao", e.target.value)}>
            {TIPO_RELACAO_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div style={{ flex: "0 1 170px" }}>
          <label className="cli-label">Cliente reconhece?</label>
          <select className="cli-select" value={f.reconhece} onChange={e => set("reconhece", e.target.value)}>
            <option value="">Não informado</option>
            <option value="sim">Sim</option>
            <option value="nao">Não</option>
          </select>
        </div>
        <div style={{ flex: "0 1 130px" }}>
          <label className="cli-label">Ano do extrato</label>
          <input className="cli-input" inputMode="numeric" maxLength={4} value={f.extrato_ano}
            placeholder="2024"
            onChange={e => set("extrato_ano", e.target.value.replace(/\D/g, "").slice(0, 4))} />
        </div>
        <div style={{ flex: "1 1 240px" }}>
          <label className="cli-label">Observação</label>
          <input className="cli-input" value={f.notes} placeholder="opcional"
            onChange={e => set("notes", e.target.value)} />
        </div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center", marginTop: 12 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600 }}>
          <input type="checkbox" checked={f.extrato_em_posse}
            onChange={e => set("extrato_em_posse", e.target.checked)} />
          Extrato em posse do escritório
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600 }}>
          <input type="checkbox" checked={f.contrato_em_posse}
            onChange={e => set("contrato_em_posse", e.target.checked)} />
          Contrato em posse do escritório
        </label>
        <span style={{ flex: 1 }} />
        <button className="cli-btn sm" disabled={salvando || !f.banco.trim()} onClick={() => void salvar()}>
          {salvando ? "Salvando…" : "Registrar"}
        </button>
      </div>
      <div style={{ fontSize: 12, color: "var(--cli-muted)", fontWeight: 500, marginTop: 10, lineHeight: 1.5 }}>
        Banco + tipo já existente é <strong>atualizado</strong>, não duplicado. Os dois campos
        "em posse" só avançam: desmarcar não apaga uma posse já confirmada — a RPC nunca
        rebaixa esse estado. Para corrigir uma posse marcada por engano, use a observação.
      </div>
    </div>
  );
}

/* ---------- Lista ---------- */

function RelacoesCard({ rows }: { rows: BankRelationRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="cli-card lift" style={{ padding: 18 }}>
        <div className="cli-sec-title" style={{ padding: "2px 4px 10px" }}>Relações bancárias</div>
        <EmptyState icon="▦" title="Nenhuma relação bancária registrada"
          hint="Consignados, seguros e cartões informados pelo cliente aparecem aqui — pelo formulário acima ou pelo chat." />
      </div>
    );
  }
  return (
    <div className="cli-card lift" style={{ padding: 18 }}>
      <div className="cli-sec-title" style={{ padding: "2px 4px 10px" }}>Relações bancárias · {rows.length}</div>
      {rows.map(r => {
        const rec = r.reconhece === null ? null : RECONHECE_META[r.reconhece ? "sim" : "nao"];
        return (
          <div key={r.id} className="cli-row">
            <div className="dot">▦</div>
            <div className="body">
              <div className="t">{r.banco}</div>
              <div className="s">
                {TIPO_RELACAO_LABELS[r.tipo_relacao] ?? r.tipo_relacao}
                {r.extrato_ano ? ` · extrato ${r.extrato_ano}` : ""}
                {` · ${formatDateBR(r.created_at)}`}
                {r.notes ? ` · ${r.notes}` : ""}
              </div>
            </div>
            <span style={{ display: "flex", gap: 8, alignItems: "center", marginLeft: "auto", flexShrink: 0, flexWrap: "wrap" }}>
              {rec
                ? <span className={`cli-chip ${rec.cls}`}>{rec.label}</span>
                : <span className="cli-chip p">Reconhecimento não informado</span>}
              {r.extrato_em_posse && <span className="cli-chip ok">Extrato em posse</span>}
              {r.contrato_em_posse && <span className="cli-chip ok">Contrato em posse</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Aba ---------- */

export function BancosTab({ client }: { client: ClientFull }) {
  const bancos = useBancosConhecidos();
  const [rows, setRows] = useState<BankRelationRow[] | null>(null);
  const [bancoBeneficio, setBancoBeneficio] = useState<string | null>(null);

  const load = useCallback(async () => {
    // Cast: nem `client_bank_relations` nem `clients.banco_beneficio` estão nos
    // tipos gerados (desync do types.ts). Chamada ACOPLADA ao client.
    const sb = supabase as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (k: string, v: string) => {
            order: (c: string, o: { ascending: boolean }) => Promise<{ data: BankRelationRow[] | null; error: { message?: string } | null }>;
            maybeSingle: () => Promise<{ data: { banco_beneficio: string | null } | null; error: unknown }>;
          };
        };
      };
    };
    const [relRes, cliRes] = await Promise.all([
      sb.from("client_bank_relations")
        .select("id, banco, tipo_relacao, reconhece, extrato_em_posse, extrato_ano, contrato_em_posse, notes, created_at, updated_at")
        .eq("client_id", client.id)
        .order("banco", { ascending: true }),
      sb.from("clients").select("banco_beneficio").eq("id", client.id).maybeSingle(),
    ]);
    if (relRes.error) {
      toast.error(`Erro ao carregar relações bancárias: ${relRes.error.message}`);
      setRows([]);
    } else {
      setRows(relRes.data ?? []);
    }
    setBancoBeneficio(cliRes.data?.banco_beneficio ?? null);
  }, [client.id]);

  useEffect(() => { void load(); }, [load]);

  if (rows === null) return <TabLoading />;

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {/* Uma única lista de sugestões para os dois campos de banco da aba. */}
      <datalist id={BANCOS_LIST_ID}>
        {bancos.map(b => <option key={b} value={b} />)}
      </datalist>
      <BancoBeneficioCard clientId={client.id} atual={bancoBeneficio} onSaved={() => void load()} />
      <NovaRelacaoCard clientId={client.id} onSaved={() => void load()} />
      <RelacoesCard rows={rows} />
    </div>
  );
}
