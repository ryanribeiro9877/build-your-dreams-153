/** Stable, anonymous session id (lives until the tab closes). */
export function getSessionId(): string {
  if (typeof window === "undefined") return "ssr";
  const KEY = "lf_session_id";
  let id = sessionStorage.getItem(KEY);
  if (!id) {
    id = `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem(KEY, id);
  }
  return id;
}
