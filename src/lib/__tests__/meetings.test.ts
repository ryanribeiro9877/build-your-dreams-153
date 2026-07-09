import { describe, it, expect } from "vitest";
import { deriveEndTime, statusLabel, MEETING_STATUS_OPTIONS } from "@/lib/meetings";

describe("deriveEndTime", () => {
  it("soma 15 minutos por padrão", () => {
    expect(deriveEndTime("09:00")).toBe("09:15");
  });
  it("aceita duração customizada", () => {
    expect(deriveEndTime("09:00", 30)).toBe("09:30");
  });
  it("normaliza HH:MM:SS para HH:MM", () => {
    expect(deriveEndTime("13:45:00")).toBe("14:00");
  });
  it("vira a hora corretamente", () => {
    expect(deriveEndTime("10:50")).toBe("11:05");
  });
});

describe("statusLabel", () => {
  it("traduz para PT-BR", () => {
    expect(statusLabel("no_show")).toBe("Não compareceu");
    expect(statusLabel("scheduled")).toBe("Agendado");
  });
});

describe("MEETING_STATUS_OPTIONS", () => {
  it("cobre os 6 estados", () => {
    expect(MEETING_STATUS_OPTIONS.map((o) => o.value)).toEqual([
      "scheduled", "confirmed", "rescheduled", "canceled", "no_show", "done",
    ]);
  });
});
