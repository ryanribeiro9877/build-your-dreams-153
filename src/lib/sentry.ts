import * as Sentry from "@sentry/react";

export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN;

  if (!dsn) {
    console.warn("[Sentry] VITE_SENTRY_DSN not set — error monitoring disabled.");
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
