// ============================================================================
// V20 — Edge Function send-email-notifications
// ============================================================================
// Consome a fila public.email_notifications, envia via Resend, atualiza status.
//
// Como acionar:
//   - Supabase Dashboard → Cron Jobs (Edge Functions) → a cada 1 minuto
//   - OU manualmente: POST /functions/v1/send-email-notifications
//
// Limite por execução: 20 e-mails (evita rate limit do Resend)
// Retry: max 5 tentativas por notificação. Depois disso, status='failed'
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const MAX_PER_RUN = 20;
const MAX_ATTEMPTS = 5;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Notification {
  id: string;
  recipient_email: string;
  recipient_user_id: string;
  type: string;
  subject: string;
  body_html: string;
  body_text: string | null;
  attempts: number;
}

interface ResendResponse {
  id?: string;
  error?: { message?: string; name?: string };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Carrega secrets (Resend + envelope) via tabela edge_runtime_secrets
  const { data: secrets } = await admin
    .from("edge_runtime_secrets")
    .select("key, value")
    .in("key", ["RESEND_API_KEY", "INVITE_EMAIL_FROM"]);

  const secretsMap = new Map(secrets?.map(s => [s.key, s.value]) ?? []);
  const RESEND_API_KEY = secretsMap.get("RESEND_API_KEY");
  const FROM = secretsMap.get("INVITE_EMAIL_FROM") ?? "JurisAI <onboarding@resend.dev>";

  if (!RESEND_API_KEY) {
    return new Response(
      JSON.stringify({ ok: false, error: "RESEND_API_KEY não configurado em edge_runtime_secrets" }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }

  // Carrega lote de notificações pendentes
  const { data: queue, error: queueErr } = await admin
    .from("email_notifications")
    .select("id, recipient_email, recipient_user_id, type, subject, body_html, body_text, attempts")
    .eq("status", "pending")
    .lt("attempts", MAX_ATTEMPTS)
    .lte("scheduled_at", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(MAX_PER_RUN);

  if (queueErr) {
    return new Response(
      JSON.stringify({ ok: false, error: queueErr.message }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }

  const notifications = (queue ?? []) as Notification[];

  if (notifications.length === 0) {
    return new Response(
      JSON.stringify({ ok: true, processed: 0, message: "fila vazia" }),
      { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }

  // Marca como sending pra evitar duplo processamento
  const ids = notifications.map(n => n.id);
  await admin
    .from("email_notifications")
    .update({ status: "sending", attempts: notifications[0].attempts + 1 })
    .in("id", ids);

  const results: Array<{ id: string; ok: boolean; resend_id?: string; error?: string }> = [];

  for (const n of notifications) {
    try {
      const payload = {
        from: FROM,
        to: [n.recipient_email],
        subject: n.subject,
        html: n.body_html,
        ...(n.body_text ? { text: n.body_text } : {}),
      };

      const resendRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data: ResendResponse = await resendRes.json();

      if (!resendRes.ok || data.error) {
        const msg = data.error?.message ?? `HTTP ${resendRes.status}`;
        await admin
          .from("email_notifications")
          .update({
            status: n.attempts + 1 >= MAX_ATTEMPTS ? "failed" : "pending",
            last_error: msg,
          })
          .eq("id", n.id);
        results.push({ id: n.id, ok: false, error: msg });
      } else {
        await admin
          .from("email_notifications")
          .update({
            status: "sent",
            sent_at: new Date().toISOString(),
            resend_id: data.id ?? null,
            last_error: null,
          })
          .eq("id", n.id);
        results.push({ id: n.id, ok: true, resend_id: data.id });
      }
    } catch (e) {
      const msg = (e as Error).message ?? String(e);
      await admin
        .from("email_notifications")
        .update({
          status: n.attempts + 1 >= MAX_ATTEMPTS ? "failed" : "pending",
          last_error: msg,
        })
        .eq("id", n.id);
      results.push({ id: n.id, ok: false, error: msg });
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      processed: results.length,
      success: results.filter(r => r.ok).length,
      failed: results.filter(r => !r.ok).length,
      results,
    }),
    { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
  );
});
