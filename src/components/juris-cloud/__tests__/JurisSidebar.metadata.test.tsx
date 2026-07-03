import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import JurisSidebar from "../JurisSidebar";
import type { ConversationStatus } from "../sessionStatus";

// trackUiEvent só é chamado em interações (não no render), mas mockamos por
// segurança para não depender de storage/analytics no ambiente de teste.
vi.mock("@/lib/uiTracking", () => ({ trackUiEvent: vi.fn() }));

const Wrap = ({ children }: { children: React.ReactNode }) => (
  <MemoryRouter>
    <TooltipProvider>{children}</TooltipProvider>
  </MemoryRouter>
);

type SessionSummary = {
  id: string; title: string; preview?: string;
  lastMessageAt: string; messageCount: number;
  clientName?: string | null;
  status?: ConversationStatus | null;
};

const baseProps = {
  sidebarOpen: false,
  setSidebarOpen: vi.fn(),
  sidebarCollapsed: false,
  sidebarSearch: "",
  setSidebarSearch: vi.fn(),
  activeDept: "assistente",
  setActiveDept: vi.fn(),
  visibleDepts: [],
  visibleAgents: [],
  menuItems: [],
  systemOnline: true,
  openTooltipCount: 0,
  setOpenTooltipCount: vi.fn(),
  hasRole: () => false,
  onSwitchSession: vi.fn(),
  onNewChat: vi.fn(),
  onDeleteSession: vi.fn(),
};

function renderWith(sessions: SessionSummary[]) {
  return render(
    <Wrap>
      <JurisSidebar {...baseProps} chatSessions={sessions} activeSessionId={null} />
    </Wrap>,
  );
}

afterEach(cleanup);

describe("JurisSidebar — metadados da conversa (card 2.4)", () => {
  it("mostra data + HORÁRIO no item da lista", () => {
    // 2026-07-03T14:30 local. Verificamos dd/mm e HH:MM juntos.
    const iso = new Date(2026, 6, 3, 14, 30).toISOString();
    renderWith([{ id: "s1", title: "Ação trabalhista", preview: "resumo", lastMessageAt: iso, messageCount: 3 }]);
    expect(screen.getByText(/03\/07\s+14:30/)).toBeTruthy();
  });

  it("mostra o rótulo de status quando derivável", () => {
    const iso = new Date(2026, 6, 3, 9, 5).toISOString();
    renderWith([
      { id: "a", title: "Gerando", lastMessageAt: iso, messageCount: 1, status: "em_andamento" },
      { id: "b", title: "Pronta",  lastMessageAt: iso, messageCount: 2, status: "concluida" },
      { id: "c", title: "Quebrou", lastMessageAt: iso, messageCount: 1, status: "erro" },
    ]);
    expect(screen.getByText("Em andamento")).toBeTruthy();
    expect(screen.getByText("Concluída")).toBeTruthy();
    expect(screen.getByText("Erro")).toBeTruthy();
  });

  it("NÃO mostra selo de status quando não é derivável (status null)", () => {
    const iso = new Date(2026, 6, 3, 9, 5).toISOString();
    renderWith([{ id: "a", title: "Sem run", lastMessageAt: iso, messageCount: 1, status: null }]);
    // Nenhum dos rótulos de status conhecidos aparece.
    expect(screen.queryByText("Em andamento")).toBeNull();
    expect(screen.queryByText("Concluída")).toBeNull();
    expect(screen.queryByText("Erro")).toBeNull();
    expect(screen.queryByText("Aguardando ação")).toBeNull();
    // Mas a conversa (título) segue listada.
    expect(screen.getByText("Sem run")).toBeTruthy();
  });

  it("exibe o nome do cliente quando há vínculo; nada quando não há", () => {
    const iso = new Date(2026, 6, 3, 9, 5).toISOString();
    renderWith([
      { id: "a", title: "Com cliente", lastMessageAt: iso, messageCount: 1, clientName: "Maria Silva" },
      { id: "b", title: "Sem cliente", lastMessageAt: iso, messageCount: 1, clientName: null },
    ]);
    expect(screen.getByText("Maria Silva")).toBeTruthy();
    // Não injeta rótulo/placeholder de cliente para a conversa sem vínculo.
    expect(screen.queryByText(/Cliente:/)).toBeNull();
  });

  it("não renderiza nenhuma categoria/rótulo 'receptiva' ou 'ativo/receptivo'", () => {
    const iso = new Date(2026, 6, 3, 9, 5).toISOString();
    const { container } = renderWith([
      { id: "a", title: "X", lastMessageAt: iso, messageCount: 1, status: "concluida" },
    ]);
    expect(container.textContent?.toLowerCase()).not.toContain("receptiv");
  });
});
