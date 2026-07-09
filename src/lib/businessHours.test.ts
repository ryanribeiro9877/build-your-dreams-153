import { describe, it, expect } from "vitest";
import { isWithinBusinessHours, nextBusinessSlot, DEFAULT_BUSINESS_HOURS } from "./businessHours";

const cfg = DEFAULT_BUSINESS_HOURS;

describe("businessHours", () => {
  it("terça 10h está no expediente (janela 08-11)", () => {
    expect(isWithinBusinessHours(new Date(2026, 6, 7, 10, 0), cfg)).toBe(true); // 2026-07-07 = terça
  });
  it("terça 12h (almoço) NÃO está no expediente", () => {
    expect(isWithinBusinessHours(new Date(2026, 6, 7, 12, 0), cfg)).toBe(false);
  });
  it("terça 3h (madrugada) NÃO está no expediente", () => {
    expect(isWithinBusinessHours(new Date(2026, 6, 7, 3, 0), cfg)).toBe(false);
  });
  it("sábado NÃO está no expediente", () => {
    expect(isWithinBusinessHours(new Date(2026, 6, 11, 10, 0), cfg)).toBe(false); // sábado
  });
  it("madrugada de terça → próximo slot é terça 08:00", () => {
    const next = nextBusinessSlot(new Date(2026, 6, 7, 3, 0), cfg);
    expect(next.getHours()).toBe(8);
    expect(next.getDate()).toBe(7);
  });
  it("sexta 18h → próximo slot é segunda 08:00", () => {
    const next = nextBusinessSlot(new Date(2026, 6, 10, 18, 0), cfg); // sexta
    expect(next.getDay()).toBe(1); // segunda
    expect(next.getHours()).toBe(8);
  });
  it("respeita feriado: se terça é feriado, pula para quarta", () => {
    const withHol = { ...cfg, holidays: ["2026-07-07"] };
    const next = nextBusinessSlot(new Date(2026, 6, 7, 9, 0), withHol);
    expect(next.getDate()).toBe(8);
  });
});
