import { supabase } from "@/integrations/supabase/client";

/**
 * Lightweight tracking helper for landing page CTA clicks and conversions.
 * Persists each event to the `landing_events` table on Lovable Cloud.
 *
 * Usage:
 *   import { trackEvent } from "@/lib/tracking";
 *   trackEvent("cta_click", { cta_id: "hero_primary", section: "hero" });
 *
 * Privacy notes:
 *  - We do NOT store personally identifiable data here. Just the event name,
 *    the CTA / section context, the referrer, the page path, and a session id
 *    that lives only in sessionStorage (resets when the tab closes).
 */

export type TrackEventName =
  | "page_view"
  | "cta_click"
  | "cta_conversion"
  | "section_view"
  | "faq_open";

export interface TrackEventPayload {
  cta_id?: string;
  cta_label?: string;
  section?: string;
  destination?: string;
  variant?: string;
  [key: string]: string | number | boolean | undefined;
}

/** Stable, anonymous session id (lives until the tab closes). */
function getSessionId(): string {
  if (typeof window === "undefined") return "ssr";
  const KEY = "lf_session_id";
  let id = sessionStorage.getItem(KEY);
  if (!id) {
    id = `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem(KEY, id);
  }
  return id;
}

/** Track a single event. Fails silently on network/database errors. */
export async function trackEvent(name: TrackEventName, payload: TrackEventPayload = {}) {
  try {
    if (typeof window === "undefined") return;

    const event = {
      event_name: name,
      session_id: getSessionId(),
      page_path: window.location.pathname,
      referrer: document.referrer || null,
      cta_id: payload.cta_id ?? null,
      cta_label: payload.cta_label ?? null,
      section: payload.section ?? null,
      metadata: payload as Record<string, unknown>,
    };

    // Console echo helps QA and debugging in development.
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.debug("[track]", name, event);
    }

    // Fire-and-forget. We do not await the result on the user's path.
    // Cast required until generated types include the new table after migration sync.
    void (supabase.from as unknown as (t: string) => { insert: (v: unknown) => Promise<unknown> })(
      "landing_events"
    ).insert(event);
  } catch {
    // Tracking must never break the UI.
  }
}

/**
 * Helper for CTA clicks. Wraps trackEvent with a sensible default name
 * so consumers can write `onCtaClick("hero_primary", "Assumir o comando", "hero")`.
 */
export function onCtaClick(
  ctaId: string,
  ctaLabel: string,
  section: string,
  destination?: string
) {
  trackEvent("cta_click", {
    cta_id: ctaId,
    cta_label: ctaLabel,
    section,
    destination,
  });
}
