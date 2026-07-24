// supabase/functions/gerar-kit-documental/cooperadoDocs.ts
//
// PORTE Deno (Onda 2.3) de src/lib/cooperadoDocs.ts — mapa DETERMINÍSTICO
// dado→placeholder dos 4 documentos do cooperado. IDÊNTICO ao do front (mesmos
// formatadores, mesmo superset de placeholders, mesmos templates) para que a
// geração pelo chat produza exatamente o mesmo documento que a geração pela tela.
// Única diferença: o import de fillDocxTemplate usa extensão .ts (regra Deno).
//
// PII: os valores DEVEM vir de um registro já DECIFRADO (view clients_decrypted).
// Este módulo não decifra nada; recebe o objeto decifrado pronto. O corpo jurídico
// vive no .docx e é IMUTÁVEL — nenhum LLM redige/reformula cláusula.

import { fillDocxTemplate, type FillDocxResult } from "./fillDocxTemplate.ts";

// Subconjunto DECIFRADO do cliente. Todos opcionais: o que faltar vira [A PREENCHER].
export interface CooperadoClientData {
  id: string;
  full_name?: string | null;
  cpf?: string | null;
  cnpj?: string | null;
  rg?: string | null;
  rg_issuer?: string | null;
  rg_uf?: string | null;
  nationality?: string | null;
  marital_status?: string | null;
  profession?: string | null;
  birth_date?: string | null;
  email?: string | null;
  phone?: string | null;
  zip_code?: string | null;
  address?: string | null;
  address_number?: string | null;
  address_complement?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
}

export type CooperadoDocType =
  | "procuracao"
  | "contrato_honorarios"
  | "declaracao_hipossuficiencia"
  | "termo_cooperado";

// ─── formatadores determinísticos ────────────────────────────────────────────

const onlyDigits = (v: string) => v.replace(/\D/g, "");

// CPF -> 000.000.000-00. Se não tiver 11 dígitos, devolve o original aparado.
export function maskCpf(v: string | null | undefined): string | null {
  if (v == null) return null;
  const d = onlyDigits(v);
  if (d.length !== 11) return v.trim() || null;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

// CNPJ -> 00.000.000/0000-00.
export function maskCnpj(v: string | null | undefined): string | null {
  if (v == null) return null;
  const d = onlyDigits(v);
  if (d.length !== 14) return v.trim() || null;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

// CEP -> 00000-000.
export function maskCep(v: string | null | undefined): string | null {
  if (v == null) return null;
  const d = onlyDigits(v);
  if (d.length !== 8) return v.trim() || null;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

// Data numérica pt-BR "DD/MM/AAAA". Aceita Date ou "AAAA-MM-DD". Sem deslize de fuso.
export function formatDateBr(d: Date | string): string {
  const dt = typeof d === "string" ? parseIsoDate(d) : d;
  if (!dt || isNaN(dt.getTime())) return typeof d === "string" ? d : "";
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${dt.getUTCFullYear()}`;
}

// Parse seguro de "AAAA-MM-DD" como data UTC (sem deslize de fuso).
function parseIsoDate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s.trim());
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

// "Cidade/UF" (ex.: "Salvador/BA"). Só monta se houver ao menos a cidade.
export function cidadeUf(city?: string | null, state?: string | null): string | null {
  const c = (city ?? "").trim();
  const uf = (state ?? "").trim();
  if (!c && !uf) return null;
  if (c && uf) return `${c}/${uf}`;
  return c || uf;
}

// ─── mapa dado→placeholder (superset comum aos 4 documentos) ──────────────────
export function baseCooperadoValues(
  c: CooperadoClientData,
  ctx: { now?: Date } = {},
): Record<string, string | null> {
  const now = ctx.now ?? new Date();
  return {
    nome: c.full_name ?? null,
    cpf: maskCpf(c.cpf),
    cnpj: maskCnpj(c.cnpj),
    rg: c.rg ?? null,
    rg_orgao: [c.rg_issuer, c.rg_uf].filter(Boolean).join("/") || null,
    nacionalidade: c.nationality ?? null,
    estado_civil: c.marital_status ?? null,
    profissao: c.profession ?? null,
    data_nascimento: c.birth_date ? formatDateBr(c.birth_date) : null,
    endereco: c.address ?? null,
    numero: c.address_number ?? null,
    complemento: c.address_complement ?? null,
    bairro: c.neighborhood ?? null,
    cep: maskCep(c.zip_code),
    cidade: c.city ?? null,
    uf: c.state ?? null,
    cidade_uf: cidadeUf(c.city, c.state),
    email: c.email ?? null,
    telefone: c.phone ?? null,
    // Data de emissão do documento (fecho da procuração/declaração/ficha).
    data: formatDateBr(now),
  };
}

export interface CooperadoDocDef {
  documentType: CooperadoDocType;
  /** arquivo do template (buscado por URL absoluta a partir de TEMPLATES_BASE_URL). */
  templateFile: string;
  /** rótulo humano (nome do arquivo gerado / UI). */
  label: string;
  /** valores determinísticos para os placeholders deste documento. */
  buildValues(c: CooperadoClientData, ctx?: { now?: Date }): Record<string, string | null>;
}

// Os 4 documentos do conjunto `cooperado` (COOP-DOCS-1). O outorgado da procuração
// (Rodrigo Bacellar, OAB/BA 80.891) e os termos fixos dos contratos vivem DENTRO
// dos templates — não são dado do cliente.
export const COOPERADO_DOC_DEFS: CooperadoDocDef[] = [
  {
    documentType: "procuracao",
    templateFile: "procuracao_template.docx",
    label: "Procuração",
    buildValues: (c, ctx) => baseCooperadoValues(c, ctx),
  },
  {
    documentType: "contrato_honorarios",
    templateFile: "contrato_honorarios_template.docx",
    label: "Contrato de Honorários",
    buildValues: (c, ctx) => baseCooperadoValues(c, ctx),
  },
  {
    documentType: "declaracao_hipossuficiencia",
    templateFile: "declaracao_hipossuficiencia_template.docx",
    label: "Declaração de Hipossuficiência",
    buildValues: (c, ctx) => baseCooperadoValues(c, ctx),
  },
  {
    documentType: "termo_cooperado",
    templateFile: "ficha_cadastral_cooperado_template.docx",
    label: "Ficha Cadastral de Cooperado",
    buildValues: (c, ctx) => baseCooperadoValues(c, ctx),
  },
];

// ─── render (puro/testável) ───────────────────────────────────────────────────

export interface RenderedCooperadoDoc extends FillDocxResult {
  def: CooperadoDocDef;
}

// Preenche UM documento a partir dos bytes do seu template + dados do cliente.
export async function renderCooperadoDoc(
  def: CooperadoDocDef,
  client: CooperadoClientData,
  templateBytes: ArrayBuffer | Uint8Array,
  ctx?: { now?: Date },
): Promise<RenderedCooperadoDoc> {
  const values = def.buildValues(client, ctx);
  const filled = await fillDocxTemplate(templateBytes, values);
  return { ...filled, def };
}
