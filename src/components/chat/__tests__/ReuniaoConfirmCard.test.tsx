import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { ReuniaoConfirmCard } from "../ReuniaoConfirmCard";

const createMeeting = vi.fn();
const getAvailableSlots = vi.fn();
vi.mock("@/hooks/useMeetings", () => ({
  createMeeting: (...a: unknown[]) => createMeeting(...a),
  getAvailableSlots: (...a: unknown[]) => getAvailableSlots(...a),
}));
vi.mock("@/hooks/useMeetingLawyers", () => ({ useMeetingLawyers: () => ({ lawyers: [] }) }));

const baseDraft = {
  scheduled_date: "2026-07-11", start_time: "10:00", type: null, display: "11/07 10:00",
  lawyer_hint: null, phone: null, client_query: "João",
  client_resolved: { id: "c1", name: "João", cpf_masked: "***.***.***-12", status: "ativo" },
  client_candidates: [],
};

beforeEach(() => {
  createMeeting.mockReset();
  getAvailableSlots.mockReset();
  getAvailableSlots.mockResolvedValue(["10:00", "10:15", "14:00"]);
});

describe("ReuniaoConfirmCard", () => {
  it("confirma e chama createMeeting com o cliente resolvido", async () => {
    createMeeting.mockResolvedValue("m1");
    render(<ReuniaoConfirmCard draft={baseDraft as never} />);
    await waitFor(() => expect(getAvailableSlots).toHaveBeenCalledWith("2026-07-11"));
    fireEvent.click(screen.getByRole("button", { name: /confirmar/i }));
    await waitFor(() => expect(createMeeting).toHaveBeenCalledWith(expect.objectContaining({
      p_scheduled_date: "2026-07-11", p_start_time: "10:00", p_client_id: "c1", p_status: "scheduled",
    })));
  });

  it("slot cheio -> mostra sugestão de horários livres", async () => {
    createMeeting.mockRejectedValue({ message: "create_meeting: slot cheio (capacidade 1 atingida)" });
    render(<ReuniaoConfirmCard draft={baseDraft as never} />);
    fireEvent.click(screen.getByRole("button", { name: /confirmar/i }));
    await waitFor(() => expect(screen.getByText(/horários livres/i)).toBeInTheDocument());
  });
});
