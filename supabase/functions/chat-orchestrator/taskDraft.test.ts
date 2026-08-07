import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  normalizeDraft, frasePreparoTarefa, localWallTimeToUtcISO,
  parseRelativeDeadline, extractPendenciaTitle, extractClientQuery, fillDraftGaps,
} from "./taskDraft.ts";

// ─── Item 7.1 de 06/08 (4.9): a troca Kanban → Tarefas tem de ser DITA ────────

Deno.test("quem pede card no Kanban é avisado de que a tarefa vai para Tarefas", () => {
  for (const m of [
    "cria um card no Kanban para conferir a procuração",
    "abre um card no kanban pra Kailane",
    "coloca isso no KANBAN",
  ]) {
    const f = frasePreparoTarefa(m);
    assert(/Kanban recebe CASOS por distribuição/.test(f), f);
    assert(/nascer em Tarefas/.test(f), f);
  }
});

Deno.test("pedido normal de tarefa só diz onde ela nasce, sem aula sobre Kanban", () => {
  const f = frasePreparoTarefa("abre uma pendência de procuração pro cliente Adalberto");
  assert(/nascer em Tarefas/.test(f), f);
  assert(!/Kanban/.test(f), f);
  assert(/Revise, ajuste o que precisar e confirme:$/.test(f), f);
});

Deno.test("a palavra Kanban só conta inteira (não casa dentro de outra palavra)", () => {
  assert(!/Kanban recebe/.test(frasePreparoTarefa("cria uma tarefa sobre o kanbanzinho")));
  assert(!/Kanban recebe/.test(frasePreparoTarefa("")));
});

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

// ─── B3 do reteste 27/07: cartão de tarefa vinha VAZIO ────────────────────────
// A frase trazia título, cliente e prazo, mas o cartão vinha em branco (o LLM não
// resolvia dias da semana e qualquer falha dele zerava tudo). Estes testes travam
// o parser DETERMINÍSTICO de prazo relativo pedido no briefing.
// Âncora: segunda-feira 27/07/2026, 10:00 local.
const SEG_27_07 = "2026-07-27T10:00:00";

Deno.test("parseRelativeDeadline: hoje / amanhã / depois de amanhã", () => {
  assertEquals(parseRelativeDeadline("liga pro cliente hoje", SEG_27_07), "2026-07-27T09:00:00");
  assertEquals(parseRelativeDeadline("envia amanhã", SEG_27_07), "2026-07-28T09:00:00");
  assertEquals(parseRelativeDeadline("resolve depois de amanhã", SEG_27_07), "2026-07-29T09:00:00");
});

Deno.test("parseRelativeDeadline: dias da semana (o caso 'para sexta' do reteste)", () => {
  // era o bug: "para sexta" virava null → prazo em branco no cartão
  assertEquals(parseRelativeDeadline("cadastre uma pendência de procuração pro cliente X para sexta", SEG_27_07), "2026-07-31T09:00:00");
  assertEquals(parseRelativeDeadline("na sexta-feira", SEG_27_07), "2026-07-31T09:00:00");
  assertEquals(parseRelativeDeadline("até quarta", SEG_27_07), "2026-07-29T09:00:00");
  assertEquals(parseRelativeDeadline("terça", SEG_27_07), "2026-07-28T09:00:00");
  assertEquals(parseRelativeDeadline("no sábado", SEG_27_07), "2026-08-01T09:00:00");
  // mesmo dia da semana que hoje (segunda) → a PRÓXIMA segunda, não hoje
  assertEquals(parseRelativeDeadline("para segunda", SEG_27_07), "2026-08-03T09:00:00");
});

Deno.test("parseRelativeDeadline: com hora citada", () => {
  assertEquals(parseRelativeDeadline("sexta 9h", SEG_27_07), "2026-07-31T09:00:00");
  assertEquals(parseRelativeDeadline("sexta às 14h", SEG_27_07), "2026-07-31T14:00:00");
  assertEquals(parseRelativeDeadline("amanhã às 14:30", SEG_27_07), "2026-07-28T14:30:00");
  assertEquals(parseRelativeDeadline("hoje 16h", SEG_27_07), "2026-07-27T16:00:00");
});

Deno.test("parseRelativeDeadline: próxima semana e 'dia N'", () => {
  assertEquals(parseRelativeDeadline("semana que vem", SEG_27_07), "2026-08-03T09:00:00");
  assertEquals(parseRelativeDeadline("próxima semana às 11h", SEG_27_07), "2026-08-03T11:00:00");
  assertEquals(parseRelativeDeadline("dia 31", SEG_27_07), "2026-07-31T09:00:00");
  // dia já passado no mês → mês seguinte
  assertEquals(parseRelativeDeadline("dia 5", SEG_27_07), "2026-08-05T09:00:00");
});

Deno.test("parseRelativeDeadline: sem expressão de prazo → null (nunca chuta)", () => {
  assertEquals(parseRelativeDeadline("cadastre uma pendência de procuração", SEG_27_07), null);
  assertEquals(parseRelativeDeadline("", SEG_27_07), null);
  assertEquals(parseRelativeDeadline("qualquer coisa", "âncora inválida"), null);
});

Deno.test("extractPendenciaTitle: objeto da pendência, sem arrastar cliente/prazo", () => {
  assertEquals(extractPendenciaTitle("cadastre uma pendência de procuração pro cliente [TESTE] CLIENTE E2E ONDAS para sexta"), "procuração");
  assertEquals(extractPendenciaTitle("abra uma pendência dos extratos do cliente Y"), "extratos");
  assertEquals(extractPendenciaTitle("crie uma tarefa de revisão do contrato"), "revisão do contrato");
  assertEquals(extractPendenciaTitle("bom dia"), null);
});

Deno.test("extractClientQuery: nome do cliente como escrito, sem o prazo", () => {
  assertEquals(extractClientQuery("cadastre uma pendência de procuração pro cliente [TESTE] CLIENTE E2E ONDAS para sexta"), "[TESTE] CLIENTE E2E ONDAS");
  assertEquals(extractClientQuery("abra pendência do cliente Adalberto amanhã às 10h"), "Adalberto");
  assertEquals(extractClientQuery("sem cliente citado"), null);
});

Deno.test("fillDraftGaps: LLM tem PRIORIDADE; só preenche o que veio null", () => {
  const msg = "cadastre uma pendência de procuração pro cliente [TESTE] CLIENTE E2E ONDAS para sexta";
  // rascunho vazio (falha do LLM) → os 3 campos são preenchidos
  const vazio = fillDraftGaps(normalizeDraft(null), msg, SEG_27_07);
  assertEquals(vazio.title, "procuração");
  assertEquals(vazio.client_query, "[TESTE] CLIENTE E2E ONDAS");
  assertEquals(vazio.deadline_local, "2026-07-31T09:00:00");
  // o que o LLM trouxe NÃO é sobrescrito
  const doLlm = fillDraftGaps(
    normalizeDraft({ title: "Procuração assinada", deadline_local: "2026-07-30T15:00:00" }), msg, SEG_27_07);
  assertEquals(doLlm.title, "Procuração assinada");
  assertEquals(doLlm.deadline_local, "2026-07-30T15:00:00");
  assertEquals(doLlm.client_query, "[TESTE] CLIENTE E2E ONDAS"); // este veio null → preenchido
});
