import { supabase } from "@/integrations/supabase/client";

/**
 * In-app UI tracking. Records lightweight interactions with the operating
 * surface (sidebar/right panel toggles, nav clicks, tooltip opens, keyboard
 * shortcuts) so we can analyze where users get stuck and what impacts
 * conversion. Fails silently — never breaks the UI.
 *
 * Keep the event vocabulary in sync with the RLS policy on `ui_events`.
 */

export type UiEventName =
  | "sidebar_toggle"
  | "right_panel_toggle"
  | "nav_click"
  | "tooltip_open"
  | "shortcut_used"
  | "tab_navigate"
  | "key_activate";

export interface UiEventPayload {
  surface?: string; // "left_sidebar" | "right_panel" | "topbar" | ...
  target_id?: string; // e.g. "civel", "perfil", "ctrl+b"
  target_label?: string;
  collapsed?: boolean;
  source?: "click" | "keyboard" | "auto";
  [key: string]: string | number | boolean | undefined;
}

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

export async function trackUiEvent(name: UiEventName, payload: UiEventPayload = {}) {
  try {
    if (typeof window === "undefined") return;

    const { data: auth } = await supabase.auth.getUser();
    const event = {
      event_name: name,
      user_id: auth?.user?.id ?? null,
      session_id: getSessionId(),
      surface: payload.surface ?? null,
      target_id: payload.target_id ?? null,
      target_label: payload.target_label ?? null,
      metadata: payload as Record<string, unknown>,
    };

    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.debug("[ui-track]", name, event);
    }

    void (supabase.from as unknown as (t: string) => { insert: (v: unknown) => Promise<unknown> })(
      "ui_events"
    ).insert(event);
  } catch {
    // Tracking must never break the UI.
  }
}
