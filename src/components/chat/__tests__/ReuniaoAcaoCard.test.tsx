import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { ReuniaoAcaoCard } from "../ReuniaoAcaoCard";

const updateMeeting = vi.fn();
const getAvailableSlots = vi.fn();
const single = vi.fn();
const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock("@/hooks/useMeetings", () => ({
  updateMeeting: (...a: unknown[]) => updateMeeting(...a),
  getAvailableSlots: (...a: unknown[]) => getAvailableSlots(...a),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: single }) }) }) },
}));
vi.mock("sonner", () => ({ toast: { error: (...a: unknown[]) => toastError(...a), success: (...a: unknown[]) => toastSuccess(...a), message: vi.fn() } }));

const oneCand = {
  action: "confirmed" as const,
  candidates: [{ id: "m1", scheduled_date: "2026-07-11", start_time: "10:00", client_name: "João", status: "scheduled", type: null }],
  new_date_local: null, new_time_local: null,
};

beforeEach(() => {
  updateMeeting.mockReset();
  getAvailableSlots.mockReset().mockResolvedValue(["14:00"]);
  toastError.mockReset(); toastSuccess.mockReset();
  single.mockReset().mockResolvedValue({ data: { id: "m1", scheduled_date: "2026-07-11", start_time: "10:00:00", end_time: "10:15:00", type: null, lawyer_user_id: null, receptionist_user_id: null, client_id: "c1", client_name: "João", phone: null, summary: null, notes: null, status: "scheduled" }, error: null });
});

describe("ReuniaoAcaoCard", () => {
  it("confirma 1 candidata -> updateMeeting com status alvo", async () => {
    updateMeeting.mockResolvedValue(undefined);
    render(<ReuniaoAcaoCard payload={oneCand as never} />);
    fireEvent.click(screen.getByRole("button", { name: /confirmar/i }));
    await waitFor(() => expect(updateMeeting).toHaveBeenCalledWith(expect.objectContaining({
      p_id: "m1", p_status: "confirmed", p_scheduled_date: "2026-07-11",
    })));
  });

  it("estado final -> mensagem amigável (toast)", async () => {
    updateMeeting.mockRejectedValue({ message: 'update_meeting: "done" é estado final e não pode ser alterado' });
    render(<ReuniaoAcaoCard payload={oneCand as never} />);
    fireEvent.click(screen.getByRole("button", { name: /confirmar/i }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith(expect.stringMatching(/já foi finalizada/i)));
  });
});
