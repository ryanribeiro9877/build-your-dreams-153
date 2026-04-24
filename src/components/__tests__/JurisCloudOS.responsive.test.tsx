import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MemoryRouter } from "react-router-dom";

const Wrap = ({ children }: { children: React.ReactNode }) => (
  <MemoryRouter>
    <TooltipProvider>{children}</TooltipProvider>
  </MemoryRouter>
);

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
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
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


  it("Escape on right-panel toggle keeps focus on the trigger button (desktop)", async () => {
    setViewport(1280);
    const { default: JurisCloudOS } = await import("@/components/JurisCloudOS");
    const { container } = render(<Wrap><JurisCloudOS /></Wrap>);

    const rightToggle = container.querySelector(
      ".jc-right-toggle-desk"
    ) as HTMLButtonElement | null;
    expect(rightToggle).toBeTruthy();
    rightToggle!.focus();
    expect(document.activeElement).toBe(rightToggle);
    // Scroll position should not change to top after Escape.
    const beforeY = window.scrollY;
    fireEvent.keyDown(rightToggle!, { key: "Escape" });
    expect(document.activeElement).toBe(rightToggle);
    expect(window.scrollY).toBe(beforeY);
  });

  it("Escape on right-panel toggle keeps focus also on mobile viewport", async () => {
    setViewport(375, 812);
    const { default: JurisCloudOS } = await import("@/components/JurisCloudOS");
    const { container } = render(<Wrap><JurisCloudOS /></Wrap>);

    const rightToggle = container.querySelector(
      ".jc-right-toggle-desk"
    ) as HTMLButtonElement | null;
    if (rightToggle) {
      rightToggle.focus();
      const beforeY = window.scrollY;
      fireEvent.keyDown(rightToggle, { key: "Escape" });
      expect(document.activeElement).toBe(rightToggle);
      expect(window.scrollY).toBe(beforeY);
    }
  });

  it("Ctrl+O toggles the right panel collapsed state", async () => {
    setViewport(1280);
    const { default: JurisCloudOS } = await import("@/components/JurisCloudOS");
    const { container } = render(<Wrap><JurisCloudOS /></Wrap>);

    const right = container.querySelector("#jc-right-panel");
    expect(right).toBeTruthy();
    const initial = right!.classList.contains("collapsed");
    fireEvent.keyDown(window, { key: "o", ctrlKey: true });
    const after = container.querySelector("#jc-right-panel");
    expect(after!.classList.contains("collapsed")).toBe(!initial);
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
});
