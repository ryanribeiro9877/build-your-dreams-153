import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  type ClientFull, InfoField, InfoGrid, EmptyState, statusBadgeStyle,
  formatDateBR, sectionStyle,
} from "../shared";

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
  ouro: { label: "Ouro", color: "#e8c96a" },
  prata: { label: "Prata", color: "#c4c4d4" },
  bronze: { label: "Bronze", color: "#cd7f32" },
};

const subTitle: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: "var(--gold, #c9a84c)",
  textTransform: "uppercase", letterSpacing: "0.08em",
  borderBottom: "1px solid var(--border)", paddingBottom: 6, marginBottom: 12, marginTop: 4,
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
    { label: "Documentos", value: counts?.docs },
    { label: "Tarefas abertas", value: counts?.openTasks },
    { label: "Sessões (IA)", value: counts?.sessions },
  ];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        <div style={{ fontSize: 18, fontWeight: 600, color: "var(--text1)" }}>{client.full_name}</div>
        <span style={statusBadgeStyle(client.status)}>{client.status}</span>
        <span style={{ fontSize: 11, color: "var(--text3)" }}>
          {client.tipo_pessoa === "juridica" ? "Pessoa Jurídica" : "Pessoa Física"}
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
        {kpis.map(k => (
          <div key={k.label} style={{ ...sectionStyle, marginBottom: 0, textAlign: "center" }}>
            <div style={{ fontSize: 26, fontWeight: 700, color: "var(--text1)" }}>
              {k.value === undefined ? "…" : k.value}
            </div>
            <div style={{ fontSize: 11, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{k.label}</div>
          </div>
        ))}
      </div>

      <div style={subTitle}>Contatos principais</div>
      <InfoGrid>
        <InfoField label="Email" value={client.email} />
        <InfoField label="Celular" value={client.phone} />
        <InfoField label="Cidade" value={client.city ? `${client.city}${client.state ? "/" + client.state : ""}` : null} />
        <InfoField label="Cadastrado em" value={formatDateBR(client.created_at)} />
      </InfoGrid>
    </div>
  );
}

/* ---------- Dados pessoais ---------- */

export function DadosPessoaisTab({ client }: { client: ClientFull }) {
  const isPJ = client.tipo_pessoa === "juridica";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <div style={subTitle}>{isPJ ? "Dados da Empresa" : "Identificação"}</div>
        <InfoGrid>
          <InfoField label={isPJ ? "Razão Social" : "Nome Completo"} value={client.full_name} />
          {isPJ && <InfoField label="Nome Fantasia" value={client.fantasy_name} />}
          <InfoField label="Tipo de Pessoa" value={isPJ ? "Pessoa Jurídica" : "Pessoa Física"} />
          <InfoField label="Situação" value={client.status} />
          {isPJ ? (
            <>
              <InfoField label="CNPJ" value={client.cnpj} />
              <InfoField label="Inscrição Estadual" value={client.ie} />
              <InfoField label="Inscrição Municipal" value={client.im} />
              <InfoField label="Data de Fundação" value={client.foundation_date ? formatDateBR(client.foundation_date) : null} />
              <InfoField label="Representante Legal" value={client.legal_rep_name} />
              <InfoField label="CPF do Representante" value={client.legal_rep_cpf} />
            </>
          ) : (
            <>
              <InfoField label="CPF" value={client.cpf} />
              <InfoField label="RG" value={client.rg} />
              <InfoField label="Órgão Emissor" value={client.rg_issuer} />
              <InfoField label="UF do RG" value={client.rg_uf} />
              <InfoField label="Data de Nascimento" value={client.birth_date ? formatDateBR(client.birth_date) : null} />
              <InfoField label="Sexo" value={client.gender ? (GENDER_LABELS[client.gender] ?? client.gender) : null} />
              <InfoField label="Estado Civil" value={client.marital_status ? (MARITAL_LABELS[client.marital_status] ?? client.marital_status) : null} />
              <InfoField label="Nacionalidade" value={client.nationality} />
              <InfoField label="Naturalidade" value={client.natural_city ? `${client.natural_city}${client.natural_uf ? "/" + client.natural_uf : ""}` : null} />
              <InfoField label="Profissão" value={client.profession} />
              <InfoField label="PIS / NIT" value={client.pis_nit} />
            </>
          )}
          <InfoField label="Origem / Captação" value={client.client_origin ? (ORIGIN_LABELS[client.client_origin] ?? client.client_origin) : null} />
        </InfoGrid>
      </div>

      {!isPJ && (
        <div>
          <div style={subTitle}>Filiação</div>
          <InfoGrid>
            <InfoField label="Nome da Mãe" value={client.mother_name} />
            <InfoField label="Nome do Pai" value={client.father_name} />
          </InfoGrid>
        </div>
      )}

      <div>
        <div style={subTitle}>Dados Bancários / PIX</div>
        <InfoGrid>
          <InfoField label="Banco" value={client.bank_name} />
          <InfoField label="Agência" value={client.bank_agency} />
          <InfoField label="Conta" value={client.bank_account} />
          <InfoField label="Tipo de Conta" value={client.bank_account_type === "poupanca" ? "Poupança" : client.bank_account_type ? "Corrente" : null} />
          <InfoField label="Chave PIX" value={client.pix_key} />
          <InfoField label="Tipo da Chave" value={client.pix_key_type} />
        </InfoGrid>
      </div>
    </div>
  );
}

/* ---------- Gov.br ---------- */

export function GovBrTab({ client }: { client: ClientFull }) {
  if (!client.gov_br_profile) {
    return <EmptyState title="Perfil Gov.br não informado" hint="O nível da conta Gov.br do cliente não foi registrado no cadastro." />;
  }
  const g = GOVBR_LABELS[client.gov_br_profile] ?? { label: client.gov_br_profile, color: "var(--text1)" };
  return (
    <div>
      <div style={subTitle}>Conta Gov.br</div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{
          padding: "10px 20px", borderRadius: 10, border: `1px solid ${g.color}`,
          color: g.color, fontWeight: 700, fontSize: 15, letterSpacing: "0.04em",
          background: "var(--bg)",
        }}>
          Nível {g.label}
        </div>
      </div>
      <p style={{ fontSize: 11, color: "var(--text3)", marginTop: 12, maxWidth: 460 }}>
        Nível de verificação da conta Gov.br conforme informado no cadastro do cliente.
      </p>
    </div>
  );
}

/* ---------- Contatos ---------- */

export function ContatosTab({ client }: { client: ClientFull }) {
  const hasAny = client.email || client.phone || client.phone_commercial || client.phone_home;
  if (!hasAny) return <EmptyState title="Nenhum contato cadastrado" />;
  return (
    <div>
      <div style={subTitle}>Contatos</div>
      <InfoGrid>
        <InfoField label="Email" value={client.email} />
        <InfoField label="Celular" value={client.phone} />
        <InfoField label="Telefone Comercial" value={client.phone_commercial} />
        <InfoField label="Telefone Residencial" value={client.phone_home} />
      </InfoGrid>
    </div>
  );
}

/* ---------- Endereço ---------- */

export function EnderecoTab({ client }: { client: ClientFull }) {
  const hasAny = client.zip_code || client.address || client.city || client.neighborhood;
  if (!hasAny) return <EmptyState title="Nenhum endereço cadastrado" />;
  return (
    <div>
      <div style={subTitle}>Endereço</div>
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
  if (!client.notes) return <EmptyState title="Nenhuma observação registrada" />;
  return (
    <div>
      <div style={subTitle}>Observações</div>
      <div style={{
        padding: 14, background: "var(--bg)", borderRadius: 8, fontSize: 13,
        color: "var(--text2)", whiteSpace: "pre-wrap", lineHeight: 1.5,
      }}>
        {client.notes}
      </div>
    </div>
  );
}
