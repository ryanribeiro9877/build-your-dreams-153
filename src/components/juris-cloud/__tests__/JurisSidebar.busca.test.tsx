import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import JurisSidebar from "../JurisSidebar";

// trackUiEvent depende de storage/analytics — mockado para o teste não sair do
// componente.
vi.mock("@/lib/uiTracking", () => ({ trackUiEvent: vi.fn() }));

// Sonda de rota: expõe pathname+search para conferir a navegação da busca.
function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="loc">{`${loc.pathname}${loc.search}`}</div>;
}

const baseProps = {
  sidebarOpen: false,
  setSidebarOpen: vi.fn(),
  sidebarCollapsed: false,
  sidebarSearch: "",
  setSidebarSearch: vi.fn(),
  canSearchClients: true,
  activeDept: "assistente",
  setActiveDept: vi.fn(),
  visibleDepts: [],
  visibleAgents: [],
  menuItems: [],
  systemOnline: true,
  openTooltipCount: 0,
  setOpenTooltipCount: vi.fn(),
  hasRole: () => false,
  chatSessions: [],
  activeSessionId: null,
  onSwitchSession: vi.fn(),
  onNewChat: vi.fn(),
  onDeleteSession: vi.fn(),
};

function renderSidebar(over: Partial<typeof baseProps>) {
  return render(
    <MemoryRouter initialEntries={["/sistema"]}>
      <TooltipProvider>
        <JurisSidebar {...baseProps} {...over} />
        <LocationProbe />
      </TooltipProvider>
    </MemoryRouter>,
  );
}

const CAMPO = /Buscar cliente por nome/i;

afterEach(cleanup);

describe("JurisSidebar — busca de cliente (A.9)", () => {
  it("ESCONDE o campo para quem não passa no gate de Clientes", () => {
    // Papel sem acesso a `clients` no banco: sem campo, em vez de campo que
    // aceita texto e devolve silêncio.
    renderSidebar({ canSearchClients: false });
    expect(screen.queryByLabelText(CAMPO)).toBeNull();
    expect(screen.queryByRole("search")).toBeNull();
  });

  it("mostra o campo para quem passa no gate", () => {
    renderSidebar({ canSearchClients: true });
    expect(screen.getByLabelText(CAMPO)).toBeTruthy();
  });

  it("Enter com termo NÃO é inerte: leva para /clientes com o termo na querystring", () => {
    renderSidebar({ sidebarSearch: "  Silva Teste  " });
    fireEvent.keyDown(screen.getByLabelText(CAMPO), { key: "Enter" });
    // encodeURIComponent → espaço vira %20; o termo vai aparado (trim).
    expect(screen.getByTestId("loc").textContent).toBe("/clientes?nome=Silva%20Teste");
  });

  it("clique na lupa leva para /clientes com o termo", () => {
    renderSidebar({ sidebarSearch: "Fulano Ficticio" });
    fireEvent.click(screen.getByRole("button", { name: /Buscar cliente/i }));
    expect(screen.getByTestId("loc").textContent).toBe("/clientes?nome=Fulano%20Ficticio");
  });

  it("Enter com termo vazio (ou só espaços) não navega", () => {
    renderSidebar({ sidebarSearch: "   " });
    fireEvent.keyDown(screen.getByLabelText(CAMPO), { key: "Enter" });
    expect(screen.getByTestId("loc").textContent).toBe("/sistema");
  });
});
