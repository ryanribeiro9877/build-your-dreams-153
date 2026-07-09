import { describe, it, expect } from "vitest";
import { GOOGLE_SYNC_ENABLED, syncMeetingToGoogle } from "@/lib/googleCalendarSync";

// Trilha D — enquanto o encaixe está desligado, o stub responde "not_configured"
// e nunca lança. Este teste trava esse contrato até o sync real existir.
describe("syncMeetingToGoogle (stub Trilha D)", () => {
  it("começa com o encaixe desligado", () => {
    expect(GOOGLE_SYNC_ENABLED).toBe(false);
  });

  it("responde not_configured sem lançar quando desligado", async () => {
    const r = await syncMeetingToGoogle("00000000-0000-0000-0000-000000000000");
    expect(r.status).toBe("not_configured");
    expect(r.eventId).toBeNull();
    expect(typeof r.message).toBe("string");
  });
});
