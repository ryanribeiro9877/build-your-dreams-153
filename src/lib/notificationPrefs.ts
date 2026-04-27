// Local user preferences for bottleneck/overdue notifications.
// Stored in localStorage to keep this purely frontend.

export type SeverityLevel = "critical" | "warning" | "info";
export type UrgencyFilter = "critical" | "high" | "medium" | "all";

const KEYS = {
  urgency: "notif:urgencyFilter",
  groupSize: "notif:groupSize",
  mutes: "notif:mutedTasks", // { [taskId]: expiresAtMs }
};

export function getUrgencyFilter(): UrgencyFilter {
  const v = localStorage.getItem(KEYS.urgency);
  return (v as UrgencyFilter) || "all";
}
export function setUrgencyFilter(v: UrgencyFilter) {
  localStorage.setItem(KEYS.urgency, v);
  window.dispatchEvent(new CustomEvent("notif-prefs-changed"));
}

export function getGroupSize(): number {
  const v = parseInt(localStorage.getItem(KEYS.groupSize) || "5", 10);
  return Number.isFinite(v) && v > 0 ? v : 5;
}
export function setGroupSize(n: number) {
  localStorage.setItem(KEYS.groupSize, String(n));
  window.dispatchEvent(new CustomEvent("notif-prefs-changed"));
}

function readMutes(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(KEYS.mutes) || "{}");
  } catch {
    return {};
  }
}
function writeMutes(m: Record<string, number>) {
  localStorage.setItem(KEYS.mutes, JSON.stringify(m));
  window.dispatchEvent(new CustomEvent("notif-prefs-changed"));
}

export function muteTask(taskId: string, durationMs = 60 * 60 * 1000) {
  const m = readMutes();
  m[taskId] = Date.now() + durationMs;
  writeMutes(m);
}
export function unmuteTask(taskId: string) {
  const m = readMutes();
  delete m[taskId];
  writeMutes(m);
}
export function isMuted(taskId: string): boolean {
  const m = readMutes();
  const exp = m[taskId];
  if (!exp) return false;
  if (exp < Date.now()) {
    delete m[taskId];
    writeMutes(m);
    return false;
  }
  return true;
}
export function listMutes(): Array<{ taskId: string; expiresAt: number }> {
  const m = readMutes();
  return Object.entries(m)
    .filter(([, exp]) => exp > Date.now())
    .map(([taskId, expiresAt]) => ({ taskId, expiresAt }));
}

// Map task priority -> urgency rank (higher = more urgent)
const PRIORITY_RANK: Record<string, number> = {
  critical: 3,
  high: 2,
  medium: 1,
  low: 0,
};
const FILTER_MIN_RANK: Record<UrgencyFilter, number> = {
  critical: 3,
  high: 2,
  medium: 1,
  all: 0,
};

export function passesUrgencyFilter(priority?: string | null, filter?: UrgencyFilter): boolean {
  const f = filter ?? getUrgencyFilter();
  const rank = PRIORITY_RANK[priority || "medium"] ?? 1;
  return rank >= FILTER_MIN_RANK[f];
}
