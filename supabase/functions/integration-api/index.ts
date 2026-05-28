/**
 * integration-api — Gateway REST para sistemas externos (Claude, n8n, ERP, etc.)
 *
 * Autenticação: INTEGRATION_API_KEY (Bearer ou X-Integration-Key)
 * Autorização: service_role — ignora RLS (acesso total ao schema public)
 *
 * POST { "action": "select"|"insert"|"update"|"delete"|"upsert"|"rpc"|"batch"|"schema"|"health", ... }
 * GET  ?action=health|schema|openapi
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  applyFilters,
  assertIdentifier,
  assertIntegrationKey,
  createServiceClient,
  errorResponse,
  integrationCorsHeaders,
  jsonResponse,
  logIntegrationRequest,
  MAX_BATCH_OPS,
  MAX_SELECT_LIMIT,
  type TableFilter,
} from "../_shared/integrationApi.ts";

const OPENAPI_VERSION = "1.0.0";

interface IntegrationBody {
  action?: string;
  table?: string;
  rpc?: string;
  args?: Record<string, unknown>;
  filters?: TableFilter[];
  data?: Record<string, unknown> | Record<string, unknown>[];
  select?: string;
  limit?: number;
  offset?: number;
  order?: { column: string; ascending?: boolean }[];
  on_conflict?: string;
  operations?: IntegrationBody[];
  /** Repassa Authorization do usuário para outra edge function */
  user_authorization?: string;
  function_name?: string;
  function_body?: Record<string, unknown>;
}

function clientIp(req: Request): string | null {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("cf-connecting-ip") ??
    null
  );
}

async function handleHealth(admin: SupabaseClient) {
  const { count: profiles } = await admin
    .from("profiles")
    .select("*", { count: "exact", head: true });
  return {
    ok: true,
    service: "jurisai-integration-api",
    version: OPENAPI_VERSION,
    project: Deno.env.get("SUPABASE_URL"),
    profiles_count: profiles ?? 0,
    access: "full_service_role",
    timestamp: new Date().toISOString(),
  };
}

async function handleSchema(admin: SupabaseClient) {
  const { data: tables, error: tErr } = await admin.rpc("integration_list_tables");
  if (tErr) {
    const fallback = [
      "profiles", "user_roles", "clients", "client_documents", "departments", "agents",
      "agent_templates", "role_templates", "role_agent_matrix", "task_types", "role_task_matrix",
      "user_tasks", "inter_assistant_requests", "chat_sessions", "chat_messages",
      "token_balances", "token_transactions", "llm_provider_configs", "imports", "leads",
      "bottleneck_notifications", "landing_events", "ui_events", "user_ui_preferences",
      "captacao_canais", "external_collaborators", "user_areas", "role_coverage",
      "agent_tasks", "agent_messages", "agent_orchestration_log", "processes",
      "model_pricing", "integration_api_audit_log",
    ];
    return { ok: true, tables: fallback, rpcs: INTEGRATION_RPCS, note: "lista estática (RPC indisponível)" };
  }

  const { data: rpcs } = await admin.rpc("integration_list_rpcs");
  return { ok: true, tables: tables ?? [], rpcs: rpcs ?? INTEGRATION_RPCS };
}

const INTEGRATION_RPCS = [
  "get_my_workspace",
  "provision_user_agents",
  "get_my_inbox",
  "get_inbox_count",
  "get_team_tasks",
  "create_user_task",
  "update_user_task_status",
  "get_task_types_by_stage",
  "get_eligible_assignees",
  "get_my_validation_queue",
  "get_validation_count",
  "validate_user_task",
  "get_my_inter_assistant_inbox",
  "get_my_inter_assistant_outbox",
  "get_inter_assistant_inbox_count",
  "create_inter_assistant_request",
  "answer_inter_assistant_request",
  "list_users_for_inter_assistant",
  "is_master_admin",
  "apply_employee_profile",
];

async function handleSelect(admin: SupabaseClient, body: IntegrationBody) {
  if (!body.table) throw new Error("Campo table é obrigatório");
  assertIdentifier(body.table, "table");

  const limit = Math.min(body.limit ?? 100, MAX_SELECT_LIMIT);
  const offset = body.offset ?? 0;

  let query = admin.from(body.table).select(body.select ?? "*", { count: "exact" });
  query = applyFilters(query, body.filters);

  if (body.order?.length) {
    for (const o of body.order) {
      assertIdentifier(o.column, "coluna order");
      query = query.order(o.column, { ascending: o.ascending !== false });
    }
  }

  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);
  return { ok: true, data, count, limit, offset };
}

async function handleInsert(admin: SupabaseClient, body: IntegrationBody) {
  if (!body.table || body.data === undefined) throw new Error("table e data são obrigatórios");
  assertIdentifier(body.table, "table");

  const { data, error } = await admin.from(body.table).insert(body.data).select(body.select ?? "*");
  if (error) throw new Error(error.message);
  return { ok: true, data };
}

async function handleUpdate(admin: SupabaseClient, body: IntegrationBody) {
  if (!body.table || body.data === undefined) throw new Error("table e data são obrigatórios");
  assertIdentifier(body.table, "table");

  let query = admin.from(body.table).update(body.data);
  query = applyFilters(query, body.filters);
  const { data, error } = await query.select(body.select ?? "*");
  if (error) throw new Error(error.message);
  return { ok: true, data };
}

async function handleDelete(admin: SupabaseClient, body: IntegrationBody) {
  if (!body.table) throw new Error("table é obrigatório");
  assertIdentifier(body.table, "table");

  let query = admin.from(body.table).delete();
  query = applyFilters(query, body.filters);
  const { data, error } = await query.select(body.select ?? "*");
  if (error) throw new Error(error.message);
  return { ok: true, data };
}

async function handleUpsert(admin: SupabaseClient, body: IntegrationBody) {
  if (!body.table || body.data === undefined) throw new Error("table e data são obrigatórios");
  assertIdentifier(body.table, "table");

  const opts = body.on_conflict ? { onConflict: body.on_conflict } : undefined;
  const { data, error } = await admin.from(body.table).upsert(body.data, opts).select(body.select ?? "*");
  if (error) throw new Error(error.message);
  return { ok: true, data };
}

async function handleRpc(admin: SupabaseClient, body: IntegrationBody) {
  const name = body.rpc;
  if (!name) throw new Error("Campo rpc é obrigatório");
  assertIdentifier(name, "rpc");

  const { data, error } = await admin.rpc(name, body.args ?? {});
  if (error) throw new Error(error.message);
  return { ok: true, data };
}

async function handleBatch(admin: SupabaseClient, body: IntegrationBody) {
  const ops = body.operations;
  if (!Array.isArray(ops) || !ops.length) throw new Error("operations deve ser um array não vazio");
  if (ops.length > MAX_BATCH_OPS) throw new Error(`Máximo ${MAX_BATCH_OPS} operações por batch`);

  const results: unknown[] = [];
  for (let i = 0; i < ops.length; i++) {
    try {
      results.push({ index: i, ...(await dispatchAction(admin, ops[i])) });
    } catch (e) {
      results.push({ index: i, ok: false, error: (e as Error).message });
    }
  }
  return { ok: true, results };
}

async function handleInvokeEdge(req: Request, body: IntegrationBody) {
  const fn = body.function_name;
  if (!fn) throw new Error("function_name é obrigatório");
  if (!/^[a-z0-9-]+$/.test(fn)) throw new Error("function_name inválido");

  const base = Deno.env.get("SUPABASE_URL")!.replace(/\/$/, "");
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const headers: Record<string, string> = {
    "content-type": "application/json",
    apikey: anon,
    authorization: body.user_authorization ?? `Bearer ${service}`,
  };

  const resp = await fetch(`${base}/functions/v1/${fn}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body.function_body ?? {}),
  });

  const text = await resp.text();
  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* texto bruto */
  }

  return { ok: resp.ok, status: resp.status, data: parsed };
}

async function dispatchAction(admin: SupabaseClient, body: IntegrationBody, req?: Request) {
  const action = body.action;
  if (!action) throw new Error("action é obrigatório");

  switch (action) {
    case "health":
      return await handleHealth(admin);
    case "schema":
      return await handleSchema(admin);
    case "select":
      return await handleSelect(admin, body);
    case "insert":
      return await handleInsert(admin, body);
    case "update":
      return await handleUpdate(admin, body);
    case "delete":
      return await handleDelete(admin, body);
    case "upsert":
      return await handleUpsert(admin, body);
    case "rpc":
      return await handleRpc(admin, body);
    case "batch":
      return await handleBatch(admin, body);
    case "invoke_edge":
      if (!req) throw new Error("invoke_edge requer request context");
      return await handleInvokeEdge(req, body);
    case "openapi":
      return {
        ok: true,
        openapi: OPENAPI_VERSION,
        documentation: "docs/API_INTEGRACAO_EXTERNA.md",
        base_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/integration-api`,
      };
    default:
      throw new Error(`action desconhecida: ${action}`);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: integrationCorsHeaders });
  }

  const admin = createServiceClient();
  const ip = clientIp(req);
  let action = "unknown";
  let statusCode = 200;
  let errorCode: string | null = null;

  const authFail = await assertIntegrationKey(req, admin);
  if (authFail) {
    const parsed = await authFail.json();
    await logIntegrationRequest(admin, {
      action: "auth",
      method: req.method,
      client_ip: ip,
      status_code: authFail.status,
      error_code: parsed?.error ?? "auth",
    });
    return authFail;
  }

  try {
    if (req.method === "GET") {
      const url = new URL(req.url);
      action = url.searchParams.get("action") ?? "health";
      const result = await dispatchAction(admin, { action }, req);
      await logIntegrationRequest(admin, {
        action,
        method: "GET",
        client_ip: ip,
        status_code: 200,
      });
      return jsonResponse(result);
    }

    if (req.method !== "POST") {
      return errorResponse("method_not_allowed", "Use GET ou POST", 405);
    }

    let body: IntegrationBody;
    try {
      body = await req.json();
    } catch {
      return errorResponse("invalid_json", "Corpo JSON inválido", 400);
    }

    action = body.action ?? "health";
    const result = await dispatchAction(admin, body, req);
    await logIntegrationRequest(admin, {
      action,
      method: "POST",
      client_ip: ip,
      payload_summary: {
        table: body.table,
        rpc: body.rpc,
        batch_size: body.operations?.length,
      },
      status_code: 200,
    });
    return jsonResponse(result);
  } catch (e) {
    const message = (e as Error).message;
    errorCode = "request_failed";
    statusCode = 400;
    await logIntegrationRequest(admin, {
      action,
      method: req.method,
      client_ip: ip,
      status_code: statusCode,
      error_code: errorCode,
    });
    return errorResponse(errorCode, message, statusCode);
  }
});
