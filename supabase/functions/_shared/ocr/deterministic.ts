// supabase/functions/_shared/ocr/deterministic.ts
//
// Camada de mapeamento de campo DETERMINÍSTICA — roda ANTES do LLM (§2.2 do
// briefing). Quanto mais campo resolvido por regra, menos PII trafega a
// terceiro (princípio de minimização). CPF e datas NÃO precisam de LLM.
//
// A confiança de cada campo combina duas coisas:
//   • legibilidade do OCR bruto (confiança da linha, em [0,1]);
//   • certeza da regra de mapeamento (peso do método).
// confidence = ocrConf × methodWeight. Dígito verificador que NÃO confere
// tampa a confiança em nível baixo, independentemente da legibilidade —
// dado inválido não vira fato só porque a imagem estava nítida.

import type { FieldMethod, OcrField, OcrLine } from "./types.ts";

// Peso do método: expressa a CERTEZA SEMÂNTICA do mapeamento, não a legibilidade.
const METHOD_WEIGHT: Record<Exclude<FieldMethod, "llm">, number> = {
  deterministic: 1.0, // regra + validação (CPF com dígito)
  regex: 0.9, // regex sem validação semântica (data/RG/CEP)
};

// Confiança-teto para dígito verificador reprovado (dado provavelmente errado).
const INVALID_CHECKDIGIT_CAP = 0.3;

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Só os dígitos de uma string. */
function digitsOnly(s: string): string {
  return (s.match(/\d/g) || []).join("");
}

// ─── CPF: regex + DÍGITO VERIFICADOR (validação determinística, sem LLM) ─────

/** Valida CPF pelos dois dígitos verificadores. `input` pode vir formatado. */
export function isValidCpf(input: string): boolean {
  const d = digitsOnly(input);
  if (d.length !== 11) return false;
  // Sequências repetidas (000..., 111...) passam na aritmética mas são inválidas.
  if (/^(\d)\1{10}$/.test(d)) return false;
  const nums = d.split("").map((c) => Number(c));
  const calcDigit = (len: number): number => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += nums[i] * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calcDigit(9) === nums[9] && calcDigit(10) === nums[10];
}

/** Formata 11 dígitos como CPF canônico "000.000.000-00". */
export function formatCpf(d: string): string {
  const s = digitsOnly(d);
  if (s.length !== 11) return d;
  return `${s.slice(0, 3)}.${s.slice(3, 6)}.${s.slice(6, 9)}-${s.slice(9)}`;
}

// ─── helpers de confiança ────────────────────────────────────────────────────

/**
 * Confiança da linha que contém `snippet`. Se nenhuma linha bater, usa a média.
 * O OCR bruto dá confiança por linha; a confiança do campo herda a da linha de
 * onde o valor foi lido.
 */
function lineConfidenceFor(snippet: string, lines: OcrLine[]): number {
  const hit = lines.find((l) => l.text.includes(snippet));
  if (hit) return clamp01(hit.confidence);
  if (lines.length === 0) return 0;
  const mean = lines.reduce((a, l) => a + clamp01(l.confidence), 0) / lines.length;
  return clamp01(mean);
}

// ─── extração por regra ───────────────────────────────────────────────────────

// CPF: 000.000.000-00 ou 11 dígitos crus. \b evita casar dentro de números maiores.
const CPF_RE = /(?<!\d)(\d{3}\.?\d{3}\.?\d{3}-?\d{2})(?!\d)/g;
// Datas dd/mm/aaaa (ou com - ou .). Ano de 4 dígitos.
const DATE_RE = /(?<!\d)(\d{2}[\/.\-]\d{2}[\/.\-]\d{4})(?!\d)/g;
// CEP: 00000-000 ou 8 dígitos.
const CEP_RE = /(?<!\d)(\d{5}-?\d{3})(?!\d)/g;
// RG: heterogêneo por UF. Capturamos padrões comuns (7-9 dígitos com pontos/traço
// e opcional dígito/letra final). Confiança menor por natureza (§2.2).
const RG_RE = /(?<!\d)(\d{1,2}\.?\d{3}\.?\d{3}-?[\dxX])(?!\d)/g;

function buildField(
  key: string,
  value: string,
  method: Exclude<FieldMethod, "llm">,
  ocrConf: number,
  sourceDocument: string,
  threshold: number,
  opts?: { invalidCheckDigit?: boolean; extraReason?: string },
): OcrField {
  let confidence = clamp01(ocrConf * METHOD_WEIGHT[method]);
  let reviewReason: string | undefined;
  if (opts?.invalidCheckDigit) {
    confidence = Math.min(confidence, INVALID_CHECKDIGIT_CAP);
    reviewReason = "dígito verificador não confere";
  }
  confidence = round2(confidence);
  const belowThreshold = confidence < threshold;
  if (belowThreshold && !reviewReason) {
    reviewReason = opts?.extraReason ?? "confiança abaixo do limiar";
  }
  return {
    key,
    value,
    confidence,
    sourceDocument,
    method,
    needsReview: belowThreshold || !!opts?.invalidCheckDigit,
    reviewReason,
  };
}

/**
 * Roda todas as regras determinísticas sobre o texto cru e devolve os campos.
 * Não escolhe entre valores conflitantes DENTRO do mesmo documento — emite o
 * primeiro de cada tipo por chave indexada (cpf, cpf_2, …), deixando a
 * desambiguação entre DOCUMENTOS para ./merge.ts.
 */
export function extractDeterministicFields(
  fullText: string,
  lines: OcrLine[],
  sourceDocument: string,
  threshold: number,
): OcrField[] {
  const fields: OcrField[] = [];
  const pushIndexed = (base: string, values: OcrField[]) => {
    values.forEach((f, i) => {
      fields.push(i === 0 ? f : { ...f, key: `${base}_${i + 1}` });
    });
  };

  // CPF — determinístico com dígito verificador.
  const cpfSeen = new Set<string>();
  const cpfFields: OcrField[] = [];
  for (const m of fullText.matchAll(CPF_RE)) {
    const raw = m[1];
    const d = digitsOnly(raw);
    if (cpfSeen.has(d)) continue;
    cpfSeen.add(d);
    const valid = isValidCpf(d);
    const ocrConf = lineConfidenceFor(raw, lines);
    cpfFields.push(
      buildField("cpf", formatCpf(d), "deterministic", ocrConf, sourceDocument, threshold, {
        invalidCheckDigit: !valid,
      }),
    );
  }
  pushIndexed("cpf", cpfFields);

  // Datas — regex, confiança menor (não sabemos DE QUEM é a data).
  const dateSeen = new Set<string>();
  const dateFields: OcrField[] = [];
  for (const m of fullText.matchAll(DATE_RE)) {
    const raw = m[1];
    if (dateSeen.has(raw)) continue;
    dateSeen.add(raw);
    const ocrConf = lineConfidenceFor(raw, lines);
    dateFields.push(
      buildField("date", raw, "regex", ocrConf, sourceDocument, threshold, {
        extraReason: "data sem atribuição de titular",
      }),
    );
  }
  pushIndexed("date", dateFields);

  // CEP — regex.
  const cepSeen = new Set<string>();
  const cepFields: OcrField[] = [];
  for (const m of fullText.matchAll(CEP_RE)) {
    const raw = m[1];
    const d = digitsOnly(raw);
    if (cepSeen.has(d)) continue;
    cepSeen.add(d);
    const ocrConf = lineConfidenceFor(raw, lines);
    const canonical = `${d.slice(0, 5)}-${d.slice(5)}`;
    cepFields.push(buildField("cep", canonical, "regex", ocrConf, sourceDocument, threshold));
  }
  pushIndexed("cep", cepFields);

  // RG — regex, confiança menor (varia por UF). Evita recontar CPFs/CEPs já vistos.
  const rgSeen = new Set<string>();
  const rgFields: OcrField[] = [];
  for (const m of fullText.matchAll(RG_RE)) {
    const raw = m[1];
    const d = digitsOnly(raw);
    if (cpfSeen.has(d) || cepSeen.has(d) || rgSeen.has(d)) continue;
    // RG tem 7-9 dígitos; descartamos casamentos curtos demais.
    if (d.length < 7) continue;
    rgSeen.add(d);
    const ocrConf = lineConfidenceFor(raw, lines);
    rgFields.push(
      buildField("rg", raw, "regex", ocrConf, sourceDocument, threshold, {
        extraReason: "RG varia por UF; capturado com confiança reduzida",
      }),
    );
  }
  pushIndexed("rg", rgFields);

  return fields;
}
