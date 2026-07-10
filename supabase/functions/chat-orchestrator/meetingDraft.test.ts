import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { normalizeMeetingDraft, parseReuniaoAcao } from "./meetingDraft.ts";

Deno.test("normalize: campos ausentes viram null", () => {
  const d = normalizeMeetingDraft({});
  assertEquals(d.scheduled_date, null);
  assertEquals(d.start_time, null);
});

Deno.test("normalize: aceita date/time válidos; rejeita formato/overflow", () => {
  assertEquals(normalizeMeetingDraft({ scheduled_date: "2026-07-11", start_time: "10:00" }).scheduled_date, "2026-07-11");
  assertEquals(normalizeMeetingDraft({ scheduled_date: "2026-07-11", start_time: "10:00" }).start_time, "10:00");
  assertEquals(normalizeMeetingDraft({ scheduled_date: "2026-13-40" }).scheduled_date, null);
  assertEquals(normalizeMeetingDraft({ start_time: "25:00" }).start_time, null);
  assertEquals(normalizeMeetingDraft({ start_time: "10:00:00" }).start_time, "10:00");
});

Deno.test("parseReuniaoAcao: verbo -> status", () => {
  assertEquals(parseReuniaoAcao("confirma a reunião das 10h"), "confirmed");
  assertEquals(parseReuniaoAcao("marca como realizada"), "done");
  assertEquals(parseReuniaoAcao("cancela a reunião"), "canceled");
  assertEquals(parseReuniaoAcao("o cliente não compareceu"), "no_show");
  assertEquals(parseReuniaoAcao("reagenda pra 14h"), "reschedule");
  assertEquals(parseReuniaoAcao("bom dia"), null);
});
