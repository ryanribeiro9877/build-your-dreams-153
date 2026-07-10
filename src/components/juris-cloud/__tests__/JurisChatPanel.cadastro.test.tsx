import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeAll } from "vitest";
import type { JcChatMessage } from "../types";

// JurisChatPanel puxa (via ActionCard/hooks) o client Supabase no load do módulo,
// que falha sem env vars no ambiente de teste. Mockamos o client e o useAuth.
// O ClienteFormWizard é pesado (IBGE, save_client) e é irrelevante aqui — só
// precisamos provar que o painel O RENDERIZA no disparo. Vira um sentinel.
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { email: "u@x.com" } }) }));
vi.mock("@/components/clients/ClienteFormWizard", () => ({
  default: (props: { onSaved?: unknown; initialValues?: { full_name?: string } }) => (
    <div
      data-testid="cliente-form-wizard"
      data-has-onsaved={props.onSaved ? "yes" : "no"}
      data-fullname={props.initialValues?.full_name ?? ""}
    />
  ),
}));

import JurisChatPanel from "../JurisChatPanel";

// jsdom não implementa scrollIntoView (o painel chama no useEffect ao montar).
beforeAll(() => {
  // @ts-expect-error jsdom não tipa/implementa este método
  Element.prototype.scrollIntoView = vi.fn();
});

const baseProps = {
  thinking: false, thinkingAgentName: "", liveStage: null, thinkingStartedAt: null,
  showWelcome: false, setShowWelcome: () => {}, inputVal: "", setInputVal: () => {},
  handleSend: () => {}, isRecording: false, toggleRecording: () => {},
  speechSupported: false, isReadOnly: false, roleLabel: "", activeDeptLabel: "Assistente",
};

describe("JurisChatPanel — disparo do formulário de cadastro (CADASTRO-MODELO-A)", () => {
  it("renderiza o ClienteFormWizard quando a mensagem tem kind 'cadastro_form'", () => {
    const messages: JcChatMessage[] = [
      { id: "m1", role: "assistant", kind: "cadastro_form", content: "Preencha o formulário abaixo.", timestamp: "10:00" },
    ];
    render(<JurisChatPanel {...baseProps} messages={messages} />);
    expect(screen.getByText(/Preencha o formulário/)).toBeInTheDocument();
    expect(screen.getByTestId("cliente-form-wizard")).toBeInTheDocument();
  });

  it("NÃO renderiza o wizard numa mensagem normal (kind 'final')", () => {
    const messages: JcChatMessage[] = [
      { id: "m2", role: "assistant", kind: "final", content: "Olá, como posso ajudar?", timestamp: "10:00" },
    ];
    render(<JurisChatPanel {...baseProps} messages={messages} />);
    expect(screen.queryByTestId("cliente-form-wizard")).not.toBeInTheDocument();
  });

  it("repassa onSaved e initialValues (Nome pré-preenchido) ao wizard inline", () => {
    const messages: JcChatMessage[] = [
      { id: "m3", role: "assistant", kind: "cadastro_form", content: "Preencha o formulário abaixo.", timestamp: "10:00" },
    ];
    render(
      <JurisChatPanel
        {...baseProps}
        messages={messages}
        onClienteCadastrado={() => {}}
        cadastroInitialValues={{ full_name: "FULANO" } as never}
      />,
    );
    const w = screen.getByTestId("cliente-form-wizard");
    expect(w).toHaveAttribute("data-has-onsaved", "yes");
    expect(w).toHaveAttribute("data-fullname", "FULANO");
  });
});
