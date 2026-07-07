import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  type ClientFull, InfoField, InfoGrid, EmptyState, formatDateBR, StatusChips,
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
        <div className="cli-sec-title">Status</div>
        <StatusChips client={client} />
      </div>
      <div className="cli-card lift">
        <div className="cli-sec-title">Contatos principais</div>
        <InfoGrid>
          <InfoField label="Email" value={client.email} />
          <InfoField label="Celular" value={client.phone} protect={{ revealLast: 2 }} />
          <InfoField label="Cidade" value={client.city ? `${client.city}${client.state ? " / " + client.state : ""}` : null} />
          <InfoField label="Cadastrado em" value={formatDateBR(client.created_at)} />
        </InfoGrid>
      </div>
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

/* ---------- Gov.br ---------- */

export function GovBrTab({ client }: { client: ClientFull }) {
  if (!client.gov_br_profile) {
    return <EmptyState icon="🪪" title="Perfil Gov.br não informado" hint="O nível da conta Gov.br do cliente não foi registrado no cadastro." />;
  }
  const g = GOVBR_LABELS[client.gov_br_profile] ?? { label: client.gov_br_profile, color: "#0B0A06" };
  return (
    <div className="cli-card lift">
      <div className="cli-sec-title">Conta Gov.br</div>
      <div className="cli-gov" style={{ color: g.color }}>
        <span className="ring" />
        <span>Nível {g.label}</span>
      </div>
      <p style={{ fontSize: 13, color: "var(--cli-muted)", marginTop: 14, fontWeight: 500 }}>
        Nível de verificação da conta Gov.br conforme informado no cadastro do cliente.
      </p>
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
        <InfoField label="Celular" value={client.phone} protect={{ revealLast: 2 }} />
        <InfoField label="Telefone Comercial" value={client.phone_commercial} protect={{ revealLast: 2 }} />
        <InfoField label="Telefone Residencial" value={client.phone_home} protect={{ revealLast: 2 }} />
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
