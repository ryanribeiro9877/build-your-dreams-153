import { supabase } from "@/integrations/supabase/client";

/**
 * In-app UI tracking. Records lightweight interactions with the operating
 * surface (sidebar/right panel toggles, nav clicks, tooltip opens, keyboard
 * shortcuts) so we can analyze where users get stuck and what impacts
 * conversion. Fails silently — never breaks the UI.
 *
 * Failures (RLS rejections, network errors, payload validation) are captured
 * into an in-memory ring buffer so the admin debug panel can surface them.
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
  surface?: string;
  target_id?: string;
  target_label?: string;
  collapsed?: boolean;
  source?: "click" | "keyboard" | "auto";
  [key: string]: string | number | boolean | undefined;
}

export type RejectionCategory = "rls" | "payload" | "network" | "unknown";

export interface RejectedEvent {
  at: string; // ISO timestamp
  name: string;
  reason: string;
  code?: string;
  category: RejectionCategory;
  payload: Record<string, unknown>;
}

const REJECT_BUFFER_MAX = 50;
const REJECT_KEY = "lf_ui_rejected_events";
const COUNT_KEY = "lf_ui_rejected_count";
const TTL_KEY = "lf_ui_rejected_ttl_hours";
const DEFAULT_TTL_HOURS = 6;

export function getRejectedTtlHours(): number {
  if (typeof window === "undefined") return DEFAULT_TTL_HOURS;
  const v = Number(sessionStorage.getItem(TTL_KEY));
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_TTL_HOURS;
}

export function setRejectedTtlHours(hours: number) {
  if (typeof window === "undefined") return;
  if (!Number.isFinite(hours) || hours <= 0) return;
  sessionStorage.setItem(TTL_KEY, String(hours));
  // Trigger pruning on next read
  pruneExpired();
  notifyDebugListeners();
}

export function classifyRejection(reason: string, code?: string): RejectionCategory {
  const r = (reason || "").toLowerCase();
  if (code === "42501" || r.includes("row-level security") || r.includes("rls")) return "rls";
  if (
    code === "23514" || code === "23502" || code === "23505" ||
    r.includes("violates check") || r.includes("violates not-null") ||
    r.includes("invalid input") || r.includes("payload") || r.includes("constraint")
  ) return "payload";
  if (
    r.includes("failed to fetch") || r.includes("network") || r.includes("timeout") ||
    r.includes("offline") || r.includes("aborted")
  ) return "network";
  return "unknown";
}

function pruneExpired(): RejectedEvent[] {
  if (typeof window === "undefined") return [];
  const ttlMs = getRejectedTtlHours() * 60 * 60 * 1000;
  const cutoff = Date.now() - ttlMs;
  let buf: RejectedEvent[] = [];
  try {
    buf = JSON.parse(sessionStorage.getItem(REJECT_KEY) ?? "[]");
  } catch {
    buf = [];
  }
  const kept = buf.filter((e) => {
    const t = new Date(e.at).getTime();
    return Number.isFinite(t) && t >= cutoff;
  });
  if (kept.length !== buf.length) {
    try {
      sessionStorage.setItem(REJECT_KEY, JSON.stringify(kept));
      sessionStorage.setItem(COUNT_KEY, String(kept.length));
    } catch {
      // ignore
    }
  }
  return kept;
}

function readBuffer(): RejectedEvent[] {
  if (typeof window === "undefined") return [];
  // Prune on every read so stale entries silently disappear.
  return pruneExpired();
}

function writeBuffer(buf: RejectedEvent[]) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(REJECT_KEY, JSON.stringify(buf.slice(-REJECT_BUFFER_MAX)));
  } catch {
    // ignore storage quota
  }
}

function bumpCount() {
  if (typeof window === "undefined") return;
  const n = Number(sessionStorage.getItem(COUNT_KEY) ?? "0") + 1;
  sessionStorage.setItem(COUNT_KEY, String(n));
}

export function getRejectedEvents(): RejectedEvent[] {
  return readBuffer();
}

export function getRejectedCount(): number {
  if (typeof window === "undefined") return 0;
  return Number(sessionStorage.getItem(COUNT_KEY) ?? "0");
}

export function clearRejectedEvents() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(REJECT_KEY);
  sessionStorage.removeItem(COUNT_KEY);
  notifyDebugListeners();
}

type DebugListener = () => void;
const listeners = new Set<DebugListener>();
export function onDebugChange(fn: DebugListener) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function notifyDebugListeners() {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      // noop
    }
  });
}

function recordFailure(name: string, payload: Record<string, unknown>, reason: string, code?: string) {
  const entry: RejectedEvent = {
    at: new Date().toISOString(),
    name,
    reason,
    code,
    payload,
  };
  const buf = readBuffer();
  buf.push(entry);
  writeBuffer(buf);
  bumpCount();
  notifyDebugListeners();
  if (typeof window !== "undefined" && (import.meta as ImportMeta & { env: { DEV?: boolean } }).env?.DEV) {
    // eslint-disable-next-line no-console
    console.warn("[ui-track:rejected]", name, reason, entry);
  }
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

    if ((import.meta as ImportMeta & { env: { DEV?: boolean } }).env?.DEV) {
      // eslint-disable-next-line no-console
      console.debug("[ui-track]", name, event);
    }

    const { error } = await (
      supabase.from as unknown as (t: string) => {
        insert: (v: unknown) => Promise<{ error: { message: string; code?: string } | null }>;
      }
    )("ui_events").insert(event);

    if (error) {
      recordFailure(name, event as unknown as Record<string, unknown>, error.message, error.code);
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    recordFailure(name, { ...payload, event_name: name }, reason);
  }
}
