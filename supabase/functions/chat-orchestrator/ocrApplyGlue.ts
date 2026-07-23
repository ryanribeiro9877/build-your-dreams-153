// supabase/functions/chat-orchestrator/ocrApplyGlue.ts
//
// Trilho B — glue determinístico do cadastro originado de documento (OCR).
// Funções PURAS (testáveis) usadas por proposeAction/handleConfirm:
//   • findIdentityDocId  — acha o anexo de identidade (doc_type identidade/cnh)
//                          do turno, para carimbar a proposta de cadastro.
//   • fieldsForCadastro  — mapeia ocr_fields → colunas de cadastro que a RPC
//                          apply_ocr_client_fields entende (só needsReview=false;
//                          espelha FIELD_TO_CADASTRO da ocr-client-document).
//   • computeMissingFields — campos que NÃO entraram com confiança (ausentes ou
//                          [REVISAR]) → rótulos pt-BR para a pendência.
//   • buildPendenciaDescricao — texto da pendência "completar cadastro".
//
// Nenhuma dessas funções toca rede/DB — a I/O (apply_ocr_client_fields +
// criar_pendencia) fica no handleConfirm, com admin (service-role) e userClient
// (JWT) respectivamente.

import { IDENTITY_DOC_TYPES } from "../_shared/ocr/taxonomy.ts";

export interface OcrFieldLite {
  key: string;
  value: string;
  needsReview?: boolean;
}

// IDENTITY_DOC_TYPES (identidade/cnh) vem da taxonomia central (_shared/ocr/taxonomy.ts).

// Chave do OcrField → coluna que a RPC apply_ocr_client_fields entende. Só campos
// SEGUROS de auto-preencher (atribuíveis ao titular). full_name/doc_type ficam de fora.
const FIELD_TO_CADASTRO: Record<string, string> = {
  cpf: "cpf", rg: "rg", cep: "zip_code", rg_issuer: "rg_issuer", rg_uf: "rg_uf",
  birth_date: "birth_date", mother_name: "mother_name", father_name: "father_name",
  nationality: "nationality", gender: "gender", marital_status: "marital_status",
  address: "address", city: "city", state: "state",
};

// Rótulos pt-BR das colunas de cadastro (para a descrição da pendência).
const CADASTRO_LABELS: Record<string, string> = {
  cpf: "CPF", rg: "RG", zip_code: "CEP", rg_issuer: "órgão emissor",
  rg_uf: "UF do RG", birth_date: "data de nascimento", mother_name: "nome da mãe",
  father_name: "nome do pai", nationality: "nacionalidade", gender: "sexo",
  marital_status: "estado civil", address: "endereço", city: "cidade", state: "estado",
};

// Conjunto de campos "esperados" de um documento de identidade para um cadastro
// completo. Base para listar o que ficou faltando (ausente ou [REVISAR]).
const EXPECTED_CADASTRO_COLS = [
  "cpf", "rg", "birth_date", "mother_name", "father_name",
  "address", "zip_code", "city", "state",
];

/** Normaliza o jsonb de ocr_fields para uma lista tipada (defensivo). */
export function parseOcrFields(raw: unknown): OcrFieldLite[] {
  if (!Array.isArray(raw)) return [];
  const out: OcrFieldLite[] = [];
  for (const f of raw) {
    if (f && typeof f === "object" && typeof (f as { key?: unknown }).key === "string") {
      const ff = f as { key: string; value?: unknown; needsReview?: unknown };
      out.push({
        key: ff.key,
        value: ff.value == null ? "" : String(ff.value),
        needsReview: ff.needsReview === true,
      });
    }
  }
  return out;
}

function docTypeOf(fields: OcrFieldLite[]): string | null {
  const dt = fields.find((f) => f.key === "doc_type");
  return dt && dt.value ? dt.value.toLowerCase() : null;
}

export function isIdentityDoc(fields: OcrFieldLite[]): boolean {
  const dt = docTypeOf(fields);
  return dt != null && IDENTITY_DOC_TYPES.has(dt);
}

/**
 * Devolve o id do PRIMEIRO anexo de identidade do turno (doc_type identidade/cnh),
 * ou null. Usado por proposeAction para carimbar a proposta de cadastrar_cliente.
 */
export function findIdentityDocId(docs: Array<{ id: string; ocrFields?: unknown }>): string | null {
  for (const d of docs) {
    if (isIdentityDoc(parseOcrFields(d.ocrFields))) return d.id;
  }
  return null;
}

/** Monta o jsonb p/ apply_ocr_client_fields: só campos de alta confiança. */
export function fieldsForCadastro(fields: OcrFieldLite[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fields) {
    if (f.needsReview) continue;
    const base = f.key.replace(/_\d+$/, ""); // ignora cpf_2, rg_2, …
    const col = FIELD_TO_CADASTRO[base];
    if (!col || out[col]) continue; // 1º valor por coluna
    const v = (f.value || "").trim();
    if (v) out[col] = v;
  }
  return out;
}

/**
 * Campos que a pendência deve listar: esperados que NÃO entraram com confiança
 * (ausentes OU marcados [REVISAR]). Rótulos pt-BR, sem duplicar.
 */
export function computeMissingFields(fields: OcrFieldLite[]): string[] {
  const confident = new Set(Object.keys(fieldsForCadastro(fields)));
  const missing: string[] = [];
  for (const col of EXPECTED_CADASTRO_COLS) {
    if (!confident.has(col)) missing.push(CADASTRO_LABELS[col] ?? col);
  }
  return missing;
}

/** Descrição da pendência "completar cadastro". */
export function buildPendenciaDescricao(nome: string, missing: string[]): string {
  const quem = nome?.trim() ? nome.trim() : "o cliente";
  if (missing.length === 0) {
    return `Cadastro de ${quem} criado a partir de documento (OCR). Confira os dados aplicados.`;
  }
  return `Cadastro de ${quem} criado a partir de documento (OCR). Completar/conferir: ${missing.join(", ")}.`;
}
