import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  foldTokens, allowedChildRoles, resolveTarget, isAncestor, topFrame,
  makeFrame, pushChild, popWithResult, buildDelegationContextBlock, materiaToConfeccaoCode,
  type DelegationStack, type DelegCandidate,
} from "./delegation.ts";

const cands: DelegCandidate[] = [
  { id: "d1", name: "Diretor Jurídico — Revisão", role: "director", description: "revisa peças" },
  { id: "d2", name: "Diretor de Área", role: "director", description: "distribui trabalho jurídico" },
  { id: "s1", name: "Especialista Previdenciário", role: "specialist", description: "redige peças de INSS" },
];

Deno.test("foldTokens: minúsculas, sem acento, sem stopwords de artigo/preposição", () => {
  assertEquals(foldTokens("ao Diretor de Área"), ["diretor", "area"]);
});

Deno.test("resolveTarget: casa por token único e forte", () => {
  const r = resolveTarget("diretor de revisão", cands);
  assertEquals(r.match?.id, "d1");
  assertEquals(r.ambiguous.length, 0);
});

Deno.test("resolveTarget: sem match → null e sem ambíguos", () => {
  const r = resolveTarget("financeiro", cands);
  assertEquals(r.match, null);
  assertEquals(r.ambiguous.length, 0);
});

Deno.test("resolveTarget: empate → ambiguous preenchido, match null", () => {
  const r = resolveTarget("diretor", cands);
  assertEquals(r.match, null);
  assertEquals(r.ambiguous.map((c) => c.id).sort(), ["d1", "d2"]);
});

Deno.test("allowedChildRoles: hierarquia", () => {
  assertEquals(allowedChildRoles("assistant_root"), ["director"]);
  assertEquals(allowedChildRoles("director"), ["specialist"]);
  assertEquals(allowedChildRoles("specialist"), []);
});

Deno.test("isAncestor: detecta agente já na pilha", () => {
  const stack: DelegationStack = [
    makeFrame("a0", 0, null, "oi"),
    makeFrame("d2", 1, { objetivo: "x" }, null),
  ];
  assertEquals(isAncestor(stack, "a0"), true);
  assertEquals(isAncestor(stack, "s1"), false);
});

Deno.test("pushChild/topFrame: empilha filho no topo com o contexto", () => {
  let stack: DelegationStack = [makeFrame("a0", 0, null, "redija a inicial")];
  const child = makeFrame("d2", 1, { objetivo: "distribua ao previdenciário" }, "distribua ao previdenciário");
  stack = pushChild(stack, "call_1", { role: "assistant", content: "", tool_calls: [{ id: "call_1" }] }, child);
  assertEquals(topFrame(stack)?.agent_id, "d2");
  assertEquals(stack[0].pending_child_tool_call_id, "call_1");
  // a msg assistant com o tool_call foi anexada ao pai
  assertEquals((stack[0].messages.at(-1) as { tool_calls?: unknown[] }).tool_calls?.length, 1);
});

Deno.test("popWithResult: desempilha e injeta resultado como tool no pai", () => {
  let stack: DelegationStack = [makeFrame("a0", 0, null, "redija")];
  const child = makeFrame("d2", 1, { objetivo: "x" }, "x");
  stack = pushChild(stack, "call_1", { role: "assistant", content: "", tool_calls: [{ id: "call_1" }] }, child);
  stack = popWithResult(stack, "peça salva; revisão criada");
  assertEquals(stack.length, 1);
  assertEquals(topFrame(stack)?.agent_id, "a0");
  const last = stack[0].messages.at(-1) as { role: string; tool_call_id?: string; content?: string };
  assertEquals(last.role, "tool");
  assertEquals(last.tool_call_id, "call_1");
  assertEquals(last.content, "peça salva; revisão criada");
  assertEquals(stack[0].pending_child_tool_call_id, null);
});

Deno.test("popWithResult: pop do raiz esvazia a pilha (retorna [])", () => {
  const stack: DelegationStack = [makeFrame("a0", 0, null, "oi")];
  assertEquals(popWithResult(stack, "resultado final").length, 0);
});

Deno.test("buildDelegationContextBlock: injeta objetivo/resumo (vazio se null)", () => {
  assertEquals(buildDelegationContextBlock(null), "");
  const b = buildDelegationContextBlock({ objetivo: "Redigir contestação", resumo: "cliente X, réu Y" });
  assertEquals(b.includes("Redigir contestação"), true);
  assertEquals(b.includes("cliente X, réu Y"), true);
});

Deno.test("materiaToConfeccaoCode: mapeia matéria→código; fallback civil", () => {
  assertEquals(materiaToConfeccaoCode("Previdenciário"), "confeccionar_peca_previdenciario");
  assertEquals(materiaToConfeccaoCode("Plano de Saúde"), "confeccionar_peca_plano_saude");
  assertEquals(materiaToConfeccaoCode(null), "confeccionar_peca_civil");
});
