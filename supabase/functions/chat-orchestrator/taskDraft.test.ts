import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { normalizeDraft, localWallTimeToUtcISO } from "./taskDraft.ts";

// ─── TAREFA-CHAT (card 4.1): normalizeDraft nunca inventa (aberto = null) ─────
Deno.test("normalizeDraft: preenche o que veio e deixa o resto null", () => {
  const d = normalizeDraft({
    title: "Ligar pro João",
    // O LLM devolve APENAS a hora LOCAL de parede (sem fuso/Z). deadline_at é
    // computado no edge (nunca vem do LLM) — por isso fica null aqui.
    deadline_local: "2026-07-10T10:00:00",
    deadline_display: "amanhã 10:00",
    priority: "high",
  });
  assertEquals(d.title, "Ligar pro João");
  assertEquals(d.deadline_local, "2026-07-10T10:00:00");
  assertEquals(d.deadline_at, null);          // computado depois, não vem do LLM
  assertEquals(d.deadline_display, "amanhã 10:00");
  assertEquals(d.client_query, null);         // não veio → aberto
  assertEquals(d.assignee_hint, null);
});

Deno.test("normalizeDraft: IGNORA deadline_at vindo do LLM (só o edge o calcula)", () => {
  // Guarda-costas anti-regressão: mesmo que o modelo mande deadline_at, ele
  // NUNCA é aceito — era a origem do bug +3h (dupla conversão de fuso pelo LLM).
  const d = normalizeDraft({ deadline_at: "2026-07-10T13:00:00-03:00", deadline_local: "2026-07-10T10:00:00" });
  assertEquals(d.deadline_at, null);
  assertEquals(d.deadline_local, "2026-07-10T10:00:00");
});

Deno.test("normalizeDraft: rejeita prioridade inválida (vira null)", () => {
  assertEquals(normalizeDraft({ priority: "urgentíssimo" }).priority, null);
});

Deno.test("normalizeDraft: entrada não-objeto → tudo null", () => {
  const d = normalizeDraft("lixo");
  assertEquals(d.title, null);
  assertEquals(d.deadline_local, null);
  assertEquals(d.deadline_at, null);
});

// ─── Conversão LOCAL→UTC determinística (uma única aplicação de offset) ───────
// America/Bahia é UTC−03:00 (sem horário de verão). "10:00 local" → 13:00Z.
Deno.test("localWallTimeToUtcISO: 10:00 local Bahia → 13:00Z (0h de desvio)", () => {
  assertEquals(localWallTimeToUtcISO("2026-07-10T10:00:00", "America/Bahia"), "2026-07-10T13:00:00.000Z");
});

Deno.test("localWallTimeToUtcISO: vários horários, todos com 0h de desvio", () => {
  assertEquals(localWallTimeToUtcISO("2026-07-11T08:00:00", "America/Bahia"), "2026-07-11T11:00:00.000Z");
  assertEquals(localWallTimeToUtcISO("2026-07-11T15:00:00", "America/Bahia"), "2026-07-11T18:00:00.000Z");
  // aceita também "AAAA-MM-DD HH:mm" (espaço, sem segundos)
  assertEquals(localWallTimeToUtcISO("2026-12-31 23:30", "America/Bahia"), "2027-01-01T02:30:00.000Z");
});

Deno.test("localWallTimeToUtcISO: entrada ausente/inválida → null (campo fica aberto)", () => {
  assertEquals(localWallTimeToUtcISO(null, "America/Bahia"), null);
  assertEquals(localWallTimeToUtcISO("amanhã 10h", "America/Bahia"), null);
  assertEquals(localWallTimeToUtcISO("2026-13-40T99:99:99", "America/Bahia"), null);
});
