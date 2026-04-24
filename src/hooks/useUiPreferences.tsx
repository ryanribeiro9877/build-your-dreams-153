import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * Persists UI layout preferences (sidebar / right panel collapsed state) per user.
 *
 * Strategy:
 *  - Read initial value from localStorage (instant render, no flash).
 *  - On login, fetch from Lovable Cloud — if a server value exists it overrides
 *    local storage so the layout follows the user across devices.
 *  - On every change, write to localStorage and (debounced) to the backend.
 */

const LS_SIDEBAR = "jc-sidebar-collapsed";
const LS_RIGHT = "jc-right-collapsed";

function readLocal(key: string): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(key) === "1";
}
function writeLocal(key: string, value: boolean) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, value ? "1" : "0");
}

export function useUiPreferences() {
  const { user } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsedState] = useState<boolean>(() => readLocal(LS_SIDEBAR));
  const [rightCollapsed, setRightCollapsedState] = useState<boolean>(() => readLocal(LS_RIGHT));
  const [hydrated, setHydrated] = useState(false);
  const saveTimer = useRef<number | null>(null);

  // Hydrate from server on login.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!user?.id) {
        setHydrated(true);
        return;
      }
      const { data, error } = await supabase
        .from("user_ui_preferences")
        .select("sidebar_collapsed, right_collapsed")
        .eq("user_id", user.id)
        .maybeSingle();

      if (cancelled) return;
      if (!error && data) {
        setSidebarCollapsedState(!!data.sidebar_collapsed);
        setRightCollapsedState(!!data.right_collapsed);
        writeLocal(LS_SIDEBAR, !!data.sidebar_collapsed);
        writeLocal(LS_RIGHT, !!data.right_collapsed);
      }
      setHydrated(true);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // Debounced persistence to backend.
  const persist = useCallback(
    (patch: { sidebar_collapsed?: boolean; right_collapsed?: boolean }) => {
      if (!user?.id) return;
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(async () => {
        await supabase
          .from("user_ui_preferences")
          .upsert(
            { user_id: user.id, ...patch },
            { onConflict: "user_id" }
          );
      }, 400);
    },
    [user?.id]
  );

  const setSidebarCollapsed = useCallback(
    (value: boolean | ((prev: boolean) => boolean)) => {
      setSidebarCollapsedState((prev) => {
        const next = typeof value === "function" ? (value as (p: boolean) => boolean)(prev) : value;
        writeLocal(LS_SIDEBAR, next);
        persist({ sidebar_collapsed: next });
        return next;
      });
    },
    [persist]
  );

  const setRightCollapsed = useCallback(
    (value: boolean | ((prev: boolean) => boolean)) => {
      setRightCollapsedState((prev) => {
        const next = typeof value === "function" ? (value as (p: boolean) => boolean)(prev) : value;
        writeLocal(LS_RIGHT, next);
        persist({ right_collapsed: next });
        return next;
      });
    },
    [persist]
  );

  return {
    sidebarCollapsed,
    rightCollapsed,
    setSidebarCollapsed,
    setRightCollapsed,
    hydrated,
  };
}
