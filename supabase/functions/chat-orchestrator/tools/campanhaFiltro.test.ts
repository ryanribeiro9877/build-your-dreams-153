import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { montarFiltroCampanha, normalizarObjetivoCampanha, CAMPANHA_FILTRO_KEYS } from "./campanhaFiltro.ts";

// O filtro da campanha usa as MESMAS chaves de search_clients — é isso que permite
// contar a fila no pré-voo do cartão com a mesma consulta que a RPC vai usar.
Deno.test("montarFiltroCampanha: só as chaves conhecidas entram", () => {
  const f = montarFiltroCampanha({
    nome: "X", objetivo: "pedir_documento",          // não são filtro
    recebe_em: "bradesco", cidade: "Salvador", lixo: "ignorar",
  });
  assertEquals(f, { recebe_em: "BRADESCO", cidade: "Salvador" });
});

Deno.test("montarFiltroCampanha: banco e UF vão em MAIÚSCULAS (como na base)", () => {
  const f = montarFiltroCampanha({ recebe_em: "agibank", tem_consignado_com: "bmg", tem_extrato_de: "itau", uf: "ba" });
  assertEquals(f, { recebe_em: "AGIBANK", tem_consignado_com: "BMG", tem_extrato_de: "ITAU", uf: "BA" });
});

Deno.test("montarFiltroCampanha: booleanos preservam false (não são descartados)", () => {
  assertEquals(montarFiltroCampanha({ docs_completos: false }), { docs_completos: false });
  assertEquals(montarFiltroCampanha({ tem_pendencia: true }), { tem_pendencia: true });
});

Deno.test("montarFiltroCampanha: vazio/nulo/espaço não vira filtro", () => {
  assertEquals(montarFiltroCampanha({}), {});
  assertEquals(montarFiltroCampanha({ cidade: "", uf: "   ", gov: null, origem: undefined }), {});
});

Deno.test("montarFiltroCampanha: cobre todas as chaves documentadas", () => {
  const todas: Record<string, unknown> = {};
  for (const k of CAMPANHA_FILTRO_KEYS) todas[k] = k === "tem_pendencia" || k === "docs_completos" ? true : "x";
  assertEquals(Object.keys(montarFiltroCampanha(todas)).sort(), [...CAMPANHA_FILTRO_KEYS].sort());
});

// ─── Armadilhas medidas no banco em 29/07 ─────────────────────────────────────
// search_clients IGNORA chave desconhecida em SILÊNCIO: {"consignado_com":"AGIBANK"}
// devolvia 562 (a base TODA) contra 214 de {"tem_consignado_com":"AGIBANK"} — uma
// campanha criada com o nome errado ligaria para a base inteira.
Deno.test("montarFiltroCampanha: alias consignado_com → tem_consignado_com", () => {
  assertEquals(montarFiltroCampanha({ consignado_com: "agibank" }), { tem_consignado_com: "AGIBANK" });
  assertEquals(montarFiltroCampanha({ extrato_de: "bradesco" }), { tem_extrato_de: "BRADESCO" });
  assertEquals(montarFiltroCampanha({ banco_beneficio: "itau" }), { recebe_em: "ITAU" });
  assertEquals(montarFiltroCampanha({ nivel: "bronze" }), { gov: "bronze" });
});

Deno.test("montarFiltroCampanha: a chave canônica vence o alias", () => {
  assertEquals(
    montarFiltroCampanha({ tem_consignado_com: "BMG", consignado_com: "AGIBANK" }),
    { tem_consignado_com: "BMG" },
  );
});

// O CHECK de campanhas.objetivo só aceita 7 valores; os nomes curtos que circulam na
// documentação ("agendar", "pedir_procuracao") violariam com 23514.
Deno.test("normalizarObjetivoCampanha: aliases viram valores aceitos pelo CHECK", () => {
  assertEquals(normalizarObjetivoCampanha("agendar"), "agendar_atendimento");
  assertEquals(normalizarObjetivoCampanha("pedir_procuracao"), "renovar_procuracao");
  assertEquals(normalizarObjetivoCampanha("pedir_senha"), "pedir_senha_gov");
  assertEquals(normalizarObjetivoCampanha("pedir_extrato"), "pedir_documento");
  assertEquals(normalizarObjetivoCampanha("bronze"), "converter_conta_bronze");
});

Deno.test("normalizarObjetivoCampanha: valores válidos passam; desconhecido → outro", () => {
  for (const v of ["pedir_documento", "pedir_senha_gov", "agendar_atendimento",
                   "renovar_procuracao", "converter_conta_bronze", "informar_andamento", "outro"]) {
    assertEquals(normalizarObjetivoCampanha(v), v);
  }
  assertEquals(normalizarObjetivoCampanha("qualquer coisa"), "outro");
  assertEquals(normalizarObjetivoCampanha(""), "outro");
  assertEquals(normalizarObjetivoCampanha(null), "outro");
  assertEquals(normalizarObjetivoCampanha("Agendar Atendimento"), "agendar_atendimento"); // espaço/caixa
});
