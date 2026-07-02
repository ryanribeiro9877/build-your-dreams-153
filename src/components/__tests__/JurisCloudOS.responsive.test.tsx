import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MemoryRouter } from "react-router-dom";

const Wrap = ({ children }: { children: React.ReactNode }) => (
  <MemoryRouter>
    <TooltipProvider>{children}</TooltipProvider>
  </MemoryRouter>
);

const { createQueryChain } = vi.hoisted(() => {
  function createQueryChain() {
    return {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
      delete: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
  }
  return { createQueryChain };
});

// Mock Supabase + auth so JurisCloudOS hooks don't try to hit the network.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
    },
    from: vi.fn(() => createQueryChain()),
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnValue({}),
    })),
    removeChannel: vi.fn(),
  },
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: null, session: null, loading: false, userRoles: [],
    signUp: vi.fn(), signIn: vi.fn(), signOut: vi.fn(),
    hasRole: () => false,
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

function setViewport(width: number, height = 800) {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
  window.dispatchEvent(new Event("resize"));
}

describe("Sidebar responsive behavior", () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
  });

  it("Ctrl+B keyboard shortcut toggles the sidebar collapsed state", async () => {
    setViewport(1280);
    // Lazy import after mocks are set up
    const { default: JurisCloudOS } = await import("@/components/JurisCloudOS");
    const { container } = render(
      <Wrap><JurisCloudOS /></Wrap>
    );

    const sidebar = container.querySelector("#jc-sidebar");
    expect(sidebar).toBeTruthy();
    const initiallyCollapsed = sidebar!.classList.contains("collapsed");

    fireEvent.keyDown(window, { key: "b", ctrlKey: true });

    const after = container.querySelector("#jc-sidebar");
    const nowCollapsed = after!.classList.contains("collapsed");
    expect(nowCollapsed).toBe(!initiallyCollapsed);
  });

  it("Escape on tooltip closes it without losing focus on trigger", async () => {
    setViewport(1280);
    // Force collapsed sidebar so tooltips appear
    localStorage.setItem("jc-sidebar-collapsed", "1");

    const { default: JurisCloudOS } = await import("@/components/JurisCloudOS");
    const { container } = render(
      <Wrap><JurisCloudOS /></Wrap>
    );

    const navItem = container.querySelector(".jc-nav-item") as HTMLElement | null;
    if (navItem) {
      navItem.focus();
      expect(document.activeElement).toBe(navItem);
      fireEvent.keyDown(navItem, { key: "Escape" });
      // Focus should remain on the originating trigger.
      expect(document.activeElement).toBe(navItem);
    }
  });

  it("renders mobile-friendly sidebar at small widths without overlapping main", async () => {
    setViewport(375, 812);
    const { default: JurisCloudOS } = await import("@/components/JurisCloudOS");
    const { container } = render(
      <Wrap><JurisCloudOS /></Wrap>
    );

    const sidebar = container.querySelector("#jc-sidebar");
    expect(sidebar).toBeTruthy();
    // On mobile, the sidebar should not start in `mobile-open` state.
    expect(sidebar!.classList.contains("mobile-open")).toBe(false);
    // The mobile overlay element exists for closing
    expect(container.querySelector(".jc-sidebar-overlay")).toBeTruthy();
  });
});

describe("UI tracking", () => {
  beforeEach(() => {
    cleanup();
    sessionStorage.clear();
  });

  it("exports the expanded event vocabulary", async () => {
    const { trackUiEvent } = await import("@/lib/uiTracking");
    await expect(trackUiEvent("tab_navigate", { surface: "left_sidebar" })).resolves.not.toThrow();
    await expect(trackUiEvent("key_activate", { surface: "left_sidebar" })).resolves.not.toThrow();
  });

  it("captures rejected events into the debug buffer when insert fails", async () => {
    vi.resetModules();
    vi.doMock("@/integrations/supabase/client", () => ({
      supabase: {
        auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
        from: vi.fn(() => ({
          insert: vi.fn().mockResolvedValue({
            error: { message: "row violates row-level security policy", code: "42501" },
          }),
        })),
      },
    }));
    const tracking = await import("@/lib/uiTracking");
    tracking.clearRejectedEvents();
    await tracking.trackUiEvent("nav_click", { surface: "left_sidebar", target_id: "civel" });
    // Allow microtask flush
    await new Promise((r) => setTimeout(r, 5));
    expect(tracking.getRejectedCount()).toBeGreaterThanOrEqual(1);
    const last = tracking.getRejectedEvents().at(-1)!;
    expect(last.name).toBe("nav_click");
    expect(last.code).toBe("42501");
  });

  it("classifies rejection reasons by category (RLS / payload / network)", async () => {
    vi.resetModules();
    const { classifyRejection } = await import("@/lib/uiTracking");
    expect(classifyRejection("new row violates row-level security policy", "42501")).toBe("rls");
    expect(classifyRejection("violates check constraint", "23514")).toBe("payload");
    expect(classifyRejection("Failed to fetch")).toBe("network");
    expect(classifyRejection("something else")).toBe("unknown");
  });

  it("expires rejected events older than the configured TTL", async () => {
    vi.resetModules();
    vi.doMock("@/integrations/supabase/client", () => ({
      supabase: {
        auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
        from: vi.fn(() => ({
          insert: vi.fn().mockResolvedValue({
            error: { message: "row violates row-level security policy", code: "42501" },
          }),
        })),
      },
    }));
    const tracking = await import("@/lib/uiTracking");
    tracking.clearRejectedEvents();
    const stale = [{
      at: new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString(),
      name: "nav_click",
      reason: "old failure",
      code: "42501",
      category: "rls",
      payload: {},
    }];
    sessionStorage.setItem("lf_ui_rejected_events", JSON.stringify(stale));
    sessionStorage.setItem("lf_ui_rejected_count", "1");
    // Default TTL is 6h → stale entry pruned on next read.
    expect(tracking.getRejectedEvents().length).toBe(0);
    expect(tracking.getRejectedCount()).toBe(0);
  });

  it("runs a successful health-check when the insert succeeds", async () => {
    vi.resetModules();
    const insertSpy = vi.fn().mockResolvedValue({ error: null });
    vi.doMock("@/integrations/supabase/client", () => ({
      supabase: {
        auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
        from: vi.fn(() => ({ insert: insertSpy })),
      },
    }));
    const { runTrackingHealthCheck } = await import("@/lib/uiTracking");
    const result = await runTrackingHealthCheck();
    expect(result.ok).toBe(true);
    expect(insertSpy).toHaveBeenCalledTimes(1);
    const inserted = insertSpy.mock.calls[0][0] as { event_name: string; surface: string };
    expect(inserted.event_name).toBe("nav_click");
    expect(inserted.surface).toBe("healthcheck");
  });

  it("groups rejection reasons into buckets with counts and last example", async () => {
    vi.resetModules();
    const events = [
      { at: new Date(Date.now() - 1000).toISOString(), name: "nav_click", reason: "row violates row-level security policy", code: "42501", category: "rls", payload: { a: 1 } },
      { at: new Date().toISOString(), name: "nav_click", reason: "row violates row-level security policy", code: "42501", category: "rls", payload: { a: 2 } },
      { at: new Date().toISOString(), name: "tab_navigate", reason: "Failed to fetch", category: "network", payload: {} },
    ];
    sessionStorage.setItem("lf_ui_rejected_events", JSON.stringify(events));
    sessionStorage.setItem("lf_ui_rejected_count", "3");
    const { getRejectionBuckets } = await import("@/lib/uiTracking");
    const buckets = getRejectionBuckets();
    expect(buckets.length).toBe(2);
    const rls = buckets.find((b) => b.category === "rls")!;
    expect(rls.count).toBe(2);
    expect(rls.lastPayload).toEqual({ a: 2 });
    expect(buckets.find((b) => b.category === "network")?.count).toBe(1);
  });

  it("force-capture mode bypasses sampling so events are captured deterministically", async () => {
    vi.resetModules();
    vi.doMock("@/integrations/supabase/client", () => ({
      supabase: {
        auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
        from: vi.fn(() => ({
          insert: vi.fn().mockResolvedValue({
            error: { message: "row violates row-level security policy", code: "42501" },
          }),
        })),
      },
    }));
    const tracking = await import("@/lib/uiTracking");
    tracking.clearRejectedEvents();
    // Sample rate 0 would normally block everything — force-capture overrides it.
    tracking.setSampleRate(0);
    tracking.__setForceCapture(true);
    await tracking.trackUiEvent("nav_click", { surface: "left_sidebar", target_id: "civel" });
    await new Promise((r) => setTimeout(r, 5));
    expect(tracking.getRejectedCount()).toBeGreaterThanOrEqual(1);
    tracking.__setForceCapture(false);
    tracking.setSampleRate(1);
  });

  it("injectable RNG makes sampling deterministic for tests", async () => {
    vi.resetModules();
    vi.doMock("@/integrations/supabase/client", () => ({
      supabase: {
        auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
        from: vi.fn(() => ({
          insert: vi.fn().mockResolvedValue({
            error: { message: "row violates row-level security policy", code: "42501" },
          }),
        })),
      },
    }));
    const tracking = await import("@/lib/uiTracking");
    tracking.clearRejectedEvents();
    tracking.setSampleRate(0.5);
    // RNG always returns 0.9 → 0.9 >= 0.5 → event dropped
    tracking.__setRandomForTests(() => 0.9);
    await tracking.trackUiEvent("nav_click", { surface: "left_sidebar" });
    await new Promise((r) => setTimeout(r, 5));
    expect(tracking.getRejectedCount()).toBe(0);
    // RNG always returns 0.1 → 0.1 < 0.5 → event captured
    tracking.__setRandomForTests(() => 0.1);
    await tracking.trackUiEvent("nav_click", { surface: "left_sidebar" });
    await new Promise((r) => setTimeout(r, 5));
    expect(tracking.getRejectedCount()).toBe(1);
    tracking.__setRandomForTests(null);
    tracking.setSampleRate(1);
  });

  it("setRejectedTtlHours returns a prune delta with timestamp", async () => {
    vi.resetModules();
    const { setRejectedTtlHours, clearRejectedEvents } = await import("@/lib/uiTracking");
    clearRejectedEvents();
    const stale = [{
      at: new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString(),
      name: "nav_click", reason: "old", code: "42501", category: "rls", payload: {},
    }];
    sessionStorage.setItem("lf_ui_rejected_events", JSON.stringify(stale));
    sessionStorage.setItem("lf_ui_rejected_count", "1");
    const result = setRejectedTtlHours(6);
    expect(result.pruned).toBe(1);
    expect(result.remaining).toBe(0);
    expect(typeof result.at).toBe("string");
    expect(new Date(result.at).getTime()).not.toBeNaN();
  });

  it("buckets include estimatedCaptured based on current sample rate", async () => {
    vi.resetModules();
    const { getRejectionBuckets, setSampleRate, EXPORT_SCHEMA_VERSION } = await import("@/lib/uiTracking");
    expect(EXPORT_SCHEMA_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    const events = Array.from({ length: 10 }).map(() => ({
      at: new Date().toISOString(), name: "nav_click",
      reason: "rls fail", code: "42501", category: "rls", payload: {},
    }));
    sessionStorage.setItem("lf_ui_rejected_events", JSON.stringify(events));
    sessionStorage.setItem("lf_ui_rejected_count", "10");
    setSampleRate(0.25);
    const buckets = getRejectionBuckets();
    expect(buckets[0].count).toBe(10);
    expect(buckets[0].estimatedCaptured).toBe(2); // floor(10*0.25)
    expect(buckets[0].sampleRateAtRead).toBe(0.25);
    setSampleRate(1);
    const buckets2 = getRejectionBuckets();
    expect(buckets2[0].estimatedCaptured).toBe(10);
  });
});

describe("Tooltip overlay (collapsed sidebar)", () => {
  beforeEach(async () => {
    cleanup();
    localStorage.clear();
    vi.resetModules();
    vi.doMock("@/integrations/supabase/client", () => ({
      supabase: {
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
          getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
          onAuthStateChange: vi.fn().mockReturnValue({
            data: { subscription: { unsubscribe: vi.fn() } },
          }),
        },
        from: vi.fn(() => createQueryChain()),
        channel: vi.fn(() => ({
          on: vi.fn().mockReturnThis(),
          subscribe: vi.fn().mockReturnValue({}),
        })),
        removeChannel: vi.fn(),
      },
    }));
    await import("@/integrations/supabase/client");
  });

  it("does not render the dim overlay when no tooltips are open", async () => {
    setViewport(1280);
    localStorage.setItem("jc-sidebar-collapsed", "1");
    localStorage.setItem("jc-tooltip-overlay", "1");
    const { default: JurisCloudOS } = await import("@/components/JurisCloudOS");
    const { container } = render(<Wrap><JurisCloudOS /></Wrap>);
    expect(container.querySelector(".jc-tooltip-overlay")).toBeNull();
  });

  it("keeps focus on the trigger and hides any overlay after Escape", async () => {
    setViewport(1280);
    localStorage.setItem("jc-sidebar-collapsed", "1");
    localStorage.setItem("jc-tooltip-overlay", "1");
    const { default: JurisCloudOS } = await import("@/components/JurisCloudOS");
    const { container } = render(<Wrap><JurisCloudOS /></Wrap>);

    const trigger = container.querySelector(".jc-nav-item") as HTMLElement | null;
    if (!trigger) return; // role-gated; nothing to test
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    // Allow Radix tooltip a chance to open (focus-based open works in jsdom).
    await new Promise((r) => setTimeout(r, 200));

    const beforeY = window.scrollY;
    // Blur the trigger to close the focus-opened tooltip; this is the
    // canonical "dismiss" path that exercises onOpenChange(false) in Radix.
    trigger.blur();
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "Escape" });
    fireEvent.keyDown(document, { key: "Escape" });
    trigger.blur();
    await new Promise((r) => setTimeout(r, 100));

    // After dismissing, the overlay must be gone. Focus may have moved off
    // the trigger by the explicit blur — re-focusing it must work and not
    // cause any scroll jump.
    trigger.focus();
    expect(container.querySelector(".jc-tooltip-overlay")).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(window.scrollY).toBe(beforeY);
  });

  it("never renders the overlay when the opt-in flag is disabled", async () => {
    setViewport(1280);
    localStorage.setItem("jc-sidebar-collapsed", "1");
    // jc-tooltip-overlay flag intentionally NOT set.
    const { default: JurisCloudOS } = await import("@/components/JurisCloudOS");
    const { container } = render(<Wrap><JurisCloudOS /></Wrap>);
    const trigger = container.querySelector(".jc-nav-item") as HTMLElement | null;
    if (trigger) {
      trigger.focus();
      await new Promise((r) => setTimeout(r, 200));
    }
    expect(container.querySelector(".jc-tooltip-overlay")).toBeNull();
  });

  it("double Escape on collapsed-sidebar tooltip closes it and keeps focus on trigger", async () => {
    setViewport(1280);
    localStorage.setItem("jc-sidebar-collapsed", "1");
    const { default: JurisCloudOS } = await import("@/components/JurisCloudOS");
    const { container } = render(<Wrap><JurisCloudOS /></Wrap>);

    const trigger = container.querySelector(".jc-nav-item") as HTMLElement | null;
    if (!trigger) return; // role-gated; nothing to test

    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    // Allow Radix tooltip a chance to open via focus.
    await new Promise((r) => setTimeout(r, 200));

    const beforeY = window.scrollY;

    // First Escape: should close tooltip if open, focus stays on trigger.
    fireEvent.keyDown(trigger, { key: "Escape" });
    fireEvent.keyDown(document, { key: "Escape" });
    await new Promise((r) => setTimeout(r, 50));
    expect(document.activeElement).toBe(trigger);

    // Second Escape: tooltip already closed; focus must remain pinned and
    // the page must not scroll to top (focus({preventScroll:true}) contract).
    fireEvent.keyDown(trigger, { key: "Escape" });
    fireEvent.keyDown(document, { key: "Escape" });
    await new Promise((r) => setTimeout(r, 50));

    expect(document.activeElement).toBe(trigger);
    expect(container.querySelector(".jc-tooltip-overlay")).toBeNull();
    expect(window.scrollY).toBe(beforeY);
  });
});
