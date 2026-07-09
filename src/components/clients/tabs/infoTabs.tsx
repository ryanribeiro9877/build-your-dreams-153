import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  type ClientFull, InfoField, InfoGrid, EmptyState, formatDateBR, WhatsAppBadge,
  Reveal, TabLoading,
} from "../shared";
import {
  generateAttendanceSummary, fetchAttendanceSummaries,
  FIELD_LABELS, SUMMARY_FIELDS, type StoredSummary,
} from "@/lib/attendanceSummaryClient";

const GENDER_LABELS: Record<string, string> = { masculino: "Masculino", feminino: "Feminino" };
const MARITAL_LABELS: Record<string, string> = {
  solteiro: "Solteiro(a)", casado: "Casado(a)", divorciado: "Divorciado(a)",
  viuvo: "Viúvo(a)", uniao_estavel: "União Estável",
};
const ORIGIN_LABELS: Record<string, string> = {
  indicacao: "Indicação", ressaque: "Ressaque", whatsapp: "WhatsApp",
  marketing: "Marketing / Anúncio", site: "Site",
};
const GOVBR_LABELS: Record<string, { label: string; color: string }> = {
  ouro: { label: "Ouro", color: "#B8860B" },
  prata: { label: "Prata", color: "#7C7566" },
  bronze: { label: "Bronze", color: "#8B5A2B" },
};

/* ---------- Resumo ---------- */

interface ResumoCounts { docs: number; openTasks: number; sessions: number; }

export function ResumoTab({ client }: { client: ClientFull }) {
  const [counts, setCounts] = useState<ResumoCounts | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [docsRes, tasksRes, sessionsRes] = await Promise.all([
        supabase.from("client_documents").select("id", { count: "exact", head: true }).eq("client_id", client.id),
        supabase.from("user_tasks").select("id", { count: "exact", head: true })
          .eq("client_id", client.id)
          .in("status", ["assigned", "in_progress", "awaiting_external", "awaiting_validation", "blocked"]),
        supabase.from("chat_sessions").select("id", { count: "exact", head: true }).eq("client_id", client.id),
      ]);
      if (cancelled) return;
      setCounts({
        docs: docsRes.count ?? 0,
        openTasks: tasksRes.count ?? 0,
        sessions: sessionsRes.count ?? 0,
      });
    })();
    return () => { cancelled = true; };
  }, [client.id]);

  const kpis = [
    { label: "Documentos", value: counts?.docs, ic: "▤" },
    { label: "Tarefas abertas", value: counts?.openTasks, ic: "◷" },
    { label: "Sessões (IA)", value: counts?.sessions, ic: "✦" },
  ];

  return (
    <div>
      <div className="cli-grid cli-g3" style={{ marginBottom: 18 }}>
        {kpis.map(k => (
          <div key={k.label} className="cli-card cli-stat lift">
            <span className="ic">{k.ic}</span>
            <div className="num">{k.value === undefined ? "…" : k.value}</div>
            <div className="lbl">{k.label}</div>
          </div>
        ))}
      </div>
      <div className="cli-card lift" style={{ marginBottom: 18 }}>
        <div className="cli-sec-title">Contatos principais</div>
        <InfoGrid>
          <InfoField label="Email" value={client.email} />
          <InfoField label="Celular" value={client.phone} protect={{ revealLast: 2 }} badge={client.phone_is_whatsapp ? <WhatsAppBadge /> : undefined} />
          <InfoField label="Cidade" value={client.city ? `${client.city}${client.state ? " / " + client.state : ""}` : null} />
          <InfoField label="Cadastrado em" value={formatDateBR(client.created_at)} />
        </InfoGrid>
      </div>
      <AttendanceSummarySection client={client} />
    </div>
  );
}

/** Seção "Resumo do atendimento": gera (via LLM, edge attendance-summary) e
    exibe o resumo estruturado mais recente salvo em client_documents
    (document_type='resumo_atendimento'); anteriores ficam listados abaixo. */
function AttendanceSummarySection({ client }: { client: ClientFull }) {
  const [summaries, setSummaries] = useState<StoredSummary[] | null>(null);
  const [generating, setGenerating] = useState(false);
  // ClientDetails mantém o painel da aba montado entre clientes (chave por
  // nome da aba, não por client.id); esta ref evita que um fetch atrasado
  // (mount-load ou reload pós-geração) de um client.id antigo sobrescreva o
  // estado depois que o usuário já trocou de cliente.
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    (async () => {
      const list = await fetchAttendanceSummaries(client.id);
      if (cancelledRef.current) return;
      setSummaries(list);
    })();
    return () => { cancelledRef.current = true; };
  }, [client.id]);

  async function handleGenerate() {
    setGenerating(true);
    try {
      const res = await generateAttendanceSummary(client.id);
      if (!res.ok) {
        toast.error(res.reason ? `Não foi possível gerar o resumo: ${res.reason}` : "Não foi possível gerar o resumo.");
        return;
      }
      toast.success("Resumo do atendimento gerado.");
      const list = await fetchAttendanceSummaries(client.id);
      if (cancelledRef.current) return;
      setSummaries(list);
    } finally {
      setGenerating(false);
    }
  }

  const latest = summaries && summaries.length > 0 ? summaries[0] : null;
  const older = summaries && summaries.length > 1 ? summaries.slice(1) : [];

  return (
    <div className="cli-card lift">
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <div className="cli-sec-title" style={{ marginBottom: 0 }}>Resumo do atendimento</div>
        <span style={{ flex: 1 }} />
        <button className="cli-btn sm" type="button" disabled={generating} onClick={() => void handleGenerate()}>
          {generating ? "Gerando…" : "Gerar resumo do atendimento"}
        </button>
      </div>

      {summaries === null && <TabLoading />}

      {summaries !== null && !latest && (
        <EmptyState icon="✦" title="Nenhum resumo gerado ainda"
          hint="Clique em “Gerar resumo do atendimento” para criar um resumo estruturado a partir do histórico do cliente." />
      )}

      {latest && (
        <>
          <p style={{ fontSize: 12, color: "var(--cli-muted)", fontWeight: 600, marginTop: 10, marginBottom: 10 }}>
            Gerado em {formatDateBR(latest.createdAt)}
          </p>
          {latest.summary ? (
            <InfoGrid>
              {SUMMARY_FIELDS.map((field) => {
                const value = latest.summary![field];
                const naoInformado = value === "não informado";
                return (
                  <InfoField key={field} label={FIELD_LABELS[field]}
                    value={naoInformado ? <span style={{ color: "var(--cli-muted)" }}>{value}</span> : value} />
                );
              })}
            </InfoGrid>
          ) : (
            <p style={{ fontSize: 13, color: "var(--cli-muted)" }}>Não foi possível ler o conteúdo deste resumo.</p>
          )}
        </>
      )}

      {older.length > 0 && (
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1.5px solid var(--cli-cream-line)" }}>
          <div className="cli-sub-title">Resumos anteriores</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "var(--cli-ink)" }}>
            {older.map((s) => (
              <li key={s.id} style={{ marginBottom: 4 }}>
                {s.name} <span style={{ color: "var(--cli-muted)" }}>· {formatDateBR(s.createdAt)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ---------- Dados pessoais ---------- */

export function DadosPessoaisTab({ client }: { client: ClientFull }) {
  const isPJ = client.tipo_pessoa === "juridica";
  return (
    <div className="cli-card lift">
      <div className="cli-sec-title">{isPJ ? "Dados da Empresa" : "Dados Pessoais"}</div>
      <InfoGrid>
        <InfoField label={isPJ ? "Razão Social" : "Nome Completo"} value={client.full_name} />
        {isPJ && <InfoField label="Nome Fantasia" value={client.fantasy_name} />}
        <InfoField label="Situação" value={client.status} />
        {isPJ ? (
          <>
            <InfoField label="CNPJ" value={client.cnpj} />
            <InfoField label="Inscrição Estadual" value={client.ie} />
            <InfoField label="Inscrição Municipal" value={client.im} />
            <InfoField label="Data de Fundação" value={client.foundation_date ? formatDateBR(client.foundation_date) : null} />
            <InfoField label="Representante Legal" value={client.legal_rep_name} />
            <InfoField label="CPF do Representante" value={client.legal_rep_cpf} protect={{ revealLast: 0 }} />
          </>
        ) : (
          <>
            <InfoField label="CPF" value={client.cpf} protect={{ revealLast: 0 }} />
            <InfoField label="RG" value={client.rg} protect={{ revealLast: 0 }} />
            <InfoField label="Órgão Emissor" value={client.rg_issuer} />
            <InfoField label="UF do RG" value={client.rg_uf} />
            <InfoField label="Nascimento" value={client.birth_date ? formatDateBR(client.birth_date) : null} />
            <InfoField label="Sexo" value={client.gender ? (GENDER_LABELS[client.gender] ?? client.gender) : null} />
            <InfoField label="Estado Civil" value={client.marital_status ? (MARITAL_LABELS[client.marital_status] ?? client.marital_status) : null} />
            <InfoField label="Nacionalidade" value={client.nationality} />
            <InfoField label="Naturalidade" value={client.natural_city ? `${client.natural_city}${client.natural_uf ? " / " + client.natural_uf : ""}` : null} />
            <InfoField label="Profissão" value={client.profession} />
            <InfoField label="PIS / NIT" value={client.pis_nit} />
          </>
        )}
        <InfoField label="Origem / Captação" value={client.client_origin ? (ORIGIN_LABELS[client.client_origin] ?? client.client_origin) : null} />
      </InfoGrid>

      {!isPJ && (
        <>
          <div className="cli-sub-title">Filiação</div>
          <InfoGrid>
            <InfoField label="Nome da Mãe" value={client.mother_name} />
            <InfoField label="Nome do Pai" value={client.father_name} />
          </InfoGrid>
        </>
      )}

      <div className="cli-sub-title">Dados Bancários / PIX</div>
      <InfoGrid>
        <InfoField label="Banco" value={client.bank_name} />
        <InfoField label="Agência" value={client.bank_agency} />
        <InfoField label="Conta" value={client.bank_account} protect={{ revealLast: 2 }} />
        <InfoField label="Tipo de Conta" value={client.bank_account_type === "poupanca" ? "Poupança" : client.bank_account_type ? "Corrente" : null} />
        <InfoField label="Chave PIX" value={client.pix_key} protect={{ revealLast: 0 }} />
        <InfoField label="Tipo da Chave" value={client.pix_key_type} />
      </InfoGrid>
    </div>
  );
}

/* ---------- Gov.br ----------

   Duas coisas distintas convivem nesta aba:
   1. O NÍVEL da conta Gov.br (ouro/prata/bronze), informado no cadastro do
      cliente (clients.gov_br_profile) — só leitura.
   2. A CREDENCIAL custodiada (usuário/senha) — dado mais sensível do sistema.
      Regra dura (card GOV-CRED): a senha em claro só vem da RPC AUDITADA
      `reveal_gov_credential` (que grava o log antes de retornar); NUNCA lemos
      os bytea `_enc` por SELECT, e a senha revelada NÃO persiste (some ao
      ocultar / trocar de aba / desmontar).
   A escrita passa pela RPC `save_gov_credential` (cifra server-side, exige
   consentimento). Toda esta aba só é alcançável por recepção/sócio — a página
   ClientDetails já barra os demais papéis (ALLOWED_ROLES / RestrictedAccess).
*/

const GOV_STATUS_META: Record<string, { label: string; cls: string }> = {
  valido: { label: "Válido", cls: "ok" },
  invalido: { label: "Inválido", cls: "d" },
  pendente: { label: "Pendente", cls: "p" },
  bloqueado: { label: "Bloqueado", cls: "d" },
};
const GOV_STATUS_OPTIONS = ["pendente", "valido", "invalido", "bloqueado"];

// Versão do termo de consentimento vigente para a custódia da credencial Gov.br.
const GOV_CONSENT_VERSION = "1.0";

// Projeção NÃO-sensível de client_gov_credentials (jamais os bytea `_enc`).
interface GovCredMeta {
  id: string;
  tem_2fa: boolean;
  status_acesso: string | null;
  consentimento_registrado: boolean;
  consentimento_em: string | null;
  consentimento_versao: string | null;
}

type PgErr = { code?: string; message: string } | null;

// A tabela e as RPCs não estão nos tipos gerados do supabase — casts
// estruturais (mesmo padrão de ClientDetails para a view decifrada).
function selectGovCred(clientId: string) {
  return (supabase.from as unknown as (t: string) => {
    select: (c: string) => { eq: (k: string, v: string) => {
      maybeSingle: () => Promise<{ data: GovCredMeta | null; error: PgErr }>;
    } };
  })("client_gov_credentials")
    .select("id, tem_2fa, status_acesso, consentimento_registrado, consentimento_em, consentimento_versao")
    .eq("client_id", clientId)
    .maybeSingle();
}

function govRpc<T>(fn: string, args: Record<string, unknown>) {
  return (supabase.rpc as unknown as (f: string, a: Record<string, unknown>) =>
    Promise<{ data: T; error: PgErr }>)(fn, args);
}

export function GovBrTab({ client }: { client: ClientFull }) {
  const profile = client.gov_br_profile
    ? (GOVBR_LABELS[client.gov_br_profile] ?? { label: client.gov_br_profile, color: "#0B0A06" })
    : null;

  const [meta, setMeta] = useState<GovCredMeta | null | undefined>(undefined); // undefined = carregando
  const [revealed, setRevealed] = useState<{ usuario: string; senha: string } | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await selectGovCred(client.id);
    if (error) { toast.error("Erro ao carregar credencial Gov.br"); setMeta(null); return; }
    setMeta(data);
  }, [client.id]);

  useEffect(() => { void load(); }, [load]);

  // Segurança: a senha revelada NUNCA deve persistir. Descarta ao trocar de
  // cliente e ao desmontar (trocar de aba remonta o painel → desmonta aqui).
  useEffect(() => {
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      setRevealed(null);
    };
  }, [client.id]);

  function clearReveal() {
    if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; }
    setRevealed(null);
  }

  async function handleReveal() {
    // Aviso explícito de auditoria ANTES de revelar (transparência = controle).
    const ok = window.confirm(
      "Revelar a credencial Gov.br será REGISTRADO no log de auditoria (quem revelou e quando). Deseja continuar?"
    );
    if (!ok) return;
    setRevealing(true);
    // Cada clique = uma chamada = uma linha no log (sem prefetch, sem auto-revelar).
    const { data, error } = await govRpc<{ gov_usuario: string | null; gov_senha: string | null }[]>(
      "reveal_gov_credential", { p_client_id: client.id }
    );
    setRevealing(false);
    if (error) {
      if (error.code === "42501") toast.error("Sem permissão para revelar credenciais Gov.br.");
      else toast.error(`Não foi possível revelar: ${error.message}`);
      return;
    }
    const row = Array.isArray(data) ? data[0] : null;
    if (!row || (row.gov_usuario == null && row.gov_senha == null)) {
      toast.error("Nenhuma credencial cadastrada para este cliente.");
      return;
    }
    setRevealed({ usuario: row.gov_usuario ?? "—", senha: row.gov_senha ?? "—" });
    // Auto-ocultar (defesa extra); o valor não é persistido em lugar nenhum.
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setRevealed(null), 45000);
  }

  if (meta === undefined) return <TabLoading />;

  const hasCred = !!meta;
  const statusMeta = meta?.status_acesso
    ? (GOV_STATUS_META[meta.status_acesso] ?? { label: meta.status_acesso, cls: "n" })
    : null;

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {/* 1. Nível da conta (do cadastro) */}
      {profile && (
        <div className="cli-card lift">
          <div className="cli-sec-title">Conta Gov.br</div>
          <div className="cli-gov" style={{ color: profile.color }}>
            <span className="ring" />
            <span>Nível {profile.label}</span>
          </div>
          <p style={{ fontSize: 13, color: "var(--cli-muted)", marginTop: 14, fontWeight: 500 }}>
            Nível de verificação da conta Gov.br conforme informado no cadastro do cliente.
          </p>
        </div>
      )}

      {/* 2. Credencial custodiada */}
      <div className="cli-card lift">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <div className="cli-sec-title" style={{ marginBottom: 0 }}>Credencial custodiada</div>
          <span style={{ flex: 1 }} />
          <button className="cli-btn sm ghost" type="button" onClick={() => setShowForm(s => !s)}>
            {showForm ? "Fechar" : hasCred ? "✎ Editar" : "+ Cadastrar"}
          </button>
        </div>

        {!hasCred && !showForm && (
          <EmptyState icon="🔑" title="Nenhuma credencial Gov.br custodiada"
            hint="Cadastre usuário e senha (armazenados cifrados) com o consentimento do cliente." />
        )}

        {hasCred && (
          <>
            <InfoGrid>
              <InfoField label="Status de acesso"
                value={statusMeta ? <span className={`cli-chip ${statusMeta.cls}`}>{statusMeta.label}</span> : "—"} />
              <InfoField label="2FA"
                value={meta!.tem_2fa
                  ? <span className="cli-chip ok">2FA ativo</span>
                  : <span className="cli-chip n">Sem 2FA</span>} />
              <InfoField label="Consentimento" value={
                meta!.consentimento_registrado
                  ? `Registrado${meta!.consentimento_em ? " em " + formatDateBR(meta!.consentimento_em) : ""}${meta!.consentimento_versao ? " · termo " + meta!.consentimento_versao : ""}`
                  : "Não registrado"} />
            </InfoGrid>

            {/* Revelação auditada */}
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1.5px solid var(--cli-cream-line)" }}>
              {revealed ? (
                <div style={{ display: "grid", gap: 10 }}>
                  <InfoGrid>
                    <InfoField label="Usuário Gov.br" value={<Reveal value={revealed.usuario} />} />
                    <InfoField label="Senha Gov.br" value={<Reveal value={revealed.senha} />} />
                  </InfoGrid>
                  <div>
                    <button className="cli-btn sm ghost" type="button" onClick={clearReveal}>Ocultar</button>
                    <span style={{ fontSize: 12, color: "var(--cli-muted)", marginLeft: 12, fontWeight: 600 }}>
                      Oculta automaticamente. Esta revelação foi registrada no log de auditoria.
                    </span>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <button className="cli-btn sm" type="button" disabled={revealing} onClick={() => void handleReveal()}>
                    {revealing ? "Revelando…" : "🔓 Revelar credencial"}
                  </button>
                  <span style={{ fontSize: 12, color: "var(--cli-muted)", fontWeight: 600 }}>
                    Revelar a senha <strong>fica registrado</strong> no log de auditoria (quem e quando).
                  </span>
                </div>
              )}
            </div>
          </>
        )}

        {showForm && (
          <GovCredForm client={client} hasCred={hasCred}
            onSaved={async () => { setShowForm(false); clearReveal(); await load(); }} />
        )}
      </div>
    </div>
  );
}

/** Formulário de cadastro/edição da credencial Gov.br (via save_gov_credential).
    Consentimento é obrigatório; senha/usuário em branco na edição PRESERVAM o
    valor guardado (o back faz isso). Não há campo de seed TOTP — apenas a flag
    tem_2fa. A senha digitada é descartada do estado logo após o envio. */
function GovCredForm({ client, hasCred, onSaved }: {
  client: ClientFull; hasCred: boolean; onSaved: () => Promise<void>;
}) {
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [tem2fa, setTem2fa] = useState(false);
  const [status, setStatus] = useState("pendente");
  const [consent, setConsent] = useState(false);
  const [saving, setSaving] = useState(false);

  // Novo cadastro exige usuário+senha; na edição, em branco preserva o guardado.
  const canSave = consent && (hasCred || (usuario.trim() !== "" && senha !== "")) && !saving;

  async function handleSave() {
    setSaving(true);
    const { error } = await govRpc<string>("save_gov_credential", {
      p_client_id: client.id,
      p_usuario: usuario.trim() || null,
      p_senha: senha || null,            // senha não sofre trim
      p_tem_2fa: tem2fa,
      p_status_acesso: status,
      p_consentimento: consent,
      p_consentimento_versao: GOV_CONSENT_VERSION,
    });
    setSenha("");                        // nunca reter a senha digitada após o envio
    setSaving(false);
    if (error) {
      if (error.code === "42501") toast.error("Sem permissão para gravar credenciais Gov.br.");
      else if (error.code === "23514") toast.error("Consentimento é obrigatório para gravar a credencial.");
      else toast.error(`Erro ao salvar: ${error.message}`);
      return;
    }
    toast.success("Credencial Gov.br salva");
    setUsuario("");
    await onSaved();
  }

  return (
    <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1.5px solid var(--cli-cream-line)", display: "grid", gap: 12 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <div style={{ flex: "1 1 220px" }}>
          <label className="cli-label">Usuário Gov.br (CPF/login)</label>
          <input className="cli-input" value={usuario} autoComplete="off"
            onChange={e => setUsuario(e.target.value)} />
        </div>
        <div style={{ flex: "1 1 220px" }}>
          <label className="cli-label">Senha Gov.br</label>
          <input className="cli-input" type="password" value={senha} autoComplete="new-password"
            placeholder={hasCred ? "deixe em branco para manter a senha atual" : ""}
            onChange={e => setSenha(e.target.value)} />
        </div>
        <div style={{ flex: "0 1 170px" }}>
          <label className="cli-label">Status de acesso</label>
          <select className="cli-select" value={status} onChange={e => setStatus(e.target.value)}>
            {GOV_STATUS_OPTIONS.map(s => <option key={s} value={s}>{GOV_STATUS_META[s]?.label ?? s}</option>)}
          </select>
        </div>
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, color: "var(--cli-ink)" }}>
        <input type="checkbox" checked={tem2fa} onChange={e => setTem2fa(e.target.checked)} />
        Conta possui 2FA ativo (o cliente informa o código na hora — a chave TOTP não é armazenada)
      </label>

      <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, fontWeight: 600, color: "var(--cli-ink)" }}>
        <input type="checkbox" checked={consent} style={{ marginTop: 3 }}
          onChange={e => setConsent(e.target.checked)} />
        <span>O cliente <strong>consente</strong> com a custódia segura da credencial Gov.br (termo v{GOV_CONSENT_VERSION}). Obrigatório para salvar.</span>
      </label>

      <div>
        <button className="cli-btn sm" type="button" disabled={!canSave} onClick={() => void handleSave()}>
          {saving ? "Salvando…" : "Salvar credencial"}
        </button>
        {!consent && (
          <span style={{ fontSize: 12, color: "var(--cli-muted)", marginLeft: 12, fontWeight: 600 }}>
            Marque o consentimento para habilitar.
          </span>
        )}
      </div>
    </div>
  );
}

/* ---------- Contatos ---------- */

export function ContatosTab({ client }: { client: ClientFull }) {
  const hasAny = client.email || client.phone || client.phone_commercial || client.phone_home;
  if (!hasAny) return <EmptyState icon="✉" title="Nenhum contato cadastrado" />;
  return (
    <div className="cli-card lift">
      <div className="cli-sec-title">Contatos</div>
      <InfoGrid>
        <InfoField label="Email" value={client.email} />
        <InfoField label="Celular" value={client.phone} protect={{ revealLast: 2 }} badge={client.phone_is_whatsapp ? <WhatsAppBadge /> : undefined} />
        <InfoField label="Telefone Comercial" value={client.phone_commercial} protect={{ revealLast: 2 }} badge={client.phone_commercial_is_whatsapp ? <WhatsAppBadge /> : undefined} />
        <InfoField label="Telefone Residencial" value={client.phone_home} protect={{ revealLast: 2 }} badge={client.phone_home_is_whatsapp ? <WhatsAppBadge /> : undefined} />
      </InfoGrid>
    </div>
  );
}

/* ---------- Endereço ---------- */

export function EnderecoTab({ client }: { client: ClientFull }) {
  const hasAny = client.zip_code || client.address || client.city || client.neighborhood;
  if (!hasAny) return <EmptyState icon="⌖" title="Nenhum endereço cadastrado" />;
  return (
    <div className="cli-card lift">
      <div className="cli-sec-title">Endereço</div>
      <InfoGrid>
        <InfoField label="CEP" value={client.zip_code} />
        <InfoField label="Logradouro" value={client.address} />
        <InfoField label="Número" value={client.address_number} />
        <InfoField label="Complemento" value={client.address_complement} />
        <InfoField label="Bairro" value={client.neighborhood} />
        <InfoField label="Cidade" value={client.city} />
        <InfoField label="Estado" value={client.state} />
        <InfoField label="País" value={client.country} />
      </InfoGrid>
    </div>
  );
}

/* ---------- Observações ---------- */

export function ObservacoesTab({ client }: { client: ClientFull }) {
  if (!client.notes) return <EmptyState icon="✎" title="Nenhuma observação registrada" />;
  return (
    <div className="cli-card lift">
      <div className="cli-sec-title">Observações</div>
      <div className="cli-notes">{client.notes}</div>
    </div>
  );
}
