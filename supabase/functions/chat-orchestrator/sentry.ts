import * as Sentry from "https://deno.land/x/sentry/index.mjs";

// ─── Sentry (observabilidade) ────────────────────────────────────────────────
// Init UMA vez, no escopo de módulo. defaultIntegrations:false é OBRIGATÓRIO: o
// SDK Deno NÃO instrumenta Deno.serve, então não há separação de escopo entre
// requests; com as integrações default ligadas, breadcrumbs e contexto VAZAM
// entre execuções reaproveitadas do worker — num pipeline multi-agente isso
// misturaria runs diferentes. Por isso capturamos SEMPRE via reportError
// (withScope), que isola o escopo por run. DSN vem 100% do ambiente (secret).
const SENTRY_DSN = Deno.env.get("SENTRY_DSN");
if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    defaultIntegrations: false,
    environment: Deno.env.get("SB_REGION") ? "production" : "local",
    tracesSampleRate: 0.2,
  });
}

// Captura SEMPRE por aqui (nunca Sentry.captureException direto), com escopo
// isolado por request/run para evitar o vazamento de contexto descrito acima.
export function reportError(e: unknown, ctx: Record<string, unknown> = {}) {
  if (!SENTRY_DSN) return;
  Sentry.withScope((scope) => {
    scope.setTag("region", Deno.env.get("SB_REGION") || "unknown");
    scope.setTag("execution_id", Deno.env.get("SB_EXECUTION_ID") || "unknown");
    scope.setContext("jurisai", ctx); // ex.: { runId, sessionId, stage, model }
    Sentry.captureException(e instanceof Error ? e : new Error(String(e)));
  });
}

export async function flushSentry() {
  if (!SENTRY_DSN) return;
  // Edge Function é efêmera: forçar o envio antes do worker encerrar, senão o
  // evento se perde. 2000ms é o recomendado pela doc oficial.
  try { await Sentry.flush(2000); } catch { /* não bloquear o retorno */ }
}
