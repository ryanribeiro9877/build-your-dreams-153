import { assertEquals, assert } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { TOOLS, toolsFor, isWriteTool } from "./registry.ts";

Deno.test("toolsFor filtra pelo allowed_tools do agente", () => {
  const t = toolsFor(["consultar_cliente", "cadastrar_cliente"]);
  assertEquals(t.map((x) => x.function.name).sort(), ["cadastrar_cliente", "consultar_cliente"]);
});

Deno.test("toolsFor vazio quando allowed vazio/nulo", () => {
  assertEquals(toolsFor([]).length, 0);
  assertEquals(toolsFor(null).length, 0);
});

Deno.test("isWriteTool classifica leitura vs escrita", () => {
  assertEquals(isWriteTool("consultar_cliente"), false);
  assertEquals(isWriteTool("cadastrar_cliente"), true);
  assertEquals(isWriteTool("criar_card_tarefa"), true);
});

Deno.test("consultar_cep é READ (gated por CHAT_READ_TOOLS_ENABLED, não por escrita)", () => {
  assertEquals(isWriteTool("consultar_cep"), false);
  assert(TOOLS["consultar_cep"], "faltou schema de consultar_cep");
  assert(TOOLS["consultar_cep"].function.parameters, "consultar_cep sem parameters");
});

Deno.test("todo write tool tem schema de parâmetros", () => {
  for (const name of ["cadastrar_cliente","criar_card_tarefa","solicitar_documentos","pedir_acesso_arquivos"]) {
    const def = TOOLS[name];
    assert(def, `faltou ${name}`);
    assert(def.function.parameters, `faltou parameters em ${name}`);
  }
});
