import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getRuntimeSecret } from "./runtimeSecrets.ts";

export const integrationCorsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-integration-key, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...integrationCorsHeaders, "content-type": "application/json" },
  });
}

export function errorResponse(
  code: string,
  message: string,
  status = 400,
  extra: Record<string, unknown> = {},
): Response {
  return jsonResponse({ ok: false, error: code, message, ...extra }, status);
}

/** Extrai chave de Authorization: Bearer … ou header X-Integration-Key */
export function extractIntegrationKey(req: Request): string | null {
  const headerKey = req.headers.get("x-integration-key")?.trim();
  if (headerKey) return headerKey;

  const auth = req.headers.get("authorization")?.trim() ?? "";
  if (auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }
  return null;
}

export async function assertIntegrationKey(
  req: Request,
  admin: SupabaseClient,
): Promise<Response | null> {
  const provided = extractIntegrationKey(req);
  if (!provided) {
    return errorResponse(
      "missing_api_key",
      "Informe Authorization: Bearer <INTEGRATION_API_KEY> ou header X-Integration-Key",
      401,
    );
  }

  const expected = await getRuntimeSecret(admin, "INTEGRATION_API_KEY");
  if (!expected) {
    return errorResponse(
      "integration_not_configured",
      "INTEGRATION_API_KEY não configurada nos secrets da edge function integration-api",
      503,
    );
  }

  if (provided !== expected) {
    return errorResponse("invalid_api_key", "Chave de integração inválida", 403);
  }

  return null;
}

export function createServiceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function logIntegrationRequest(
  admin: SupabaseClient,
  entry: {
    action: string;
    method: string;
    path?: string;
    client_ip?: string | null;
    payload_summary?: Record<string, unknown>;
    status_code: number;
    error_code?: string | null;
  },
): Promise<void> {
  try {
    await admin.from("integration_api_audit_log").insert({
      action: entry.action,
      method: entry.method,
      path: entry.path ?? null,
      client_ip: entry.client_ip,
      payload_summary: entry.payload_summary ?? {},
      status_code: entry.status_code,
      error_code: entry.error_code ?? null,
    });
  } catch (e) {
    console.warn("integration audit log failed:", (e as Error).message);
  }
}

export type FilterOp =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "like"
  | "ilike"
  | "in"
  | "is";

export interface TableFilter {
  column: string;
  op?: FilterOp;
  value?: unknown;
}

const IDENT_RE = /^[a-z_][a-z0-9_]*$/i;
const MAX_SELECT_LIMIT = 2000;
const MAX_BATCH_OPS = 50;

export function assertIdentifier(name: string, label: string): void {
  if (!IDENT_RE.test(name)) {
    throw new Error(`${label} inválido: use apenas letras, números e underscore`);
  }
}

// deno-lint-ignore no-explicit-any
export function applyFilters(query: any, filters: TableFilter[] | undefined): any {
  if (!filters?.length) return query;
  let q = query;
  for (const f of filters) {
    assertIdentifier(f.column, "coluna");
    const op = f.op ?? "eq";
    switch (op) {
      case "eq":
        q = q.eq(f.column, f.value);
        break;
      case "neq":
        q = q.neq(f.column, f.value);
        break;
      case "gt":
        q = q.gt(f.column, f.value);
        break;
      case "gte":
        q = q.gte(f.column, f.value);
        break;
      case "lt":
        q = q.lt(f.column, f.value);
        break;
      case "lte":
        q = q.lte(f.column, f.value);
        break;
      case "like":
        q = q.like(f.column, f.value);
        break;
      case "ilike":
        q = q.ilike(f.column, f.value);
        break;
      case "in":
        q = q.in(f.column, f.value);
        break;
      case "is":
        q = q.is(f.column, f.value);
        break;
      default:
        throw new Error(`Operador de filtro não suportado: ${op}`);
    }
  }
  return q;
}

export { MAX_SELECT_LIMIT, MAX_BATCH_OPS };
