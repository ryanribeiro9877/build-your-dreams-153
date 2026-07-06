// supabase/functions/_shared/ocr/textractClient.ts
//
// OCR bruto default: AWS Textract `DetectDocumentText`, região sa-east-1 (SP).
// Fica ATRÁS da interface RawOcrFn — trocável por Vision/Tesseract sem tocar
// no extrator. Devolve texto cru de alta fidelidade + confiança por linha.
//
// Credenciais e região vêm de SECRETS DO EDGE (setados pelo Ryan), nunca do
// código/git: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION=sa-east-1
// e, opcionalmente, AWS_SESSION_TOKEN.
//
// Assina com AWS SigV4 usando Web Crypto (sem SDK). O binário da imagem vai
// em base64 no corpo (Document.Bytes).

import type { RawOcrFn, RawOcrResult } from "./types.ts";

const SERVICE = "textract";
const TARGET = "Textract.DetectDocumentText";
const CONTENT_TYPE = "application/x-amz-json-1.1";

export interface TextractConfig {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  /** Região AWS. O briefing fixa sa-east-1 (residência em SP). */
  region: string;
  /** Injetável para teste; default = fetch global. */
  fetchImpl?: typeof fetch;
}

interface TextractBlock {
  BlockType?: string;
  Text?: string;
  Confidence?: number; // 0..100
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(data: string | Uint8Array): Promise<string> {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  return toHex(await crypto.subtle.digest("SHA-256", bytes));
}

async function hmac(key: ArrayBuffer | Uint8Array, msg: string): Promise<ArrayBuffer> {
  const keyBuf = key instanceof Uint8Array ? key : new Uint8Array(key);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBuf,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(msg));
}

async function signingKey(
  secret: string,
  dateStamp: string,
  region: string,
  service: string,
): Promise<ArrayBuffer> {
  const kDate = await hmac(new TextEncoder().encode(`AWS4${secret}`), dateStamp);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  return hmac(kService, "aws4_request");
}

function base64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

// aaaammddThhmmssZ e aaaammdd (UTC) a partir de um Date.
function amzDates(now: Date): { amzDate: string; dateStamp: string } {
  const iso = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const amzDate = iso.slice(0, 15) + "Z"; // YYYYMMDDTHHMMSSZ
  return { amzDate, dateStamp: amzDate.slice(0, 8) };
}

/**
 * Cria um RawOcrFn ligado ao AWS Textract (SigV4). `now` é injetável para
 * teste determinístico; default = relógio real.
 */
export function makeTextractRawOcr(
  cfg: TextractConfig,
  now: () => Date = () => new Date(),
): RawOcrFn {
  const doFetch = cfg.fetchImpl ?? fetch;
  const host = `textract.${cfg.region}.amazonaws.com`;
  const endpoint = `https://${host}/`;

  return async (input): Promise<RawOcrResult> => {
    const payload = JSON.stringify({ Document: { Bytes: base64(input.bytes) } });
    const { amzDate, dateStamp } = amzDates(now());

    const payloadHash = await sha256Hex(payload);
    const canonicalHeaders =
      `content-type:${CONTENT_TYPE}\n` +
      `host:${host}\n` +
      `x-amz-content-sha256:${payloadHash}\n` +
      `x-amz-date:${amzDate}\n` +
      `x-amz-target:${TARGET}\n` +
      (cfg.sessionToken ? `x-amz-security-token:${cfg.sessionToken}\n` : "");
    const signedHeaders =
      "content-type;host;x-amz-content-sha256;x-amz-date;x-amz-target" +
      (cfg.sessionToken ? ";x-amz-security-token" : "");

    const canonicalRequest = [
      "POST",
      "/",
      "",
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join("\n");

    const scope = `${dateStamp}/${cfg.region}/${SERVICE}/aws4_request`;
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amzDate,
      scope,
      await sha256Hex(canonicalRequest),
    ].join("\n");

    const key = await signingKey(cfg.secretAccessKey, dateStamp, cfg.region, SERVICE);
    const signature = toHex(await hmac(key, stringToSign));

    const authorization =
      `AWS4-HMAC-SHA256 Credential=${cfg.accessKeyId}/${scope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const headers: Record<string, string> = {
      "Content-Type": CONTENT_TYPE,
      "X-Amz-Date": amzDate,
      "X-Amz-Target": TARGET,
      "X-Amz-Content-Sha256": payloadHash,
      Authorization: authorization,
    };
    if (cfg.sessionToken) headers["X-Amz-Security-Token"] = cfg.sessionToken;

    const resp = await doFetch(endpoint, { method: "POST", headers, body: payload });
    if (!resp.ok) {
      throw new Error(`Textract ${resp.status}: ${await resp.text()}`);
    }
    const data = await resp.json();
    const blocks: TextractBlock[] = Array.isArray(data?.Blocks) ? data.Blocks : [];
    const lineBlocks = blocks.filter((b) => b.BlockType === "LINE");
    const lines = lineBlocks.map((b) => ({
      text: b.Text ?? "",
      confidence: typeof b.Confidence === "number" ? b.Confidence / 100 : 0,
    }));
    const fullText = lines.map((l) => l.text).join("\n");
    return { fullText, lines };
  };
}
