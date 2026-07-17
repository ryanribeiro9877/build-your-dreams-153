import { assertEquals, assert } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { TOOLS, toolsFor, isWriteTool, READ_TOOL_NAMES } from "./registry.ts";

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
  for (const name of ["cadastrar_cliente","criar_card_tarefa","solicitar_documentos","pedir_acesso_arquivos","distribuir_caso"]) {
    const def = TOOLS[name];
    assert(def, `faltou ${name}`);
    assert(def.function.parameters, `faltou parameters em ${name}`);
  }
});

Deno.test("distribuir_caso é WRITE e exige process_id", () => {
  assertEquals(isWriteTool("distribuir_caso"), true);
  assertEquals((TOOLS["distribuir_caso"].function.parameters as { required: string[] }).required, ["process_id"]);
});

Deno.test("registry: delegate/revisão registradas e categorizadas", () => {
  assertEquals(typeof TOOLS.delegate, "object");
  assertEquals(TOOLS.delegate.function.name, "delegate");
  assertEquals(TOOLS.get_revisao_peca_context.function.name, "get_revisao_peca_context");
  assertEquals(TOOLS.decidir_revisao_peca.function.name, "decidir_revisao_peca");
  // get_revisao_peca_context é LEITURA; decidir_revisao_peca é ESCRITA.
  assertEquals(READ_TOOL_NAMES.includes("get_revisao_peca_context"), true);
  assertEquals(isWriteTool("get_revisao_peca_context"), false);
  assertEquals(isWriteTool("decidir_revisao_peca"), true);
});
