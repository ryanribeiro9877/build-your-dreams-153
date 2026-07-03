import * as Sentry from "@sentry/react";

export function initSentry() {
  // Kill-switch explícito: VITE_SENTRY_ENABLED="false" desliga o Sentry SEM
  // remover a DSN. Útil quando a DSN atual está inválida/recusada (403 no ingest,
  // que polui o console e mascara erros reais) e não dá para rotacioná-la agora.
  if (String(import.meta.env.VITE_SENTRY_ENABLED).toLowerCase() === "false") {
    console.info("[Sentry] desativado por VITE_SENTRY_ENABLED=false.");
    return;
  }

  const dsn = import.meta.env.VITE_SENTRY_DSN;

  if (!dsn) {
    console.warn("[Sentry] VITE_SENTRY_DSN not set — error monitoring disabled.");
    return;
  }

  // Sanidade da DSN: uma DSN malformada faz o SDK tentar postar e tomar erro de
  // rede/403 no console. Formato válido: https://<key>@<host>/<project_id>.
  if (!/^https:\/\/[^@]+@[^/]+\/\d+$/.test(String(dsn))) {
    console.warn("[Sentry] VITE_SENTRY_DSN com formato inválido — monitoramento desativado.");
    return;
  }

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE, // "development" | "production"
    integrations: [
      Sentry.browserTracingIntegration(),
      // LGPD/sigilo: sistema jurídico. maskAllText + blockAllMedia são OBRIGATÓRIOS
      // para o replay nunca capturar dados de clientes/petições em texto ou mídia.
      // NÃO reduzir esse mascaramento.
      Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true }),
    ],
    // Performance: amostra menor em produção para não estourar cota.
    tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0,
    // Session Replay: 0 em condições normais, 100% quando houve erro.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
  });
}
