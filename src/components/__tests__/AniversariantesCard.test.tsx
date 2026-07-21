import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AniversariantesCard from "@/components/AniversariantesCard";
import type { Aniversariante } from "@/lib/aniversariantes";

// Estado mutável do hook, controlado por teste (padrão vi.hoisted do projeto).
const { state } = vi.hoisted(() => ({
  state: { data: [] as Aniversariante[], loading: false, error: null as string | null },
}));

vi.mock("@/hooks/useAniversariantes", () => ({
  useAniversariantes: () => ({ ...state, refetch: vi.fn() }),
}));

const Wrap = ({ children }: { children: React.ReactNode }) => <MemoryRouter>{children}</MemoryRouter>;

const maria: Aniversariante = {
  client_id: "abc-1", nome: "Maria Silva", telefone: "(31) 99999-8888",
  is_whatsapp: true, idade: 34, data_nascimento: "1992-07-21",
};

describe("AniversariantesCard", () => {
  beforeEach(() => {
    cleanup();
    state.data = [];
    state.loading = false;
    state.error = null;
  });

  it("sem aniversariantes: não renderiza nada (card oculto)", () => {
    const { container } = render(<AniversariantesCard />, { wrapper: Wrap });
    expect(container).toBeEmptyDOMElement();
  });

  it("enquanto carrega: não renderiza nada (sem flash de card vazio)", () => {
    state.loading = true;
    const { container } = render(<AniversariantesCard />, { wrapper: Wrap });
    expect(container).toBeEmptyDOMElement();
  });

  it("com WhatsApp: nome linka pra ficha, idade no plural e botão wa.me pré-preenchido", () => {
    state.data = [maria];
    render(<AniversariantesCard />, { wrapper: Wrap });

    const nameLink = screen.getByRole("link", { name: "Maria Silva" });
    expect(nameLink).toHaveAttribute("href", "/clientes/abc-1");
    expect(screen.getByText(/faz 34 anos hoje/)).toBeInTheDocument();

    const wa = screen.getByRole("link", { name: /Parabenizar no WhatsApp/ });
    const href = wa.getAttribute("href") ?? "";
    expect(href.startsWith("https://wa.me/5531999998888?text=")).toBe(true);
    expect(decodeURIComponent(href.split("?text=")[1])).toContain("Olá, Maria!");
  });

  it("sem WhatsApp: mostra link tel: e idade no singular, sem botão de WhatsApp", () => {
    state.data = [{
      client_id: "abc-2", nome: "João Souza", telefone: "(31) 3333-4444",
      is_whatsapp: false, idade: 1, data_nascimento: "2025-07-21",
    }];
    render(<AniversariantesCard />, { wrapper: Wrap });

    expect(screen.getByText(/faz 1 ano hoje/)).toBeInTheDocument();
    const tel = screen.getByRole("link", { name: /3333-4444/ });
    expect(tel).toHaveAttribute("href", "tel:+553133334444");
    expect(screen.queryByRole("link", { name: /Parabenizar no WhatsApp/ })).toBeNull();
  });

  it("editar a mensagem recompõe o texto do link do WhatsApp", () => {
    state.data = [maria];
    render(<AniversariantesCard />, { wrapper: Wrap });

    fireEvent.click(screen.getByRole("button", { name: /Editar mensagem/ }));
    const textarea = screen.getByLabelText(/Mensagem enviada no WhatsApp/i);
    fireEvent.change(textarea, { target: { value: "Feliz aniversário, {nome}!" } });

    const wa = screen.getByRole("link", { name: /Parabenizar no WhatsApp/ });
    expect(decodeURIComponent((wa.getAttribute("href") ?? "").split("?text=")[1])).toBe(
      "Feliz aniversário, Maria!",
    );
  });
});
