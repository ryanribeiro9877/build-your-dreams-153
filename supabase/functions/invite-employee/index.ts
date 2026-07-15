import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildInviteEmailHtml,
  buildInviteEmailSubject,
  buildInviteEmailText,
  getInviteEmailFrom,
  getInviteEmailReplyTo,
} from "../_shared/inviteEmail.ts";
import { getRuntimeSecret } from "../_shared/runtimeSecrets.ts";

import { corsHeaders } from "../_shared/cors.ts";

interface InviteBody {
  full_name: string;
  email: string;
  role_template_id: string;
  is_estagiario: boolean;
}

const ROLE_MAP: Record<string, string> = {
  socio: "admin",
  adv_confeccao_geral: "lawyer",
  adv_protocolo: "lawyer",
  adv_audiencia_execucao: "lawyer",
  adv_previdenciario: "lawyer",
  lider_recepcao: "receptionist",
  recepcionista: "receptionist",
  financeiro: "financial",
};

function mapAppRole(templateCode: string, isEstagiario: boolean): string {
  if (isEstagiario) return "intern";
  return ROLE_MAP[templateCode] ?? "intern";
}

async function sendResendEmail(
  apiKey: string,
  to: string,
  fullName: string,
  roleName: string,
  actionLink: string,
  fromOverride?: string | null,
): Promise<void> {
  const subject = buildInviteEmailSubject();
  const html = buildInviteEmailHtml(fullName, roleName, actionLink);
  const text = buildInviteEmailText(fullName, roleName, actionLink);
  const from = fromOverride?.trim() || getInviteEmailFrom();
  const replyTo = getInviteEmailReplyTo();

  const payload: Record<string, unknown> = {
    from,
    to: [to],
    subject,
    html,
    text,
  };
  if (replyTo) payload.reply_to = replyTo;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Falha ao enviar e-mail (Resend): ${body}`);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const siteUrlDefault = "http://localhost:8080";

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "not_authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller }, error: userErr } = await callerClient.auth.getUser();
    if (userErr || !caller) {
      return new Response(JSON.stringify({ error: "not_authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceKey);

    const siteUrl = (
      (await getRuntimeSecret(adminClient, "SITE_URL")) ??
      Deno.env.get("PUBLIC_SITE_URL") ??
      siteUrlDefault
    ).replace(/\/$/, "");

    const { data: isMaster, error: masterErr } = await adminClient.rpc("is_master_admin", {
      _user_id: caller.id,
    });
    if (masterErr || !isMaster) {
      return new Response(JSON.stringify({ error: "forbidden", message: "Apenas o usuário master (diretor) pode convidar funcionários." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as InviteBody;
    const fullName = body.full_name?.trim();
    const email = body.email?.trim().toLowerCase();
    const roleTemplateId = body.role_template_id;
    const isEstagiario = Boolean(body.is_estagiario);

    if (!fullName || !email || !roleTemplateId) {
      return new Response(JSON.stringify({ error: "invalid_request", message: "Preencha todos os campos obrigatórios." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(email)) {
      return new Response(JSON.stringify({ error: "invalid_email" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: template, error: tplErr } = await adminClient
      .from("role_templates")
      .select("id, code, display_name, has_login")
      .eq("id", roleTemplateId)
      .maybeSingle();

    if (tplErr || !template) {
      return new Response(JSON.stringify({ error: "invalid_role", message: "Função não encontrada." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!template.has_login) {
      return new Response(JSON.stringify({ error: "no_login", message: "Este cargo não possui acesso ao sistema." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const appRole = mapAppRole(template.code, isEstagiario);
    const redirectTo = `${siteUrl}/definir-senha`;

    const resendKey = await getRuntimeSecret(adminClient, "RESEND_API_KEY");
    if (!resendKey) {
      return new Response(
        JSON.stringify({
          error: "resend_not_configured",
          message:
            "RESEND_API_KEY não configurada. Defina em Edge Functions → Secrets ou rode: node scripts/sync-edge-secrets-to-db.mjs",
        }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Rate limiting: check if email already has a recent pending invite (last 5 minutes)
    const { data: existingUsers } = await adminClient.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(u => u.email === email);
    if (existingUser) {
      const invitedAt = existingUser.invited_at ?? existingUser.created_at;
      if (invitedAt) {
        const inviteTime = new Date(invitedAt).getTime();
        const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
        if (inviteTime > fiveMinutesAgo) {
          return new Response(
            JSON.stringify({
              error: "rate_limited",
              message: "Um convite já foi enviado para este e-mail nos últimos 5 minutos. Aguarde antes de reenviar.",
            }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      }
    }

    const inviteExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const meta = {
      display_name: fullName,
      full_name: fullName,
      role_template_id: roleTemplateId,
      is_estagiario: isEstagiario,
      invite_expires_at: inviteExpiresAt,
    };

    // Garante que o usuário exista ANTES de gerar o link.
    // Motivo (bugfix 15/07/2026): generateLink({type:"invite"}) criava o
    // usuário JÁ com e-mail confirmado — e, com e-mail confirmado, o invite
    // não gera token de verificação pendente (auth.one_time_tokens fica
    // vazio). O link nascia apontando para um token inexistente → otp_expired
    // instantâneo, em qualquer dispositivo, independente de prazo/CORS/redirect.
    // Correção: criar o usuário explicitamente (createUser, e-mail confirmado)
    // e gerar um link de RECOVERY (fluxo desenhado para definir/redefinir
    // senha, que gera token de uso único válido e cai na tela /definir-senha,
    // já tratada em DefinePassword.tsx via evento PASSWORD_RECOVERY).
    let targetUserId: string;
    if (existingUser) {
      targetUserId = existingUser.id;
      await adminClient.auth.admin.updateUserById(existingUser.id, { user_metadata: meta });
    } else {
      const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: meta,
      });
      if (createErr || !created?.user) {
        return new Response(JSON.stringify({ error: "invite_failed", message: createErr?.message ?? "Falha ao criar usuário." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      targetUserId = created.user.id;
    }

    const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo },
    });

    if (linkErr || !linkData?.user) {
      return new Response(JSON.stringify({ error: "invite_failed", message: linkErr?.message ?? "Falha ao gerar convite." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = targetUserId;

    const actionLink = linkData.properties?.action_link ?? redirectTo;
    const inviteFrom = await getRuntimeSecret(adminClient, "INVITE_EMAIL_FROM");
    await sendResendEmail(resendKey, email, fullName, template.display_name, actionLink, inviteFrom);
    const emailMessage = "Convite enviado por e-mail em nome de JurisAI.";

    await adminClient.rpc("apply_employee_profile", {
      p_user_id: userId,
      p_full_name: fullName,
      p_role_template_id: roleTemplateId,
      p_is_estagiario: isEstagiario,
      p_app_role: appRole,
    });

    return new Response(
      JSON.stringify({
        ok: true,
        user_id: userId,
        email_sent: true,
        message: emailMessage,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erro interno";
    return new Response(JSON.stringify({ error: "server_error", message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
