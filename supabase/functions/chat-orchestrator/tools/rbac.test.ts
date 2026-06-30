import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { decideActionRoute } from "./rbac.ts";

Deno.test("admin pode criar card -> execute", () => {
  assertEquals(decideActionRoute({ isMaster: true, canAssignTask: false }, "criar_card_tarefa"), "execute");
});
Deno.test("recepcao sem can_assign -> pendencia", () => {
  assertEquals(decideActionRoute({ isMaster: false, canAssignTask: false }, "criar_card_tarefa"), "pendencia");
});
Deno.test("can_assign true -> execute", () => {
  assertEquals(decideActionRoute({ isMaster: false, canAssignTask: true }, "criar_card_tarefa"), "execute");
});
Deno.test("cadastrar_cliente sempre execute", () => {
  assertEquals(decideActionRoute({ isMaster: false, canAssignTask: false }, "cadastrar_cliente"), "execute");
});
Deno.test("solicitar_documentos sempre execute", () => {
  assertEquals(decideActionRoute({ isMaster: false, canAssignTask: false }, "solicitar_documentos"), "execute");
});
