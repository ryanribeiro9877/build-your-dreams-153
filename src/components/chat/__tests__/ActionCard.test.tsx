import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

// O componente importa confirmAction de @/hooks/useActionConfirm, que por sua vez
// instancia o cliente Supabase no load do módulo (falha sem env vars no ambiente
// de teste). Mockamos o cliente para evitar esse efeito colateral de import — os
// testes injetam confirmFn próprio, então o real nunca é chamado.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) } },
}));

import { ActionCard } from "../ActionCard";

describe("ActionCard", () => {
  const proposal = { action_id: "a1", run_id: "r1", tool: "cadastrar_cliente", args: { full_name: "José" }, resumo: 'Cadastrar cliente "José".', route: "execute" as const };

  it("mostra o resumo e botão Confirmar quando route=execute", () => {
    render(<ActionCard proposal={proposal} onDone={() => {}} confirmFn={vi.fn()} />);
    expect(screen.getByText(/Cadastrar cliente/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /confirmar/i })).toBeInTheDocument();
  });

  it("mostra 'Encaminhar ao Admin' quando route=pendencia", () => {
    render(<ActionCard proposal={{ ...proposal, route: "pendencia" }} onDone={() => {}} confirmFn={vi.fn()} />);
    expect(screen.getByRole("button", { name: /encaminhar ao admin/i })).toBeInTheDocument();
  });

  it("chama confirmFn com (run_id, action_id, 'confirm') ao confirmar", () => {
    const spy = vi.fn().mockResolvedValue({ ok: true });
    render(<ActionCard proposal={proposal} onDone={() => {}} confirmFn={spy} />);
    fireEvent.click(screen.getByRole("button", { name: /confirmar/i }));
    expect(spy).toHaveBeenCalledWith("r1", "a1", "confirm");
  });
});
