// ============================================================================
// Edge Function google-calendar-sync — [INT] Google Agenda (Trilha D)
// ============================================================================
// Sincroniza public.meetings e public.audiencias com o Google Calendar
// (Modelo A: conta central + convite). Unidirecional: sistema → Google.
//
// Como é acionada:
//   - Automaticamente: trigger de banco (trg_meetings_sync / trg_audiencias_sync)
//     via pg_net, a cada INSERT/UPDATE — header X-Sync-Secret.
//   - Manualmente: botão "Sincronizar" no MeetingDetailModal — via
//     supabase.functions.invoke, com o JWT do usuário (verificado normalmente).
//
// Credenciais: lidas via RPC get_google_calendar_credentials() (SECURITY
// DEFINER, só service_role) — client_id/client_secret/refresh_token vêm de
// UM secret JSON no Vault, referenciado por google_calendar_config. Nunca
// hardcode aqui (R-6/R-8).
//
// Regra de cancelamento: status final de cancelamento (meetings.canceled /
// audiencias.cancelada) → DELETA o evento no Google (dispara e-mail de
// cancelamento pro convidado). Estados passados-terminais (no_show/done/
// realizada) → não toca no evento (já é histórico).
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const TIMEZONE = "America/Bahia";
const AUDIENCIA_DEFAULT_DURATION_MIN = 60; // audiencias.data_hora não tem fim explícito — ASSUNÇÃO, ajustar se o Rodrigo definir outro padrão.

type RecordType = "meeting" | "audiencia";

interface SyncBody {
  recordType: RecordType;
  recordId: string;
}

interface GoogleCredentials {
  configured: boolean;
  calendar_id?: string;
  client_id?: string;
  client_secret?: string;
  refresh_token?: string;
}

interface NormalizedRecord {
  id: string;
  summary: string;
  description: string;
  location: string | null;
  startISO: string;
  endISO: string;
  attendeeEmail: string | null;
  googleEventId: string | null;
  isCancelled: boolean;
  isPastTerminal: boolean;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  // --- Autenticação: service_role key OU X-Sync-Secret (trigger de banco) ---
  const authHeader = req.headers.get("Authorization") ?? "";
  const syncSecret = req.headers.get("X-Sync-Secret") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const expectedSyncSecret = Deno.env.get("GOOGLE_SYNC_SECRET") ?? "";

  const isServiceRole = authHeader === `Bearer ${serviceRoleKey}`;
  const isSyncAuth = !!expectedSyncSecret && syncSecret === expectedSyncSecret;
  const isUserAuth = authHeader.startsWith("Bearer ") && !isServiceRole; // botão manual: JWT do usuário

  if (!isServiceRole && !isSyncAuth && !isUserAuth) {
    return json({ ok: false, error: "Unauthorized. Forneça service_role, X-Sync-Secret ou JWT de usuário." }, 401);
  }

  let body: SyncBody;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "JSON inválido no corpo da requisição" }, 400);
  }
  if (!body.recordType || !body.recordId || !["meeting", "audiencia"].includes(body.recordType)) {
    return json({ ok: false, error: "recordType ('meeting'|'audiencia') e recordId são obrigatórios" }, 400);
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(SUPABASE_URL, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // --- 1) Credenciais (Vault, via RPC) ---
  const { data: credsRaw, error: credsErr } = await admin.rpc("get_google_calendar_credentials");
  if (credsErr) return json({ ok: false, error: "credenciais: " + credsErr.message }, 500);
  const creds = credsRaw as GoogleCredentials;
  if (!creds?.configured) {
    return json({ ok: true, status: "not_configured", message: "Integração Google Agenda ainda não configurada." });
  }

  // --- 2) Access token (refresh_token → access_token) ---
  let accessToken: string;
  try {
    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: creds.client_id!,
        client_secret: creds.client_secret!,
        refresh_token: creds.refresh_token!,
        grant_type: "refresh_token",
      }),
    });
    const tokenJson = await tokenRes.json();
    if (!tokenRes.ok || !tokenJson.access_token) {
      await writeSyncError(admin, body, "token_refresh_failed: " + JSON.stringify(tokenJson));
      return json({ ok: false, status: "error", error: "token_refresh_failed", detail: tokenJson }, 502);
    }
    accessToken = tokenJson.access_token;
  } catch (e) {
    await writeSyncError(admin, body, "token_refresh_exception: " + String(e));
    return json({ ok: false, status: "error", error: String(e) }, 502);
  }

  // --- 3) Carrega o registro normalizado ---
  const record = body.recordType === "meeting"
    ? await loadMeeting(admin, body.recordId)
    : await loadAudiencia(admin, body.recordId);
  if (!record) return json({ ok: false, error: "registro não encontrado" }, 404);

  const calendarId = creds.calendar_id || "primary";

  try {
    // --- 4a) Cancelado → deleta o evento (se existir) ---
    if (record.isCancelled) {
      if (record.googleEventId) {
        await deleteGoogleEvent(accessToken, calendarId, record.googleEventId);
      }
      await writeBack(admin, body, { google_sync_status: "canceled_removed" });
      return json({ ok: true, status: "canceled_removed" });
    }

    // --- 4b) Estado passado-terminal → não toca no evento histórico ---
    if (record.isPastTerminal) {
      return json({ ok: true, status: "skipped_terminal" });
    }

    // --- 4c) Cria ou atualiza (upsert) ---
    const payload = buildEventPayload(record);
    let eventId = record.googleEventId;
    if (eventId) {
      eventId = await patchGoogleEvent(accessToken, calendarId, eventId, payload);
    } else {
      eventId = await insertGoogleEvent(accessToken, calendarId, payload);
    }

    await writeBack(admin, body, {
      google_event_id: eventId,
      google_calendar_id: calendarId,
      google_sync_status: "synced",
    });
    return json({ ok: true, status: "synced", eventId });
  } catch (e) {
    await writeSyncError(admin, body, String(e));
    return json({ ok: false, status: "error", error: String(e) }, 500);
  }
});

// ─── Carregamento e normalização por tipo de registro ─────────────────────

// deno-lint-ignore no-explicit-any
async function loadMeeting(admin: any, id: string): Promise<NormalizedRecord | null> {
  const { data: m, error } = await admin.from("meetings").select("*").eq("id", id).maybeSingle();
  if (error || !m) return null;

  const attendeeEmail = m.lawyer_user_id ? await getUserEmail(admin, m.lawyer_user_id) : null;
  const startISO = combineDateTime(m.scheduled_date, m.start_time);
  const endISO = combineDateTime(m.scheduled_date, m.end_time ?? m.start_time);

  return {
    id: m.id,
    summary: `Atendimento — ${m.client_name || "cliente"}`,
    description: [m.type ? `Tipo: ${m.type}` : null, m.summary, m.notes].filter(Boolean).join("\n"),
    location: null,
    startISO,
    endISO,
    attendeeEmail,
    googleEventId: m.google_event_id ?? null,
    isCancelled: m.status === "canceled",
    isPastTerminal: m.status === "no_show" || m.status === "done",
  };
}

// deno-lint-ignore no-explicit-any
async function loadAudiencia(admin: any, id: string): Promise<NormalizedRecord | null> {
  const { data: a, error } = await admin.from("audiencias").select("*").eq("id", id).maybeSingle();
  if (error || !a) return null;

  const attendeeEmail = a.advogado_user_id ? await getUserEmail(admin, a.advogado_user_id) : null;
  const start = new Date(a.data_hora);
  const end = new Date(start.getTime() + AUDIENCIA_DEFAULT_DURATION_MIN * 60_000);

  return {
    id: a.id,
    summary: `Audiência — ${a.tipo_acao || "processo"} — ${a.client_name || "cliente"}`,
    description: [
      a.parte_contraria ? `Parte contrária: ${a.parte_contraria}` : null,
      a.process_number ? `Processo: ${a.process_number}` : null,
      a.observacoes,
    ].filter(Boolean).join("\n"),
    location: a.link_local || null,
    startISO: start.toISOString(),
    endISO: end.toISOString(),
    attendeeEmail,
    googleEventId: a.google_event_id ?? null,
    isCancelled: a.status === "cancelada",
    isPastTerminal: a.status === "realizada",
  };
}

// deno-lint-ignore no-explicit-any
async function getUserEmail(admin: any, userId: string): Promise<string | null> {
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data?.user?.email) return null;
  return data.user.email;
}

function combineDateTime(date: string, time: string): string {
  // date: 'YYYY-MM-DD', time: 'HH:MM:SS' — monta ISO local (sem 'Z'; o timeZone
  // vai explícito no payload do evento, então o Google interpreta corretamente).
  return `${date}T${time}`;
}

// ─── Google Calendar API ───────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
function buildEventPayload(record: NormalizedRecord): any {
  return {
    summary: record.summary,
    description: record.description || undefined,
    location: record.location || undefined,
    start: { dateTime: record.startISO, timeZone: TIMEZONE },
    end: { dateTime: record.endISO, timeZone: TIMEZONE },
    attendees: record.attendeeEmail ? [{ email: record.attendeeEmail }] : undefined,
    reminders: {
      useDefault: false,
      overrides: [{ method: "popup", minutes: 60 }, { method: "email", minutes: 60 }],
    },
  };
}

async function insertGoogleEvent(
  accessToken: string,
  calendarId: string,
  // deno-lint-ignore no-explicit-any
  payload: any,
): Promise<string> {
  const res = await fetch(
    `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=all`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  const data = await res.json();
  if (!res.ok) throw new Error("google_insert_failed: " + JSON.stringify(data));
  return data.id as string;
}

async function patchGoogleEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
  // deno-lint-ignore no-explicit-any
  payload: any,
): Promise<string> {
  const res = await fetch(
    `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
    {
      method: "PATCH",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  const data = await res.json();
  // 404/410 = o evento não existe mais no Google (ex.: apagado manualmente lá) — recria.
  if (res.status === 404 || res.status === 410) {
    return await insertGoogleEvent(accessToken, calendarId, payload);
  }
  if (!res.ok) throw new Error("google_patch_failed: " + JSON.stringify(data));
  return data.id as string;
}

async function deleteGoogleEvent(accessToken: string, calendarId: string, eventId: string): Promise<void> {
  const res = await fetch(
    `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
    { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } },
  );
  // 404/410 = já não existia — trata como sucesso (idempotente).
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    const data = await res.json().catch(() => ({}));
    throw new Error("google_delete_failed: " + JSON.stringify(data));
  }
}

// ─── Gravação de volta em meetings/audiencias ──────────────────────────────

async function writeBack(
  // deno-lint-ignore no-explicit-any
  admin: any,
  body: SyncBody,
  fields: Record<string, string | null>,
): Promise<void> {
  const table = body.recordType === "meeting" ? "meetings" : "audiencias";
  await admin.from(table).update({ ...fields, last_synced_at: new Date().toISOString() }).eq("id", body.recordId);
}

// deno-lint-ignore no-explicit-any
async function writeSyncError(admin: any, body: SyncBody, message: string): Promise<void> {
  const table = body.recordType === "meeting" ? "meetings" : "audiencias";
  await admin.from(table).update({
    google_sync_status: "error",
    last_synced_at: new Date().toISOString(),
  }).eq("id", body.recordId);
  console.error(`[google-calendar-sync] ${body.recordType}:${body.recordId} — ${message}`);
}
