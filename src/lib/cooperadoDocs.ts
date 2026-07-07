// src/lib/cooperadoDocs.ts
//
// COOP-DOCS-2 — mapa DETERMINÍSTICO dado→placeholder dos 4 documentos do
// cooperado e a orquestração de geração/persistência.
//
// Princípio inegociável (briefing): os 4 documentos são MODELOS com lacunas
// fixas. Aqui só formatamos o dado EXATO do cadastro (CPF com máscara, data em
// pt-BR, endereço concatenado) e o entregamos ao placeholder correspondente. O
// corpo jurídico vive no .docx e é IMUTÁVEL — nenhum modelo de linguagem redige,
// resume ou reformula cláusula. Dado ausente vira "[A PREENCHER: ...]" (via
// fillDocxTemplate), nunca lacuna silenciosa.
//
// PII: os valores DEVEM vir de um registro já DECIFRADO (view clients_decrypted,
// tipo ClientFull) — nunca das colunas cifradas cruas. Este módulo não decifra
// nada; recebe o objeto decifrado pronto.
//
// NOTA (pendência COOP-DOCS-2 §2): os nomes de placeholder de `procuracao` e
// `declaracao_hipossuficiencia` estão fixados conforme o briefing. Os de
// `contrato_honorarios` e `ficha cadastral (termo_cooperado)` são um superset
// razoável dos campos do cadastro — o mapa EXATO de cada documento deve ser
// confirmado com o Ryan junto com os arquivos-modelo .docx. Fornecer um superset
// é seguro: o preenchedor só usa os placeholders que existem no template e marca
// [A PREENCHER] os que faltarem — não injeta lixo.

import { fillDocxTemplate, type FillDocxResult } from "./fillDocxTemplate";

// Subconjunto DECIFRADO do cliente (compatível com ClientFull de
// components/clients/shared.tsx). Todos opcionais: o que faltar vira [A PREENCHER].
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

// CPF -> 000.000.000-00. Se não tiver 11 dígitos, devolve o original aparado
// (não inventa dígito). null/vazio -> null (o preenchedor marca [A PREENCHER]).
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

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

// Data por extenso pt-BR: "7 de julho de 2026". Aceita Date ou "AAAA-MM-DD".
export function formatDateExtenso(d: Date | string): string {
  const dt = typeof d === "string" ? parseIsoDate(d) : d;
  if (!dt || isNaN(dt.getTime())) return typeof d === "string" ? d : "";
  return `${dt.getUTCDate()} de ${MESES[dt.getUTCMonth()]} de ${dt.getUTCFullYear()}`;
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
//
// Um único mapa "base" cobre os campos que os documentos usam. Cada definição
// reusa este mapa — o preenchedor injeta apenas os placeholders presentes no
// respectivo template. `ctx.now` permite data determinística em teste.
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
    // Data de emissão do documento (fecho da declaração etc.).
    data: formatDateExtenso(now),
  };
}

export interface CooperadoDocDef {
  documentType: CooperadoDocType;
  /** arquivo do template em public/templates/. */
  templateFile: string;
  /** rótulo humano (nome do arquivo gerado / UI). */
  label: string;
  /** valores determinísticos para os placeholders deste documento. */
  buildValues(c: CooperadoClientData, ctx?: { now?: Date }): Record<string, string | null>;
}

// Os 4 documentos do conjunto `cooperado` (COOP-DOCS-1). O outorgado da
// procuração (Rodrigo Bacellar, OAB/BA 80.891) e os termos fixos dos contratos
// vivem DENTRO dos templates — não são dado do cliente.
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
// Puro (dado o template em memória) — a fonte dos bytes (fetch/fs) fica fora.
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

// Aviso de revisão humana — exibido na UI antes de enviar para assinatura
// (adaptação do "revise antes de protocolar" que o projeto já usa no PDF).
export const REVISAO_ANTES_ASSINATURA =
  "Documento gerado automaticamente a partir do cadastro — revise os dados antes de enviar para assinatura do cliente.";
