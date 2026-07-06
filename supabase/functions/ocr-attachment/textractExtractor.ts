// supabase/functions/ocr-attachment/textractExtractor.ts
//
// Extrator DEDICADO (Briefing 2) — abordagem HÍBRIDA liderada por OCR:
//
//   1. Texto cru de alta fidelidade via AWS Textract `DetectDocumentText`
//      (região sa-east-1, São Paulo) — devolve texto E confiança por linha.
//   2. Mapeamento de campo DETERMINÍSTICO primeiro (CPF com dígito verificador,
//      datas, CEP, RG) — minimiza PII trafegada a terceiros: CPF e data NÃO
//      passam por LLM.
//   3. LLM de REFORÇO só no que sobrar (layout bagunçado), via OpenAI DIRETO
//      (modelo sem "/"), NUNCA OpenRouter. Manda o TEXTO já extraído, nunca a
//      imagem, e o mínimo necessário. Opcional: sem chave/modelo → é pulado.
//
// Cada campo carrega `confidence` (0..1) e `sourceDocument` (atribuição). Abaixo
// do limiar (default 0.85) → `needsReview` (o consumidor trata como
// [A PREENCHER]/[REVISAR], nunca afirma o valor). É o que teria evitado o
// ALERTA-1 (data do RG do representante atribuída à autora): com atribuição +
// confiança, o valor incerto é sinalizado, não concluído.
//
// Implementa a MESMA interface `Extractor` (extractor.ts). Selecionado por
// OCR_ENGINE=textract. Sem SDK pesado: assina o request com SigV4 via Web Crypto
// (sem dependência remota → módulo testável em isolamento).
//
// GATE DURO: só ligar em dado REAL após R-2 + R-9 + DPA (ver Briefing 2 §5). Com
// OCR_ENABLED OFF nada disto roda em produção; testar só com docs sintéticos.

import type { Extractor, OcrField, OcrResult } from "./extractor.ts";

// ─── Config (lida de env; credenciais NUNCA no código/git) ───────────────────
export interface TextractConfig {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string | null;
  threshold: number; // limiar de confiança usável (default 0.85)
  llmModel?: string | null; // reforço: modelo SEM "/" (OpenAI direto)
  openaiKey?: string | null; // reforço: chave OpenAI (env)
}

const DEFAULT_THRESHOLD = 0.85;
const LLM_CONFIDENCE_CAP = 0.7; // reforço nunca afirma alta confiança sozinho
const TEXTRACT_TIMEOUT_MS = 25_000;

export function configFromEnv(): TextractConfig {
  const num = Number(Deno.env.get("OCR_CONFIDENCE_THRESHOLD"));
  return {
    region: (Deno.env.get("AWS_REGION") || "sa-east-1").trim(),
    accessKeyId: Deno.env.get("AWS_ACCESS_KEY_ID") || "",
    secretAccessKey: Deno.env.get("AWS_SECRET_ACCESS_KEY") || "",
    sessionToken: Deno.env.get("AWS_SESSION_TOKEN") || null,
    threshold: Number.isFinite(num) && num > 0 && num <= 1 ? num : DEFAULT_THRESHOLD,
    llmModel: Deno.env.get("OCR_LLM_MODEL") || null,
    openaiKey: Deno.env.get("OPENAI_API_KEY") || null,
  };
}

// ─── Validação determinística: CPF (dígito verificador) ──────────────────────
// Sem LLM: os 11 dígitos passam pelo cálculo dos 2 dígitos verificadores. Rejeita
// também as sequências repetidas (000..., 111...) que o algoritmo aceitaria.
export function isValidCPF(raw: string): boolean {
  const d = (raw || "").replace(/\D/g, "");
  if (d.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(d)) return false;
  const calc = (len: number): number => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const mod = (sum * 10) % 11;
    return mod === 10 ? 0 : mod;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}

// ─── Linha de OCR (texto + confiança 0..1) ───────────────────────────────────
export interface OcrLine {
  text: string;
  confidence: number; // 0..1
}

// ─── Mapeamento DETERMINÍSTICO (regex + validação) ───────────────────────────
// Percorre as linhas do OCR e extrai campos por regra, cada um com confiança
// derivada da confiança da linha + força da validação. sourceDocument = o anexo
// desta extração (a divergência ENTRE anexos é resolvida em reconcileFields).
const RE_CPF = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
const RE_DATE = /\b(\d{2})\/(\d{2})\/(\d{4})\b/g;
const RE_CEP = /\b\d{5}-?\d{3}\b/g;
// RG brasileiro varia por UF; captura conservadora (7 a 9 dígitos com separadores
// opcionais e dígito/letra final). Confiança baixa de propósito.
const RE_RG = /\b\d{1,2}\.?\d{3}\.?\d{3}-?[0-9xX]\b/g;

export function mapDeterministicFields(lines: OcrLine[], sourceDocument: string, threshold: number): OcrField[] {
  const fields: OcrField[] = [];
  const push = (key: string, value: string, confidence: number, reason?: string) => {
    const conf = Math.max(0, Math.min(1, confidence));
    fields.push({
      key, value, confidence: conf, sourceDocument,
      needsReview: conf < threshold || !!reason,
      ...(reason ? { reviewReason: reason } : {}),
    });
  };

  const seen = new Set<string>(); // dedup por key+value
  for (const line of lines) {
    const lc = Math.max(0, Math.min(1, line.confidence));
    const text = line.text || "";

    for (const m of text.matchAll(RE_CPF)) {
      const value = m[0];
      const k = `cpf:${value.replace(/\D/g, "")}`;
      if (seen.has(k)) continue;
      seen.add(k);
      if (isValidCPF(value)) {
        // Dígito verificador confere → alta confiança (a validação é determinística).
        push("cpf", value, Math.max(0.9, lc));
      } else {
        // Regex casou mas o dígito NÃO confere → provável erro de OCR: sinaliza.
        push("cpf", value, Math.min(0.4, lc), "cpf_digito_invalido");
      }
    }

    for (const m of text.matchAll(RE_DATE)) {
      const value = m[0];
      const k = `data:${value}`;
      if (seen.has(k)) continue;
      seen.add(k);
      // Datas: a REGRA reconhece o formato, mas QUAL data / de QUEM é ambíguo →
      // confiança atenuada; a atribuição (sourceDocument) + reconcile cuidam do resto.
      push("data", value, lc * 0.9);
    }

    for (const m of text.matchAll(RE_CEP)) {
      const value = m[0];
      const k = `cep:${value.replace(/\D/g, "")}`;
      if (seen.has(k)) continue;
      seen.add(k);
      push("cep", value, lc * 0.9);
    }

    for (const m of text.matchAll(RE_RG)) {
      const value = m[0];
      if (isValidCPF(value)) continue; // não confundir CPF com RG
      const k = `rg:${value.replace(/\D/g, "")}`;
      if (seen.has(k)) continue;
      seen.add(k);
      // RG varia por UF → confiança baixa (captura conservadora).
      push("rg", value, lc * 0.7);
    }
  }
  return fields;
}

// ─── Anti-ALERTA-1: reconcilia campos de MÚLTIPLOS documentos ────────────────
// Se o MESMO campo (ex.: "data") vier com valores DIVERGENTES de documentos
// diferentes, NÃO escolhe um: emite TODOS com sua atribuição e marca needsReview
// (o consumidor mostra [REVISAR], nunca afirma). Se convergem/único, preserva a
// marcação por confiança. Função PURA — base do teste anti-ALERTA-1.
export function reconcileFields(fields: OcrField[]): OcrField[] {
  const byKey = new Map<string, OcrField[]>();
  for (const f of fields) {
    const arr = byKey.get(f.key) ?? [];
    arr.push(f);
    byKey.set(f.key, arr);
  }
  const out: OcrField[] = [];
  for (const [, group] of byKey) {
    const distinct = new Set(group.map((f) => f.value.replace(/\s+/g, "").toLowerCase()));
    if (distinct.size > 1) {
      // Divergência entre documentos → sinaliza TODOS, mantém atribuição.
      for (const f of group) {
        out.push({ ...f, needsReview: true, reviewReason: "divergencia_entre_documentos" });
      }
    } else {
      out.push(...group);
    }
  }
  return out;
}

// ─── AWS SigV4 (mínimo, via Web Crypto) ──────────────────────────────────────
const enc = new TextEncoder();

async function sha256Hex(data: string | Uint8Array): Promise<string> {
  const buf = typeof data === "string" ? enc.encode(data) : data;
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmac(key: Uint8Array, data: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(data));
  return new Uint8Array(sig);
}

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function base64Encode(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

// Assina e chama Textract.DetectDocumentText. Devolve as linhas (LINE) com
// confiança normalizada (0..1). Lança em erro de credencial/rede/HTTP.
export async function textractDetectText(bytes: Uint8Array, cfg: TextractConfig): Promise<OcrLine[]> {
  if (!cfg.accessKeyId || !cfg.secretAccessKey) {
    throw new Error("textract: credenciais AWS ausentes (AWS_ACCESS_KEY_ID/SECRET)");
  }
  const service = "textract";
  const host = `textract.${cfg.region}.amazonaws.com`;
  const endpoint = `https://${host}/`;
  const target = "Textract.DetectDocumentText";
  const contentType = "application/x-amz-json-1.1";
  const payload = JSON.stringify({ Document: { Bytes: base64Encode(bytes) } });

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, ""); // YYYYMMDDTHHMMSSZ
  const dateStamp = amzDate.slice(0, 8); // YYYYMMDD

  const payloadHash = await sha256Hex(payload);
  // Cabeçalhos canônicos em ordem alfabética.
  const canonicalHeaders =
    `content-type:${contentType}\n` +
    `host:${host}\n` +
    `x-amz-date:${amzDate}\n` +
    `x-amz-target:${target}\n`;
  const signedHeaders = "content-type;host;x-amz-date;x-amz-target";
  const canonicalRequest = [
    "POST", "/", "", canonicalHeaders, signedHeaders, payloadHash,
  ].join("\n");

  const scope = `${dateStamp}/${cfg.region}/${service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256", amzDate, scope, await sha256Hex(canonicalRequest),
  ].join("\n");

  const kDate = await hmac(enc.encode(`AWS4${cfg.secretAccessKey}`), dateStamp);
  const kRegion = await hmac(kDate, cfg.region);
  const kService = await hmac(kRegion, service);
  const kSigning = await hmac(kService, "aws4_request");
  const signature = toHex(await hmac(kSigning, stringToSign));

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${cfg.accessKeyId}/${scope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const headers: Record<string, string> = {
    "content-type": contentType,
    "x-amz-date": amzDate,
    "x-amz-target": target,
    "authorization": authorization,
  };
  if (cfg.sessionToken) headers["x-amz-security-token"] = cfg.sessionToken;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TEXTRACT_TIMEOUT_MS);
  let resp: Response;
  try {
    resp = await fetch(endpoint, { method: "POST", headers, body: payload, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`textract: HTTP ${resp.status} ${body.slice(0, 300)}`);
  }
  const json = await resp.json() as { Blocks?: { BlockType?: string; Text?: string; Confidence?: number }[] };
  const blocks = json.Blocks || [];
  return blocks
    .filter((b) => b.BlockType === "LINE" && typeof b.Text === "string")
    .map((b) => ({ text: b.Text as string, confidence: (b.Confidence ?? 0) / 100 }));
}

// ─── LLM de reforço (OpenAI DIRETO; opcional; texto, nunca imagem) ───────────
// Só roda se houver chave + modelo. Recebe o TEXTO já extraído (minimização) e
// pede os campos que a regra NÃO pegou. Confiança limitada (LLM_CONFIDENCE_CAP)
// → nunca afirma alta confiança sozinho; abaixo do limiar → needsReview.
export async function reinforceWithLLM(
  text: string, existing: OcrField[], sourceDocument: string, cfg: TextractConfig,
): Promise<OcrField[]> {
  if (!cfg.llmModel || !cfg.openaiKey) return []; // reforço desabilitado → só determinístico
  if (cfg.llmModel.includes("/")) {
    // "/" ⇒ OpenRouter (trajeto opaco) — PROIBIDO para PII. Aborta o reforço.
    console.warn("[ocr] OCR_LLM_MODEL com '/' (OpenRouter) — reforço PULADO (exige OpenAI direto)");
    return [];
  }
  const already = existing.map((f) => f.key).join(", ") || "(nenhum)";
  const sys =
    "Você extrai campos estruturados de um texto de documento (RG/CPF/comprovante) já " +
    "transcrito por OCR. Responda SOMENTE JSON {\"fields\":[{\"key\":\"...\",\"value\":\"...\"}]}. " +
    "Chaves úteis: nome, data_nascimento, filiacao, orgao_emissor, naturalidade, endereco. " +
    "NÃO invente: só extraia o que está literalmente no texto. Não repita campos já resolvidos.";
  const user = `Campos já resolvidos deterministicamente: ${already}.\n\nTEXTO OCR:\n${text.slice(0, 6000)}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TEXTRACT_TIMEOUT_MS);
  let resp: Response;
  try {
    resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.openaiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: cfg.llmModel,
        messages: [{ role: "system", content: sys }, { role: "user", content: user }],
        max_completion_tokens: 800,
        response_format: { type: "json_object" },
      }),
      signal: ctrl.signal,
    });
  } catch (e) {
    console.warn(`[ocr] reforço LLM falhou: ${(e as Error)?.message}`); // fail-open: só determinístico
    return [];
  } finally {
    clearTimeout(timer);
  }
  if (!resp.ok) {
    console.warn(`[ocr] reforço LLM HTTP ${resp.status}`);
    return [];
  }
  try {
    const data = await resp.json() as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(content) as { fields?: { key?: string; value?: string }[] };
    const existingKeys = new Set(existing.map((f) => f.key));
    const out: OcrField[] = [];
    for (const f of parsed.fields || []) {
      const key = (f.key || "").trim();
      const value = (f.value || "").trim();
      if (!key || !value || existingKeys.has(key)) continue;
      // Reforço LLM: confiança limitada (< limiar) → sempre needsReview.
      out.push({
        key, value, confidence: LLM_CONFIDENCE_CAP, sourceDocument,
        needsReview: LLM_CONFIDENCE_CAP < cfg.threshold, reviewReason: "llm_reforco",
      });
    }
    return out;
  } catch {
    return [];
  }
}

// ─── Extrator híbrido (fábrica) ──────────────────────────────────────────────
export function makeTextractExtractor(cfgOverride?: Partial<TextractConfig>): Extractor {
  return {
    async extract(bytes: Uint8Array, _mime: string, fileName: string): Promise<OcrResult> {
      const cfg = { ...configFromEnv(), ...cfgOverride };
      const lines = await textractDetectText(bytes, cfg);
      const text = lines.map((l) => l.text).join("\n");

      const deterministic = mapDeterministicFields(lines, fileName, cfg.threshold);
      const reinforced = await reinforceWithLLM(text, deterministic, fileName, cfg);
      const fields = reconcileFields([...deterministic, ...reinforced]);

      // Confiança agregada: média das confianças dos campos (0 se nenhum campo).
      const confidenceOverall = fields.length
        ? fields.reduce((s, f) => s + f.confidence, 0) / fields.length
        : (lines.length ? lines.reduce((s, l) => s + l.confidence, 0) / lines.length : 0);

      return { text, fields, confidenceOverall, engine: "textract+map" };
    },
  };
}

export const textractExtractor: Extractor = makeTextractExtractor();
