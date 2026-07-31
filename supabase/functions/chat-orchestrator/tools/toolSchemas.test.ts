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

/* ══ P2 (Cards 11/13/14/15) ═════════════════════════════════════════════════ */

Deno.test("registry: as 11 tools do P2 estão registradas com parameters", () => {
  for (const name of [
    "registrar_diligencia", "cumprir_diligencia", "consultar_diligencias",
    "registrar_apolice", "atualizar_apolice", "consultar_apolices",
    "registrar_lembrete_audiencia", "preparar_audiencia",
    "registrar_procuracao", "consultar_procuracoes", "gerar_campanha_renovacao_procuracao",
  ]) {
    const def = TOOLS[name];
    assert(def, `faltou ${name}`);
    assertEquals(def.function.name, name);
    assert(def.function.parameters, `faltou parameters em ${name}`);
    assert(def.function.description.length > 80, `descrição curta demais em ${name}`);
  }
});

Deno.test("registry: as 4 consultas do P2 são LEITURA e as 7 restantes ESCRITA", () => {
  for (const r of ["consultar_diligencias", "consultar_apolices", "consultar_procuracoes", "preparar_audiencia"]) {
    assertEquals(READ_TOOL_NAMES.includes(r), true, `${r} deveria ser leitura`);
    assertEquals(isWriteTool(r), false, `${r} não deveria ser escrita`);
  }
  for (const w of [
    "registrar_diligencia", "cumprir_diligencia", "registrar_apolice", "atualizar_apolice",
    "registrar_lembrete_audiencia", "registrar_procuracao", "gerar_campanha_renovacao_procuracao",
  ]) {
    assertEquals(isWriteTool(w), true, `${w} deveria ser escrita`);
  }
});

// Enum divergente do CHECK derruba a gravação com 23514 (ou, no status da
// consulta, devolve a lista ERRADA em silêncio). Os valores abaixo saíram de
// pg_get_constraintdef em 30/07/2026 — este teste é o guarda contra deriva.
Deno.test("registry: enums do P2 são os CHECKs reais do banco", () => {
  const enumDe = (tool: string, prop: string) => {
    const props = (TOOLS[tool].function.parameters as { properties: Record<string, { enum?: string[] }> }).properties;
    return props[prop].enum ?? [];
  };
  assertEquals(enumDe("registrar_diligencia", "tipo"),
    ["balcao_virtual", "concluso_analise", "expedicao_alvara", "peticao", "carta_precatoria", "outro"]);
  assertEquals(enumDe("consultar_diligencias", "status"),
    ["pendente", "cumprida", "prejudicada", "todas"]);
  // `pendente` é estado INICIAL do lembrete, não decisão de quem ligou.
  assertEquals(enumDe("registrar_lembrete_audiencia", "status"),
    ["feito", "nao_atendeu", "cancelado"]);
  assertEquals(enumDe("registrar_apolice", "premio_periodicidade"),
    ["mensal", "unico", "anual", "outro"]);
  assertEquals(enumDe("registrar_apolice", "origem_desconto"),
    ["extrato_inss", "conta_bancaria", "contracheque", "outro"]);
  assertEquals(enumDe("registrar_procuracao", "tipo"),
    ["ad_judicia", "ad_judicia_et_extra", "especifica", "outro"]);
});

Deno.test("registry: obrigatórios do P2 batem com o que a RPC exige", () => {
  const req = (tool: string) => (TOOLS[tool].function.parameters as { required: string[] }).required;
  assertEquals(req("registrar_diligencia"), ["descricao"]);
  assertEquals(req("cumprir_diligencia"), ["diligencia_id"]);
  assertEquals(req("registrar_apolice"), ["seguradora"]);
  assertEquals(req("atualizar_apolice"), ["apolice_id"]);
  assertEquals(req("registrar_lembrete_audiencia"), ["lembrete_id"]);
  assertEquals(req("preparar_audiencia"), ["audiencia_id"]);
  assertEquals(req("registrar_procuracao"), ["data_assinatura"]);
  // As consultas e a campanha não exigem nada.
  assertEquals(req("consultar_diligencias"), []);
  assertEquals(req("consultar_apolices"), []);
  assertEquals(req("consultar_procuracoes"), []);
  assertEquals(req("gerar_campanha_renovacao_procuracao"), []);
});

// Protocolo deixou de ser pré-requisito em 30/07: nenhuma tool pode exigi-lo.
Deno.test("registry: cumprir_diligencia NÃO exige protocolo", () => {
  const p = TOOLS["cumprir_diligencia"].function.parameters as { required: string[] };
  assertEquals(p.required.includes("protocolo"), false);
  assert(/NÃO é obrigatório/.test(TOOLS["cumprir_diligencia"].function.description),
    "a descrição precisa dizer que o protocolo não é obrigatório");
});
