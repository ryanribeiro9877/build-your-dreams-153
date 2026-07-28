import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { montarFiltroCampanha, CAMPANHA_FILTRO_KEYS } from "./campanhaFiltro.ts";

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
