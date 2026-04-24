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
const SAMPLE_RATE_KEY = "lf_ui_sample_rate";

/**
 * Schema version for exported debug payloads. Bump whenever the JSON shape
 * (top-level keys, bucket fields, rejected event fields) changes so that
 * downstream consumers can detect incompatible exports.
 */
export const EXPORT_SCHEMA_VERSION = "1.0.0";

/**
 * Deterministic test hooks. In production these are no-ops; tests can inject
 * a seeded RNG (`__setRandomForTests`) or force every event through sampling
 * (`__setForceCapture`) so flaky `Math.random` paths become deterministic.
 */
let __rng: (() => number) | null = null;
let __forceCapture = false;
export function __setRandomForTests(fn: (() => number) | null) {
  __rng = fn;
}
export function __setForceCapture(force: boolean) {
  __forceCapture = force;
}
function rand(): number {
  return __rng ? __rng() : Math.random();
}

/**
 * Sampling rate (0..1). 1 = capture all events, 0 = capture none.
 * Persisted in localStorage so it survives reloads while admins iterate.
 */
export function getSampleRate(): number {
  if (typeof window === "undefined") return 1;
  const raw = localStorage.getItem(SAMPLE_RATE_KEY);
  if (raw === null || raw === "") return 1;
  const v = Number(raw);
  if (!Number.isFinite(v) || v < 0 || v > 1) return 1;
  return v;
}

export function setSampleRate(rate: number) {
  if (typeof window === "undefined") return;
  if (!Number.isFinite(rate)) return;
  const clamped = Math.max(0, Math.min(1, rate));
  localStorage.setItem(SAMPLE_RATE_KEY, String(clamped));
  notifyDebugListeners();
}

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
    category: classifyRejection(reason, code),
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

/**
 * Aggregates rejected events by `category` and `code`, returning counters and
 * the most recent example for each bucket. Used by the admin debug panel.
 */
export interface RejectionBucket {
  key: string;
  category: RejectionCategory;
  code?: string;
  reason: string;
  count: number;
  lastAt: string;
  lastPayload: Record<string, unknown>;
}

export function getRejectionBuckets(): RejectionBucket[] {
  const events = readBuffer();
  const map = new Map<string, RejectionBucket>();
  for (const e of events) {
    const key = `${e.category}::${e.code ?? "-"}::${e.reason.slice(0, 80)}`;
    const cur = map.get(key);
    if (!cur) {
      map.set(key, {
        key,
        category: e.category,
        code: e.code,
        reason: e.reason,
        count: 1,
        lastAt: e.at,
        lastPayload: e.payload,
      });
    } else {
      cur.count += 1;
      if (new Date(e.at).getTime() > new Date(cur.lastAt).getTime()) {
        cur.lastAt = e.at;
        cur.lastPayload = e.payload;
      }
    }
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count);
}

/**
 * Health-check: inserts a synthetic `nav_click` event and reports whether
 * the database accepted it. Does NOT pollute the rejected buffer on success.
 */
export interface HealthCheckResult {
  ok: boolean;
  at: string;
  reason?: string;
  code?: string;
  category?: RejectionCategory;
  durationMs: number;
}

export async function runTrackingHealthCheck(): Promise<HealthCheckResult> {
  const startedAt = new Date().toISOString();
  const t0 = performance.now();
  try {
    const { data: auth } = await supabase.auth.getUser();
    const event = {
      event_name: "nav_click" as const,
      user_id: auth?.user?.id ?? null,
      session_id: getSessionId(),
      surface: "healthcheck",
      target_id: "healthcheck",
      target_label: "tracking_healthcheck",
      metadata: { healthcheck: true, at: startedAt } as Record<string, unknown>,
    };
    const { error } = await (
      supabase.from as unknown as (t: string) => {
        insert: (v: unknown) => Promise<{ error: { message: string; code?: string } | null }>;
      }
    )("ui_events").insert(event);
    const durationMs = Math.round(performance.now() - t0);
    if (error) {
      return {
        ok: false,
        at: startedAt,
        reason: error.message,
        code: error.code,
        category: classifyRejection(error.message, error.code),
        durationMs,
      };
    }
    return { ok: true, at: startedAt, durationMs };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      at: startedAt,
      reason,
      category: classifyRejection(reason),
      durationMs: Math.round(performance.now() - t0),
    };
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

    // Apply sampling — admins can throttle volume while testing features.
    const rate = getSampleRate();
    if (rate < 1 && Math.random() >= rate) return;

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
