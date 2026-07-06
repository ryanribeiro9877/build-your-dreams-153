import type React from "react";
import { useNavigate } from "react-router-dom";

/* ============================================================
   Clientes — módulo compartilhado (layout 3.1)
   Estilos, projeções de colunas (R-2), tipos e componentes
   reutilizados pelas telas separadas de Clientes:
   Listagem · Detalhe (abas) · Edição · Novo.
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
  "zip_code", "address", "address_number", "address_complement",
  "neighborhood", "city", "state", "country",
  "bank_name", "bank_agency", "bank_account", "bank_account_type",
  "pix_key", "pix_key_type",
  "notes", "created_at",
].join(", ");

/* ---------- Tipos ---------- */

// Linha resumida da listagem (alinhada a CLIENT_LIST_COLUMNS).
export interface ClientListRow {
  id: string;
  full_name: string;
  status: string;
  tipo_pessoa: string;
  city: string | null;
  state: string | null;
  created_at: string;
}

// Registro completo do detalhe/edição (alinhado a CLIENT_FULL_COLUMNS).
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

// Formulário (todas as chaves como string — mesmo shape do EMPTY_FORM).
export type ClientFormValues = {
  tipo_pessoa: string; status: string;
  full_name: string; fantasy_name: string; cpf: string; cnpj: string;
  rg: string; rg_issuer: string; rg_uf: string; ie: string; im: string;
  birth_date: string; foundation_date: string; gender: string; marital_status: string;
  nationality: string; natural_city: string; natural_uf: string;
  mother_name: string; father_name: string; profession: string; pis_nit: string;
  legal_rep_name: string; legal_rep_cpf: string;
  email: string; phone: string; phone_commercial: string; phone_home: string;
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

export const ALLOWED_ROLES = ["socio", "lider_recepcao", "recepcionista"];

export const STATES = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];

export const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  rg: "RG", cpf: "CPF", comprovante_residencia: "Comprovante de Residência",
  extrato_conta: "Extrato Bancário", extrato_ir: "Extrato de Imposto de Renda",
  extrato_inss: "Extrato INSS", cnis: "CNIS", procuracao: "Procuração",
  contrato: "Contrato", certidao: "Certidão", outro: "Outro",
};

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

/* ---------- Estilos (design system existente — inline + CSS vars) ---------- */

export const pageStyle: React.CSSProperties = {
  minHeight: "100vh", background: "var(--bg)", color: "var(--text1)",
  fontFamily: "'Roboto', sans-serif", padding: 20,
};

export const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 14px", borderRadius: 12,
  background: "#0a0a12", border: "1px solid rgba(201,168,76,0.2)", color: "#f5f5f5",
  fontSize: 13, fontFamily: "'DM Sans', sans-serif", outline: "none", boxSizing: "border-box",
  boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
  transition: "border-color 0.3s ease, box-shadow 0.3s ease, transform 0.15s ease",
};

export const selectStyle: React.CSSProperties = {
  ...inputStyle,
  color: "#c9a84c",
  cursor: "pointer",
  appearance: "none" as const,
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23c9a84c' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 12px center",
  paddingRight: "36px",
};

export const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 10, color: "var(--text3)", marginBottom: 4,
  textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600,
};

export const secTitle: React.CSSProperties = {
  gridColumn: "1 / -1", fontSize: 11, fontWeight: 700, color: "var(--gold, #c9a84c)",
  textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 10, marginBottom: -2,
  borderBottom: "1px solid var(--border)", paddingBottom: 4,
};

export const sectionStyle: React.CSSProperties = {
  background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 12,
  padding: 20, marginBottom: 16,
};

export const goldButtonStyle: React.CSSProperties = {
  padding: "10px 20px", borderRadius: 10, border: "none", cursor: "pointer",
  background: "linear-gradient(135deg, #c9a84c, #e8c96a)", color: "#0a0a12",
  fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans', sans-serif",
  boxShadow: "0 4px 12px rgba(201,168,76,0.3)",
  transition: "transform 0.2s ease, box-shadow 0.2s ease",
};

export const ghostButtonStyle: React.CSSProperties = {
  padding: "8px 16px", borderRadius: 8, border: "1px solid var(--border)",
  background: "var(--bg2)", color: "var(--text2)", cursor: "pointer", fontSize: 13,
  fontFamily: "'DM Sans', sans-serif",
};

export function statusBadgeStyle(status: string): React.CSSProperties {
  const map: Record<string, { bg: string; color: string }> = {
    ativo: { bg: "rgba(45,212,160,0.15)", color: "#2dd4a0" },
    em_analise: { bg: "rgba(251,191,36,0.15)", color: "#fbbf24" },
    prospecto: { bg: "rgba(59,130,246,0.15)", color: "#3b82f6" },
    inativo: { bg: "rgba(239,68,68,0.15)", color: "#ef4444" },
  };
  const c = map[status] ?? { bg: "rgba(107,114,128,0.15)", color: "#9ca3af" };
  return {
    padding: "2px 10px", borderRadius: 6, fontSize: 10, fontWeight: 700,
    background: c.bg, color: c.color, textTransform: "uppercase", letterSpacing: "0.04em",
  };
}

/* ---------- Componentes reutilizados ---------- */

/** Campo rótulo/valor em modo leitura. */
export function InfoField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <span style={{ fontSize: 10, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</span>
      <div style={{ color: "var(--text1)", fontWeight: 500, fontSize: 13, marginTop: 2, wordBreak: "break-word" }}>
        {value === null || value === undefined || value === "" ? <span style={{ color: "var(--text3)" }}>—</span> : value}
      </div>
    </div>
  );
}

/** Grade padrão de campos em modo leitura. */
export function InfoGrid({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14 }}>
      {children}
    </div>
  );
}

/** Empty-state honesto (§2/§3) — nunca dado fabricado. */
export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      gap: 6, padding: "48px 20px", textAlign: "center",
    }}>
      <div style={{ fontSize: 13, color: "var(--text2)", fontWeight: 500 }}>{title}</div>
      {hint && <div style={{ fontSize: 11, color: "var(--text3)", maxWidth: 360 }}>{hint}</div>}
    </div>
  );
}

/** Loader inline curto para carga lazy de aba. */
export function TabLoading() {
  return (
    <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--text3)", fontSize: 12 }}>
      Carregando…
    </div>
  );
}

/** Tela de acesso restrito (recepção/sócio) — herda a RLS, não a contorna. */
export function RestrictedAccess() {
  const navigate = useNavigate();
  return (
    <div style={{
      minHeight: "100vh", background: "var(--bg)", color: "var(--text1)",
      fontFamily: "'Roboto', sans-serif", padding: 40,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16,
    }}>
      <div style={{ fontSize: 48 }}>🔒</div>
      <h1 style={{ fontSize: 22, fontWeight: 600, color: "var(--gold, #c9a84c)" }}>Acesso restrito</h1>
      <p style={{ color: "var(--text3)", fontSize: 13, textAlign: "center", maxWidth: 400 }}>
        A gestão de clientes é exclusiva da <strong>Recepção</strong>.
      </p>
      <button className="btn-voltar" onClick={() => navigate("/sistema")} style={ghostButtonStyle}>
        ← Voltar ao Sistema
      </button>
    </div>
  );
}
