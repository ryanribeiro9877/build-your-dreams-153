import { useState } from "react";
import type React from "react";
import { useNavigate } from "react-router-dom";

/* ============================================================
   Clientes — módulo compartilhado (layout 3.1)
   Projeções de colunas (R-2), tipos, formatadores e os
   componentes de UI da identidade "neo-brutalista" (ver
   src/styles/clientes.css, tudo escopado sob `.cli-root`).
============================================================ */

/* ---------- R-2: projeções explícitas de colunas ----------
   NUNCA usar select("*") em `clients`. Cada tela projeta só o
   que exibe; PII (CPF/RG/filiação/financeiro) é lida pela view
   decifrada `clients_decrypted`, nunca pelas colunas cifradas.  */

// Listagem: colunas mínimas — sem PII financeira/filiação/documento
// no payload da lista (R-2 minimização). Busca por CPF é exata via RPC.
export const CLIENT_LIST_COLUMNS =
  "id, full_name, status, tipo_pessoa, city, state, created_at";

// Detalhe/Edição: projeção completa dos campos DO CADASTRO (§4 — todo
// campo cadastrado aparece em alguma aba). Lida de `clients_decrypted`.
// Omissões deliberadas: `created_by`/`updated_at` (auditoria interna) e
// `responsible_lawyer_id` (FK interna — exigiria join em profiles, fora
// do escopo FE-only deste card).
export const CLIENT_FULL_COLUMNS = [
  "id", "full_name", "fantasy_name", "tipo_pessoa", "status",
  "cpf", "cnpj", "rg", "rg_issuer", "rg_uf", "ie", "im",
  "birth_date", "foundation_date", "gender", "marital_status",
  "nationality", "natural_city", "natural_uf", "profession", "pis_nit",
  "mother_name", "father_name", "legal_rep_name", "legal_rep_cpf",
  "client_origin", "gov_br_profile",
  "email", "phone", "phone_commercial", "phone_home",
  "phone_is_whatsapp", "phone_commercial_is_whatsapp", "phone_home_is_whatsapp",
  "zip_code", "address", "address_number", "address_complement",
  "neighborhood", "city", "state", "country",
  "bank_name", "bank_agency", "bank_account", "bank_account_type",
  "pix_key", "pix_key_type",
  "notes", "created_at",
].join(", ");

/* ---------- Tipos ---------- */

export interface ClientListRow {
  id: string;
  full_name: string;
  status: string;
  tipo_pessoa: string;
  city: string | null;
  state: string | null;
  created_at: string;
}

// Card 3.9 — linha retornada por search_clients (note: sem tipo_pessoa).
export interface SearchClientRow {
  id: string;
  full_name: string;
  status: string;
  client_origin: string | null;
  city: string | null;
  state: string | null;
  gov_br_profile: string | null;
  created_at: string;
}

// Opções de dropdown reutilizadas nos filtros (3.9). Espelham o cadastro.
export const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "ativo", label: "Ativo" },
  { value: "inativo", label: "Inativo" },
  { value: "prospecto", label: "Prospecto" },
  { value: "em_analise", label: "Em análise" },
];

export const ORIGEM_OPTIONS: { value: string; label: string }[] = [
  { value: "indicacao", label: "Indicação" },
  { value: "ressaque", label: "Ressaque" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "marketing", label: "Marketing" },
  { value: "site", label: "Site" },
  { value: "outro", label: "Outro" },
];

export const TIPO_PESSOA_OPTIONS: { value: string; label: string }[] = [
  { value: "fisica", label: "Pessoa física" },
  { value: "juridica", label: "Pessoa jurídica" },
];

export interface ClientFull {
  id: string;
  full_name: string;
  fantasy_name: string | null;
  tipo_pessoa: string;
  status: string;
  cpf: string | null;
  cnpj: string | null;
  rg: string | null;
  rg_issuer: string | null;
  rg_uf: string | null;
  ie: string | null;
  im: string | null;
  birth_date: string | null;
  foundation_date: string | null;
  gender: string | null;
  marital_status: string | null;
  nationality: string | null;
  natural_city: string | null;
  natural_uf: string | null;
  profession: string | null;
  pis_nit: string | null;
  mother_name: string | null;
  father_name: string | null;
  legal_rep_name: string | null;
  legal_rep_cpf: string | null;
  client_origin: string | null;
  gov_br_profile: string | null;
  email: string | null;
  phone: string | null;
  phone_commercial: string | null;
  phone_home: string | null;
  phone_is_whatsapp: boolean | null;
  phone_commercial_is_whatsapp: boolean | null;
  phone_home_is_whatsapp: boolean | null;
  zip_code: string | null;
  address: string | null;
  address_number: string | null;
  address_complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  bank_name: string | null;
  bank_agency: string | null;
  bank_account: string | null;
  bank_account_type: string | null;
  pix_key: string | null;
  pix_key_type: string | null;
  notes: string | null;
  created_at: string;
}

export type ClientFormValues = {
  tipo_pessoa: string; status: string;
  full_name: string; fantasy_name: string; cpf: string; cnpj: string;
  rg: string; rg_issuer: string; rg_uf: string; ie: string; im: string;
  birth_date: string; foundation_date: string; gender: string; marital_status: string;
  nationality: string; natural_city: string; natural_uf: string;
  mother_name: string; father_name: string; profession: string; pis_nit: string;
  legal_rep_name: string; legal_rep_cpf: string;
  email: string; phone: string; phone_commercial: string; phone_home: string;
  phone_is_whatsapp: boolean; phone_commercial_is_whatsapp: boolean; phone_home_is_whatsapp: boolean;
  zip_code: string; address: string; address_number: string; address_complement: string;
  neighborhood: string; city: string; state: string; country: string;
  bank_name: string; bank_agency: string; bank_account: string; bank_account_type: string;
  pix_key: string; pix_key_type: string;
  client_origin: string; gov_br_profile: string; notes: string;
};

export const EMPTY_FORM: ClientFormValues = {
  tipo_pessoa: "fisica", status: "ativo",
  full_name: "", fantasy_name: "", cpf: "", cnpj: "", rg: "", rg_issuer: "", rg_uf: "BA",
  ie: "", im: "", birth_date: "", foundation_date: "", gender: "masculino", marital_status: "solteiro",
  nationality: "BRASILEIRA", natural_city: "", natural_uf: "BA", mother_name: "", father_name: "",
  profession: "", pis_nit: "", legal_rep_name: "", legal_rep_cpf: "",
  email: "", phone: "", phone_commercial: "", phone_home: "",
  phone_is_whatsapp: false, phone_commercial_is_whatsapp: false, phone_home_is_whatsapp: false,
  zip_code: "", address: "", address_number: "", address_complement: "", neighborhood: "",
  city: "", state: "BA", country: "BRASIL",
  bank_name: "", bank_agency: "", bank_account: "", bank_account_type: "corrente", pix_key: "", pix_key_type: "cpf",
  client_origin: "indicacao", gov_br_profile: "ouro", notes: "",
};

/** Preenche o form a partir de um registro decifrado (para edição). */
export function formValuesFromClient(c: ClientFull): ClientFormValues {
  const s = (v: string | null | undefined) => v ?? "";
  return {
    tipo_pessoa: s(c.tipo_pessoa) || "fisica",
    status: s(c.status) || "ativo",
    full_name: s(c.full_name),
    fantasy_name: s(c.fantasy_name),
    cpf: s(c.cpf), cnpj: s(c.cnpj),
    rg: s(c.rg), rg_issuer: s(c.rg_issuer), rg_uf: s(c.rg_uf) || "BA",
    ie: s(c.ie), im: s(c.im),
    birth_date: s(c.birth_date), foundation_date: s(c.foundation_date),
    gender: s(c.gender) || "masculino", marital_status: s(c.marital_status) || "solteiro",
    nationality: s(c.nationality) || "BRASILEIRA",
    natural_city: s(c.natural_city), natural_uf: s(c.natural_uf) || "BA",
    mother_name: s(c.mother_name), father_name: s(c.father_name),
    profession: s(c.profession), pis_nit: s(c.pis_nit),
    legal_rep_name: s(c.legal_rep_name), legal_rep_cpf: s(c.legal_rep_cpf),
    email: s(c.email), phone: s(c.phone),
    phone_commercial: s(c.phone_commercial), phone_home: s(c.phone_home),
    phone_is_whatsapp: !!c.phone_is_whatsapp,
    phone_commercial_is_whatsapp: !!c.phone_commercial_is_whatsapp,
    phone_home_is_whatsapp: !!c.phone_home_is_whatsapp,
    zip_code: s(c.zip_code), address: s(c.address), address_number: s(c.address_number),
    address_complement: s(c.address_complement), neighborhood: s(c.neighborhood),
    city: s(c.city), state: s(c.state) || "BA", country: s(c.country) || "BRASIL",
    bank_name: s(c.bank_name), bank_agency: s(c.bank_agency),
    bank_account: s(c.bank_account), bank_account_type: s(c.bank_account_type) || "corrente",
    pix_key: s(c.pix_key), pix_key_type: s(c.pix_key_type) || "cpf",
    client_origin: s(c.client_origin) || "indicacao",
    gov_br_profile: s(c.gov_br_profile) || "ouro",
    notes: s(c.notes),
  };
}

/* ---------- Constantes ---------- */

// DEF-2 (15/07/2026): o gate de acesso a Clientes NÃO mora mais aqui. As telas
// de /clientes usam `usePermissions().canAccessClients` (userRole "receptionist"),
// a MESMA fonte de verdade do menu — Clientes é EXCLUSIVO da recepção, sem
// isenção de sócio/admin/diretor por URL direta. A antiga ALLOWED_ROLES
// (que incluía "socio") foi removida para não reintroduzir a isenção.

export const STATES = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];

export const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  rg: "RG", cpf: "CPF", comprovante: "Comprovante",
  comprovante_residencia: "Comprovante de Residência",
  extrato_conta: "Extrato Bancário", extrato_ir: "Extrato de Imposto de Renda",
  extrato_inss: "Extrato INSS", cnis: "CNIS", procuracao: "Procuração",
  contrato: "Contrato", termo_cooperado: "Termo de Cooperado",
  certidao: "Certidão", outro: "Outro",
  audio_atendimento: "Áudio do atendimento",
  resumo_atendimento: "Resumo do atendimento",
};

// Tipos oferecidos no upload da aba Documentos (vocabulário canônico do card 3.6).
// O CHECK no banco aceita um superset (inclui os tipos legados do cadastro).
export const DOCUMENT_TYPE_OPTIONS: { value: string; label: string }[] = [
  "rg", "cpf", "comprovante", "procuracao", "contrato", "termo_cooperado", "outro",
].map(v => ({ value: v, label: DOCUMENT_TYPE_LABELS[v] ?? v }));

// Status do documento (3.6) — badge com classe de cor no estilo .cli-chip.
export const DOC_STATUS_META: Record<string, { label: string; cls: string }> = {
  pendente: { label: "Pendente", cls: "p" },
  recebido: { label: "Recebido", cls: "n" },
  validado: { label: "Validado", cls: "ok" },
  rejeitado: { label: "Rejeitado", cls: "d" },
};

export const DOC_ORIGEM_LABELS: Record<string, string> = {
  cliente: "Cliente", recepcao: "Recepção", advogado: "Advogado",
  sistema: "Sistema", import: "Importação", ocr: "OCR",
};

// Origens escolhíveis no upload manual (default recepção).
export const DOC_ORIGEM_OPTIONS: { value: string; label: string }[] =
  ["recepcao", "cliente", "advogado"].map(v => ({ value: v, label: DOC_ORIGEM_LABELS[v] }));

/* ---------- Formatadores (máscaras) ---------- */

export const toUpper = (v: string) => v.toUpperCase();

export function formatCPF(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0,3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6)}`;
  return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
}

export function formatRG(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 9);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0,2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5)}`;
  return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}-${d.slice(8)}`;
}

export function formatCEP(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0,5)}-${d.slice(5)}`;
}

export function formatPhone(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d.length > 0 ? `(${d}` : "";
  if (d.length <= 7) return `(${d.slice(0,2)}) ${d.slice(2)}`;
  return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
}

export function formatCNPJ(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0,2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8)}`;
  return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`;
}

/* ---------- Validadores (dígitos verificadores, e-mail) ----------
   Fonte única: usados pelo cadastro (wizard) e por qualquer tela que
   precise validar. Anti-alucinação — nunca "consertam" o dado, só dizem
   se é válido. Um valor VAZIO é considerado válido (obrigatoriedade é
   checada à parte) para não travar campos opcionais. */

export function isValidCPF(value: string): boolean {
  const d = (value || "").replace(/\D/g, "");
  if (d === "") return true; // vazio: obrigatoriedade é responsabilidade de quem chama
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}

export function isValidCNPJ(value: string): boolean {
  const d = (value || "").replace(/\D/g, "");
  if (d === "") return true;
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const calc = (len: number) => {
    const weights = len === 12 ? [5,4,3,2,9,8,7,6,5,4,3,2] : [6,5,4,3,2,9,8,7,6,5,4,3,2];
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * weights[i];
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

export function isValidEmail(value: string): boolean {
  const v = (value || "").trim();
  if (v === "") return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

export function formatPixKey(value: string, type: string): string {
  const digits = value.replace(/\D/g, "");
  if (type === "cpf") {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{0,2})/, (_, a, b, c, d) => d ? `${a}.${b}.${c}-${d}` : digits.length > 6 ? `${a}.${b}.${c}` : digits.length > 3 ? `${a}.${b}` : a).slice(0, 14);
  }
  if (type === "cnpj") {
    return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2})/, (_, a, b, c, d, e) => e ? `${a}.${b}.${c}/${d}-${e}` : digits.length > 9 ? `${a}.${b}.${c}/${d}` : digits.length > 6 ? `${a}.${b}.${c}` : digits.length > 3 ? `${a}.${b}` : digits.length > 2 ? `${a}.${b}` : a).slice(0, 18);
  }
  if (type === "telefone") {
    return digits.replace(/(\d{2})(\d{5})(\d{0,4})/, (_, a, b, c) => c ? `(${a}) ${b}-${c}` : digits.length > 2 ? `(${a}) ${b}` : digits.length > 0 ? `(${a}` : "").slice(0, 15);
  }
  return value;
}

export function formatDateBR(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value.length <= 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("pt-BR");
}

/** Mascara caracteres alfanuméricos com •, preservando separadores.
    `revealLast` mantém os N últimos alfanuméricos visíveis. */
export function maskValue(value: string, revealLast = 0): string {
  const total = (value.match(/[A-Za-z0-9]/g) ?? []).length;
  const keepFrom = Math.max(0, total - revealLast);
  let i = 0;
  return value.replace(/[A-Za-z0-9]/g, (ch) => {
    const out = i < keepFrom ? "•" : ch;
    i += 1;
    return out;
  });
}

/* ---------- Componentes de UI ---------- */

const STATUS_BADGE_CLASS: Record<string, string> = {
  ativo: "is-ativo", inativo: "is-inativo", prospecto: "is-prospecto", em_analise: "is-em_analise",
};

/** Badge de status no estilo do mockup. */
export function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_BADGE_CLASS[status] ?? "is-neutral";
  return <span className={`cli-badge ${cls}`}>● {status}</span>;
}

/** Valor de PII: mascarado por padrão, clique revela ("protegido" → "visível").
    O valor decifrado já vem da view `clients_decrypted` (RLS); o mascaramento
    é proteção adicional contra shoulder-surfing. */
export function Reveal({ value, revealLast = 0 }: { value: string; revealLast?: number }) {
  const [shown, setShown] = useState(false);
  return (
    <button type="button" className="cli-reveal" onClick={() => setShown(s => !s)} aria-pressed={shown}>
      <span className="tag">{shown ? "visível" : "protegido"}</span>
      <span>{shown ? value : maskValue(value, revealLast)}</span>
    </button>
  );
}

/** Selo "WhatsApp" para telefones marcados (aba Contatos / Resumo). */
export function WhatsAppBadge() {
  return <span className="cli-wa-badge" title="Este número é WhatsApp">WhatsApp</span>;
}

/** Campo rótulo/valor. `protect` transforma o valor em PII mascarada.
    `badge` é renderizado ao lado do valor (ex.: selo de WhatsApp). */
export function InfoField({ label, value, protect, badge }: {
  label: string;
  value: React.ReactNode;
  protect?: { revealLast?: number };
  badge?: React.ReactNode;
}) {
  const empty = value === null || value === undefined || value === "";
  return (
    <div className="cli-field">
      <div className="k">{label}</div>
      <div className={`v${empty ? " empty" : ""}`}>
        {empty
          ? "—"
          : protect && typeof value === "string"
            ? <Reveal value={value} revealLast={protect.revealLast} />
            : value}
        {!empty && badge}
      </div>
    </div>
  );
}

export function InfoGrid({ children }: { children: React.ReactNode }) {
  return <div className="cli-fgrid">{children}</div>;
}

/** Empty-state honesto (§2/§3) — nunca dado fabricado. */
export function EmptyState({ icon = "∅", title, hint }: { icon?: string; title: string; hint?: string }) {
  return (
    <div className="cli-empty">
      <div className="e-ic">{icon}</div>
      <h3>{title}</h3>
      {hint && <p>{hint}</p>}
    </div>
  );
}

export function TabLoading() {
  return <div className="cli-loading">Carregando…</div>;
}

/** Tela de acesso restrito (recepção/sócio) — herda a RLS, não a contorna. */
export function RestrictedAccess() {
  const navigate = useNavigate();
  return (
    <div className="cli-root">
      <div className="cli-restricted">
        <div className="lock">🔒</div>
        <h1>Acesso restrito</h1>
        <p>A gestão de clientes é exclusiva da <strong>Recepção</strong>.</p>
        <button className="cli-btn ghost" onClick={() => navigate("/sistema")}>← Voltar ao Sistema</button>
      </div>
    </div>
  );
}
