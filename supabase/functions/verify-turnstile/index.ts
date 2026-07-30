import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getRuntimeSecret } from "../_shared/runtimeSecrets.ts";

import { corsHeaders } from "../_shared/cors.ts";

/**
 * Traduz os `error-codes` do siteverify do Cloudflare para uma frase que aponta o
 * que consertar. Códigos documentados em
 * https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 *
 * O caso que mais dói aqui é `invalid-input-response` com o widget mostrando
 * "Sucesso!": significa que o token é válido, mas NÃO pertence a este secret —
 * site key e secret são de widgets diferentes. Acontece em cheio quando o front
 * roda com a site key DUMMY de teste (1x00000000000000000000AA, que sempre passa
 * na hora, sem desafio) e a edge tem o secret REAL: local quebra, prod funciona.
 */
function explicarRecusa(codes: string[]): string {
  if (codes.includes("invalid-input-secret") || codes.includes("missing-input-secret")) {
    return "O TURNSTILE_SECRET_KEY da edge não é um secret válido do Cloudflare. Confira o secret do widget no painel.";
  }
  if (codes.includes("invalid-input-response")) {
    return "O token não pertence a este secret: a site key do front e o secret da edge são de widgets diferentes (ou a site key é a dummy de teste 1x… e o secret é real). Os dois têm de sair do MESMO widget no painel do Cloudflare.";
  }
  if (codes.includes("timeout-or-duplicate")) {
    return "O token expirou (vale ~5 minutos) ou já havia sido usado. Recarregue o captcha e envie de novo.";
  }
  if (codes.includes("missing-input-response")) {
    return "Nenhum token do captcha chegou ao servidor.";
  }
  if (codes.includes("bad-request")) {
    return "O Cloudflare recusou o formato da requisição de verificação.";
  }
  if (codes.includes("internal-error")) {
    return "Erro interno do Cloudflare ao validar. Tente novamente.";
  }
  return codes.length
    ? `O Cloudflare recusou o captcha (${codes.join(", ")}).`
    : "O Cloudflare recusou o captcha sem informar o motivo.";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceKey);
    const secret = await getRuntimeSecret(adminClient, "TURNSTILE_SECRET_KEY");
    if (!secret) {
      return new Response(
        JSON.stringify({ error: "not_configured", message: "TURNSTILE_SECRET_KEY não configurada." }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { token } = (await req.json()) as { token?: string };
    if (!token?.trim()) {
      // Mesmo status 400 da recusa do Cloudflare, mas com `motivo` próprio — era
      // exatamente a ambiguidade que fazia "400" não dizer nada.
      return new Response(JSON.stringify({
        ok: false, error: "missing_token", error_codes: ["missing-input-response"],
        motivo: "O captcha não enviou token. Resolva o captcha antes de enviar.",
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const verifyRes = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret, response: token }),
    });

    const result = await verifyRes.json();
    const ok = Boolean(result.success);
    // O Cloudflare diz POR QUE recusou em `error-codes`. Antes esse campo era
    // descartado e a edge devolvia só {ok:false}: os dois 400 possíveis (token
    // ausente e recusa do Cloudflare) ficavam indistinguíveis do lado de fora, e a
    // investigação de 30/07 teve de DEDUZIR a causa em vez de ler.
    const errorCodes: string[] = Array.isArray(result["error-codes"]) ? result["error-codes"] : [];

    if (!ok) {
      // Log server-side. `secret_de_teste` responde "o secret é uma chave dummy do
      // Cloudflare?" — a pergunta que resolve o caso — SEM emitir nenhum pedaço da
      // chave. Nunca logar o secret, nem prefixo dele.
      console.error("[verify-turnstile] recusado pelo Cloudflare", {
        error_codes: errorCodes,
        hostname: result.hostname ?? null,
        challenge_ts: result.challenge_ts ?? null,
        secret_de_teste: /^[123]x/.test(secret),
      });
    }

    return new Response(JSON.stringify({ ok, error_codes: errorCodes, motivo: ok ? null : explicarRecusa(errorCodes) }), {
      status: ok ? 200 : 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erro interno";
    return new Response(JSON.stringify({ ok: false, error: "server_error", message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
