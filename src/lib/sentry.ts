import * as Sentry from "@sentry/react";

export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN;

  if (!dsn) {
    console.warn("[Sentry] VITE_SENTRY_DSN not set — error monitoring disabled.");
    return;
  }

  Sentry.init({
    dsn,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration(),
    ],
    // Capture 20% of transactions for performance monitoring
    tracesSampleRate: 0.2,
    // Capture 10% of sessions for replay
    replaysSessionSampleRate: 0.1,
    // Always capture replays when an error occurs
    replaysOnErrorSampleRate: 1.0,
    // Send 100% of errors
    sampleRate: 1.0,
    environment: import.meta.env.MODE,
  });
}
