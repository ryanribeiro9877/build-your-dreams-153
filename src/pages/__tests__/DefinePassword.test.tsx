import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/* ============================================================
   Regressão do bug de 30/07/2026 — tela de definir senha travada
   ============================================================
   Quem entrava com a senha temporária criada pelo admin ficava preso em
   "Validando convite…" e, 15s depois, via "prazo de 24 horas ultrapassado" —
   apontando para uma expiração que NÃO existia (invite_expires_at era nulo).

   Causa: sem hash na URL, a tela só liberava em SIGNED_IN/PASSWORD_RECOVERY. Para
   uma sessão restaurada do storage o supabase-js emite INITIAL_SESSION, então
   `ready` nunca virava true.

   Estes testes fixam os dois comportamentos: liberar com sessão já existente, e
   NÃO chamar de "convite expirado" o que é falha de validação de sessão.
============================================================ */

// vi.hoisted: a factory do vi.mock é içada para o topo do arquivo e não vê um
// `const` normal declarado aqui ("Cannot access 'authMock' before initialization").
const authMock = vi.hoisted(() => ({
  getSession: vi.fn(),
  getUser: vi.fn(),
  onAuthStateChange: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: authMock,
    functions: { invoke: vi.fn().mockResolvedValue({ data: { ok: true }, error: null }) },
    rpc: vi.fn().mockResolvedValue({ error: null }),
  },
}));

// O captcha faz fetch para o Cloudflare no mount; irrelevante aqui.
vi.mock("@/components/TurnstileCaptcha", () => ({
  TurnstileCaptcha: () => <div data-testid="captcha" />,
}));

vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));

import DefinePassword from "../DefinePassword";

const SESSAO = { access_token: "t", user: { id: "u1", user_metadata: {} } };

function semEventos() {
  // Nenhum evento de auth é emitido — é o cenário real da sessão restaurada:
  // o INITIAL_SESSION pode ter sido emitido ANTES desta tela montar.
  authMock.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  window.location.hash = "";
  authMock.getUser.mockResolvedValue({ data: { user: { id: "u1", user_metadata: {} } } });
  semEventos();
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("DefinePassword — sessão já existente", () => {
  it("libera o formulário quando JÁ existe sessão, sem depender de evento de auth", async () => {
    authMock.getSession.mockResolvedValue({ data: { session: SESSAO } });

    render(<DefinePassword />);

    // Sem o fix isto só apareceria se um SIGNED_IN fosse emitido — e não é.
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /salvar senha e entrar/i })).toBeInTheDocument();
    });
    expect(screen.queryByText(/convite expirado/i)).not.toBeInTheDocument();
  });

  it("com sessão, o relógio de 15s NÃO transforma a tela em erro", async () => {
    authMock.getSession.mockResolvedValue({ data: { session: SESSAO } });

    render(<DefinePassword />);
    await waitFor(() => expect(screen.getByRole("button", { name: /salvar senha e entrar/i })).toBeInTheDocument());

    await vi.advanceTimersByTimeAsync(20000);

    expect(screen.getByRole("button", { name: /salvar senha e entrar/i })).toBeInTheDocument();
    expect(screen.queryByText(/não foi possível validar a sessão/i)).not.toBeInTheDocument();
  });
});

describe("DefinePassword — mensagem de falha aponta a causa certa", () => {
  it("sem sessão em 15s diz 'não foi possível validar a sessão', NÃO 'convite expirado'", async () => {
    authMock.getSession.mockResolvedValue({ data: { session: null } });

    render(<DefinePassword />);
    await vi.advanceTimersByTimeAsync(15100);

    await waitFor(() => {
      expect(screen.getByText(/não foi possível validar a sessão/i)).toBeInTheDocument();
    });
    // A regressão que motivou o fix: culpar o prazo de 24h por falha de sessão.
    expect(screen.queryByText(/prazo de 24 horas/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/convite expirado/i)).not.toBeInTheDocument();
  });

  it("convite REALMENTE vencido (invite_expires_at no passado) mantém a mensagem de 24h", async () => {
    authMock.getSession.mockResolvedValue({ data: { session: SESSAO } });
    authMock.getUser.mockResolvedValue({
      data: { user: { id: "u1", user_metadata: { invite_expires_at: "2020-01-01T00:00:00Z" } } },
    });

    render(<DefinePassword />);

    await waitFor(() => {
      expect(screen.getByText(/convite expirado/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/prazo de 24 horas/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /salvar senha e entrar/i })).not.toBeInTheDocument();
  });
});
