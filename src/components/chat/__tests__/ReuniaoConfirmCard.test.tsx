import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { ReuniaoConfirmCard } from "../ReuniaoConfirmCard";

const createMeeting = vi.fn();
const getAvailableSlots = vi.fn();
vi.mock("@/hooks/useMeetings", () => ({
  createMeeting: (...a: unknown[]) => createMeeting(...a),
  getAvailableSlots: (...a: unknown[]) => getAvailableSlots(...a),
}));

// Estado mutável dos mocks (vi.hoisted p/ estar disponível quando a factory roda).
const h = vi.hoisted(() => ({
  lawyers: [] as { user_id: string; name: string; role_label: string | null }[],
  hasHistory: false,
  priorityPhone: null as string | null,
}));
vi.mock("@/hooks/useMeetingLawyers", () => ({ useMeetingLawyers: () => ({ lawyers: h.lawyers }) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (fn: string) => Promise.resolve(
      fn === "client_has_meeting_history" ? { data: h.hasHistory, error: null }
      : fn === "get_client_priority_phone" ? { data: h.priorityPhone, error: null }
      : { data: null, error: null },
    ),
  },
}));

const baseDraft = {
  scheduled_date: "2026-07-11", start_time: "10:00", type: null, display: "11/07 10:00",
  lawyer_hint: "Ana", phone: null, client_query: "João",
  client_resolved: { id: "c1", name: "João", cpf_masked: "***.***.***-12", status: "ativo" },
  client_candidates: [] as { id: string; name: string; cpf_masked: string | null; status: string | null }[],
};

beforeEach(() => {
  createMeeting.mockReset();
  getAvailableSlots.mockReset().mockResolvedValue(["10:00", "10:15", "14:00"]);
  h.lawyers = [{ user_id: "l1", name: "Ana Cristina", role_label: null }]; // casa com hint "Ana"
  h.hasHistory = false; // cliente novo por padrão
  h.priorityPhone = null;
});

describe("ReuniaoConfirmCard", () => {
  it("confirma com advogado (por hint), tipo default (cliente novo) e cliente resolvido", async () => {
    createMeeting.mockResolvedValue("m1");
    render(<ReuniaoConfirmCard draft={baseDraft as never} />);
    await waitFor(() => expect(screen.getByRole("button", { name: /confirmar/i })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: /confirmar/i }));
    await waitFor(() => expect(createMeeting).toHaveBeenCalledWith(expect.objectContaining({
      p_scheduled_date: "2026-07-11", p_start_time: "10:00", p_client_id: "c1",
      p_lawyer_user_id: "l1", p_type: "Consulta inicial", p_status: "scheduled",
    })));
  });

  it("cliente com histórico -> Tipo abre sem seleção (confirmar bloqueado com motivo)", async () => {
    h.hasHistory = true;
    render(<ReuniaoConfirmCard draft={baseDraft as never} />);
    await waitFor(() => expect(screen.getByText(/selecione o tipo/i)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /confirmar/i })).toBeDisabled();
  });

  it("advogado obrigatório -> sem advogado bloqueia com motivo", async () => {
    h.lawyers = [];
    render(<ReuniaoConfirmCard draft={{ ...baseDraft, lawyer_hint: null } as never} />);
    await waitFor(() => expect(screen.getByText(/selecione o advogado responsável/i)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /confirmar/i })).toBeDisabled();
  });

  it("cliente ambíguo -> não confirma sem escolher um candidato", async () => {
    const d = {
      ...baseDraft, client_resolved: null,
      client_candidates: [
        { id: "a", name: "Ryan A", cpf_masked: "***.***.***-11", status: "ativo" },
        { id: "b", name: "Ryan B", cpf_masked: "***.***.***-22", status: "ativo" },
      ],
    };
    render(<ReuniaoConfirmCard draft={d as never} />);
    await waitFor(() => expect(screen.getByText(/escolha o cliente/i)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /confirmar/i })).toBeDisabled();
  });

  it("cliente não cadastrado (prospect) -> bloqueia com motivo (exige cadastrado)", async () => {
    const d = { ...baseDraft, client_resolved: null, client_candidates: [], client_query: "Fulano" };
    render(<ReuniaoConfirmCard draft={d as never} />);
    await waitFor(() => expect(screen.getByText(/vincule um cliente cadastrado/i)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /confirmar/i })).toBeDisabled();
  });

  it("preenche telefone com o número WhatsApp retornado pela RPC canônica", async () => {
    h.priorityPhone = "(71) 3000-0002";
    render(<ReuniaoConfirmCard draft={baseDraft as never} />);
    await waitFor(() => expect(screen.getByPlaceholderText(/00000-0000/)).toHaveValue("(71) 3000-0002"));
  });

  it("bloqueia confirmar quando não há horário livre no dia", async () => {
    getAvailableSlots.mockResolvedValue([]); // fim de semana/feriado/fora de janela
    render(<ReuniaoConfirmCard draft={baseDraft as never} />);
    await waitFor(() => expect(screen.getByText(/sem horários nesse dia/i)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /confirmar/i })).toBeDisabled();
  });

  it("slot cheio -> mostra sugestão de horários livres", async () => {
    createMeeting.mockRejectedValue({ message: "create_meeting: slot cheio (capacidade 1 atingida)" });
    render(<ReuniaoConfirmCard draft={baseDraft as never} />);
    await waitFor(() => expect(screen.getByRole("button", { name: /confirmar/i })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: /confirmar/i }));
    await waitFor(() => expect(screen.getByText(/horários livres/i)).toBeInTheDocument());
  });

  it("cliente não encontrado + handler -> oferece 'Cadastrar cliente' com snapshot ao vivo", async () => {
    const onCadastrar = vi.fn();
    const d = { ...baseDraft, client_resolved: null, client_candidates: [], client_query: "Fulano" };
    render(<ReuniaoConfirmCard draft={d as never} onCadastrarCliente={onCadastrar} />);
    // Não mostra mais só o texto de bloqueio: mostra a CTA de cadastro.
    expect(screen.getByText(/cliente não encontrado\. cadastrar agora\?/i)).toBeInTheDocument();
    const btn = await screen.findByRole("button", { name: /cadastrar cliente/i });
    // Advogado (por hint "Ana") e tipo default (cliente novo) já se assentam no
    // act() do render (efeitos síncronos). O snapshot deve refleti-los.
    fireEvent.click(btn);
    expect(onCadastrar).toHaveBeenCalledWith(expect.objectContaining({
      client_name_hint: "Fulano",
      scheduled_date: "2026-07-11",
      start_time: "10:00",
      type: "Consulta inicial",
      lawyer_user_id: "l1",
    }));
  });

  it("cliente não encontrado SEM handler -> mantém bloqueio antigo (sem botão)", async () => {
    const d = { ...baseDraft, client_resolved: null, client_candidates: [], client_query: "Fulano" };
    render(<ReuniaoConfirmCard draft={d as never} />);
    await waitFor(() => expect(screen.getByText(/vincule um cliente cadastrado/i)).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /cadastrar cliente/i })).not.toBeInTheDocument();
  });
});
