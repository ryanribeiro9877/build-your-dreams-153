import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { normalizeDraft } from "./taskDraft.ts";

// ─── TAREFA-CHAT (card 4.1): normalizeDraft nunca inventa (aberto = null) ─────
Deno.test("normalizeDraft: preenche o que veio e deixa o resto null", () => {
  const d = normalizeDraft({
    title: "Ligar pro João",
    deadline_at: "2026-07-10T13:00:00Z",
    deadline_display: "amanhã 10:00",
    priority: "high",
  });
  assertEquals(d.title, "Ligar pro João");
  assertEquals(d.deadline_at, "2026-07-10T13:00:00Z");
  assertEquals(d.client_query, null);     // não veio → aberto
  assertEquals(d.assignee_hint, null);
});

Deno.test("normalizeDraft: rejeita prioridade inválida (vira null)", () => {
  assertEquals(normalizeDraft({ priority: "urgentíssimo" }).priority, null);
});

Deno.test("normalizeDraft: entrada não-objeto → tudo null", () => {
  const d = normalizeDraft("lixo");
  assertEquals(d.title, null);
  assertEquals(d.deadline_at, null);
});
