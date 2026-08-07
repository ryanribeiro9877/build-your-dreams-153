import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { motivoParaNaoConcluir, notasConclusao, statusPedeConclusao } from "./pendencia.ts";

/* ── statusPedeConclusao ──────────────────────────────────────────────────────
   O CASE de atualizar_tarefa resolve 7 grafias para `completed`. Se uma delas
   escapar daqui, ela volta ao caminho que grava SÓ o status — a meia-baixa. */

Deno.test("todas as grafias que o banco aceita como concluída são reconhecidas", () => {
  for (const s of ["completed", "concluída", "concluida", "CONCLUÍDO", "finalizada", "feita", "pronta", "concluir"]) {
    assert(statusPedeConclusao(s), s);
  }
});

Deno.test("status que não é conclusão passa reto", () => {
  for (const s of ["em andamento", "bloqueada", "a fazer", "cancelada", "aguardando validação", "", null, undefined]) {
    assertEquals(statusPedeConclusao(s), false, String(s));
  }
});

/* ── motivoParaNaoConcluir ───────────────────────────────────────────────────
   Concluir o que já está concluído devolveria "pronto!" sem nada ter mudado. */

Deno.test("tarefa inexistente: diz que nada foi concluído e onde localizar", () => {
  const m = motivoParaNaoConcluir(null);
  assert(m !== null);
  assert(/nada foi concluído/i.test(m!), m!);
  assert(/consultar_tarefas/.test(m!), m!);
});

Deno.test("tarefa já concluída não é concluída de novo, e o nome dela aparece", () => {
  const m = motivoParaNaoConcluir({ title: "Conferir procuração", status: "completed" });
  assert(m !== null);
  assert(/JÁ está concluída/.test(m!), m!);
  assert(/Conferir procuração/.test(m!), m!);
  assert(/nada foi alterado/i.test(m!), m!);
});

Deno.test("tarefa cancelada não se conclui", () => {
  const m = motivoParaNaoConcluir({ title: "X", status: "cancelled" });
  assert(m !== null && /CANCELADA/.test(m));
});

Deno.test("tarefa aberta libera a conclusão", () => {
  assertEquals(motivoParaNaoConcluir({ status: "assigned", is_pendencia: true }), null);
  assertEquals(motivoParaNaoConcluir({ status: "in_progress" }), null);
});

/* ── notasConclusao ─────────────────────────────────────────────────────────── */

Deno.test("pendência resolvida: confirma a baixa e manda conferir em Tarefas", () => {
  const notas = notasConclusao(
    { is_pendencia: true, status: "assigned" },
    { is_pendencia: true, status: "completed", pendencia_estado: "resolvida" },
  );
  assert(notas.some((n) => /resolvida/i.test(n)), notas.join(" | "));
  assert(notas.some((n) => /em Tarefas \(não no Kanban/.test(n)), notas.join(" | "));
});

Deno.test("pendência DEVOLVIDA não é encerrada: a nota diz que ela voltou à origem", () => {
  const notas = notasConclusao(
    { is_pendencia: true, status: "assigned", origem_departamento: "recepcao" },
    { is_pendencia: true, status: "completed", pendencia_estado: "devolvida", departamento_atual: "recepcao" },
  );
  const txt = notas.join(" | ");
  assert(/DEVOLVIDA/.test(txt), txt);
  assert(/recepcao/.test(txt), txt);
  assert(/não desaparece do sistema/.test(txt), txt);
});

Deno.test("validação obrigatória: a resposta NÃO pode dizer que concluiu", () => {
  const notas = notasConclusao(
    { is_pendencia: false, status: "assigned" },
    { is_pendencia: false, status: "awaiting_validation" },
  );
  const txt = notas.join(" | ");
  assert(/NÃO ficou concluída/.test(txt), txt);
  assert(/AGUARDANDO VALIDAÇÃO/.test(txt), txt);
});

Deno.test("banco não gravou a conclusão: a nota desmente, e não sobra nota alegre", () => {
  const notas = notasConclusao(
    { is_pendencia: true, status: "assigned" },
    { is_pendencia: true, status: "in_progress", pendencia_estado: "aberta" },
  );
  const txt = notas.join(" | ");
  assert(/NÃO registrou a conclusão/.test(txt), txt);
  assert(/segue aberta na tela/.test(txt), txt);
  assert(!/resolvida/i.test(txt), txt);
});

// A meia-baixa do bug de 05/08: status fechou, pendencia_estado ficou aberto.
// A resposta tem de declarar isso — é o que faz o usuário conferir a tela.
Deno.test("meia-baixa (status fecha, estado continua aberto) é declarada", () => {
  const notas = notasConclusao(
    { is_pendencia: true, status: "assigned" },
    { is_pendencia: true, status: "completed", pendencia_estado: "aberta" },
  );
  const txt = notas.join(" | ");
  assert(/continua "aberta"/.test(txt), txt);
  assert(/baixa ficou pela metade/.test(txt), txt);
});

Deno.test("tarefa comum concluída não recebe nota de pendência", () => {
  const notas = notasConclusao(
    { is_pendencia: false, status: "assigned" },
    { is_pendencia: false, status: "completed" },
  );
  assertEquals(notas.length, 1);
  assert(/em Tarefas/.test(notas[0]), notas[0]);
});

Deno.test("estado posterior ilegível não vira promessa de encerramento", () => {
  const notas = notasConclusao({ is_pendencia: true, status: "assigned" }, null);
  const txt = notas.join(" | ");
  assert(/não consegui reler/.test(txt), txt);
  assert(!/resolvida/i.test(txt), txt);
});
