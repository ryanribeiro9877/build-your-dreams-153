import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chavesDeArgs, erroCru, traceToolsEnviadas, traceChamadaTool, formaDoRetorno, previaDoRetorno } from "./trace.ts";

/* Fake do client: guarda o que foi inserido em agent_traces. Um espião basta —
   o que interessa provar é O QUE vai na linha, não que o supabase-js funciona. */
function fakeAdmin() {
  const linhas: Record<string, unknown>[] = [];
  const client = {
    from: (tabela: string) => ({
      insert: (linha: Record<string, unknown>) => {
        assertEquals(tabela, "agent_traces");
        linhas.push(linha);
        return Promise.resolve({ error: null });
      },
    }),
  } as unknown as SupabaseClient;
  return { client, linhas };
}

/* Todo dado destes testes é FICTÍCIO (repo público): "admin123", "Maria" e o CPF
   111.222.333-44 (inválido de propósito) existem só para as asserções de que NENHUM
   deles aparece na linha do trace. */
const CTX = { traceId: "t1", userId: "u1", sessionId: "s1", agentId: "a1", runId: "r1" };

Deno.test("chavesDeArgs devolve chaves ordenadas e NUNCA valores", () => {
  const args = { senha: "admin123", cliente_nome: "Maria", cpf: "111.222.333-44" };
  const chaves = chavesDeArgs(args);
  assertEquals(chaves, ["cliente_nome", "cpf", "senha"]);
  // A linha que não pode ser cruzada: nenhum valor no que sai.
  const serializado = JSON.stringify(chaves);
  assert(!serializado.includes("admin123"));
  assert(!serializado.includes("Maria"));
  assert(!serializado.includes("111.222.333-44"));
});

Deno.test("chavesDeArgs ignora chaves internas do orquestrador", () => {
  assertEquals(chavesDeArgs({ __attachment_id: "x", cliente_id: "y" }), ["cliente_id"]);
});

Deno.test("chavesDeArgs tolera args não-objeto", () => {
  assertEquals(chavesDeArgs(null), []);
  assertEquals(chavesDeArgs(undefined), []);
  assertEquals(chavesDeArgs("texto"), []);
  assertEquals(chavesDeArgs([1, 2]), []);
});

Deno.test("erroCru preserva o CODE — é ele que separa as três falhas", () => {
  // 42501 = papel/permissão; 23514 = vocabulário do CHECK; 42883 = parâmetro que não existe.
  // Antes só `message` subia e as três viravam o mesmo "não consegui".
  const permissao = erroCru({ code: "42501", message: "permission denied for function x" });
  assert(permissao!.includes("code=42501"));

  const vocabulario = erroCru({
    code: "23514", message: "violates check constraint",
    details: "Failing row contains (...)", hint: "use um valor da lista",
  });
  assert(vocabulario!.includes("code=23514"));
  assert(vocabulario!.includes("hint=use um valor da lista"));

  const param = erroCru({ code: "42883", message: "function does not exist" });
  assert(param!.includes("code=42883"));
  // Os três são distinguíveis entre si — o ponto do log.
  assert(permissao !== vocabulario && vocabulario !== param);
});

Deno.test("erroCru: sem erro devolve null; erro sem campos cai no String()", () => {
  assertEquals(erroCru(null), null);
  assertEquals(erroCru(undefined), null);
  assert(erroCru(new Error("estourou"))!.includes("estourou"));
  assertEquals(erroCru({}), "[object Object]");
});

Deno.test("traceToolsEnviadas denuncia tool permitida que não foi enviada", async () => {
  const { client, linhas } = fakeAdmin();
  // O caso real: `consultar_documentos_obrigatorios` estava no allowed_tools de 13
  // agentes e fora do registry do edge — descartada em silêncio por toolsFor.
  await traceToolsEnviadas(client, CTX, {
    operacao: "n3:tools_enviadas", agenteNome: "Peças", modelo: "gpt-4o",
    permitidas: ["criar_processo", "consultar_documentos_obrigatorios", "consultar_cliente"],
    enviadas: ["criar_processo", "consultar_cliente"],
  });
  assertEquals(linhas.length, 1);
  const md = linhas[0].metadata as Record<string, unknown>;
  assertEquals(md.nao_registradas, ["consultar_documentos_obrigatorios"]);
  assertEquals(md.tem_nao_registrada, true);
  assertEquals(md.total_enviadas, 2);
  // started_at é NOT NULL e sem default no banco: tem de ir na linha.
  assert(typeof linhas[0].started_at === "string");
  assertEquals(linhas[0].span_kind, "llm");
  assertEquals(linhas[0].status, "ok");
});

Deno.test("traceToolsEnviadas: tudo enviado → nao_registradas vazio", async () => {
  const { client, linhas } = fakeAdmin();
  await traceToolsEnviadas(client, CTX, {
    operacao: "n3:tools_enviadas", permitidas: ["a", "b"], enviadas: ["a", "b"],
  });
  const md = linhas[0].metadata as Record<string, unknown>;
  assertEquals(md.nao_registradas, []);
  assertEquals(md.tem_nao_registrada, false);
});

Deno.test("traceChamadaTool grava o erro cru e só as chaves dos args", async () => {
  const { client, linhas } = fakeAdmin();
  await traceChamadaTool(client, CTX, {
    tool: "salvar_credencial_gov",
    args: { cliente_id: "c1", senha: "admin123" },
    ok: false,
    erro: { code: "42501", message: "permission denied" },
    durationMs: 42,
  });
  const linha = linhas[0];
  assertEquals(linha.status, "error");
  assertEquals(linha.span_kind, "tool");
  assertEquals(linha.duration_ms, 42);
  assert(String(linha.error_message).includes("code=42501"));
  // A senha não pode aparecer em NENHUM campo da linha do trace.
  assert(!JSON.stringify(linha).includes("admin123"));
  assertEquals((linha.metadata as Record<string, unknown>).args_chaves, ["cliente_id", "senha"]);
});

Deno.test("traceChamadaTool: sucesso não grava erro", async () => {
  const { client, linhas } = fakeAdmin();
  await traceChamadaTool(client, CTX, { tool: "consultar_cliente", args: { nome: "x" }, ok: true });
  assertEquals(linhas[0].status, "ok");
  assertEquals(linhas[0].error_message, null);
  assertEquals((linhas[0].metadata as Record<string, unknown>).erro_cru, null);
});

Deno.test("falha ao gravar o trace NÃO propaga — observabilidade não derruba turno", async () => {
  const quebrado = {
    from: () => ({ insert: () => { throw new Error("rede caiu"); } }),
  } as unknown as SupabaseClient;
  // Se isto lançasse, um trace com problema derrubaria o chat inteiro.
  await traceToolsEnviadas(quebrado, CTX, { operacao: "x", permitidas: [], enviadas: [] });
  await traceChamadaTool(quebrado, CTX, { tool: "y", ok: true });
});


/* ─── Retorno da tool no trace ──────────────────────────────────────────────
   Com `status: ok` e nada mais, sabia-se que a tool executou mas não o que ela
   devolveu — a peça que faltava para fechar o diagnóstico sem inferir. */

Deno.test("formaDoRetorno distingue VAZIO de cheio — a peça que faltava", () => {
  // O caso real: consultar_audiencias devolve `[]` (rodou e não achou), e o
  // agente disse "não tenho a ferramenta".
  assertEquals(formaDoRetorno([]), "array(0) VAZIO");
  assertEquals(formaDoRetorno([{ id: 1 }, { id: 2 }]), "array(2)");
  assertEquals(formaDoRetorno({}), "objeto{} VAZIO");
  assertEquals(formaDoRetorno(null), "nulo");
  assertEquals(formaDoRetorno(undefined), "nulo");
  assertEquals(formaDoRetorno(""), "texto(0) VAZIO");
});

Deno.test("formaDoRetorno mostra as CHAVES — diz se veio erro ou payload", () => {
  assertEquals(formaDoRetorno({ erro: "x", __erro_cru: "code=42501" }), "objeto{erro,__erro_cru}");
  assert(formaDoRetorno({ audiencias: [], total: 0 }).includes("audiencias"));
});

Deno.test("previaDoRetorno mascara senha/CPF/CNPJ por NOME de campo", () => {
  const previa = previaDoRetorno([
    { cliente: "Fulano de Teste", quando: "12/09 14:30", cpf: "111.222.333-44", senha: "admin123" },
  ]);
  // O que diagnostica fica:
  assert(previa.includes("Fulano de Teste"));
  assert(previa.includes("12/09 14:30"));
  // O que não ajuda em nada e é o pior de registrar, sai:
  assert(!previa.includes("111.222.333-44"));
  assert(!previa.includes("admin123"));
  assertEquals(previa.split("[omitido]").length - 1, 2);
});

Deno.test("previaDoRetorno mascara em profundidade e trunca", () => {
  const fundo = previaDoRetorno({ a: { b: { c: { senha: "admin123" } } } });
  assert(!fundo.includes("admin123"));
  const grande = previaDoRetorno({ txt: "x".repeat(5000) }, 200);
  assert(grande.length < 260);
  assert(grande.includes("[+"));
});

Deno.test("traceChamadaTool grava forma, bytes e prévia do retorno", async () => {
  const { client, linhas } = fakeAdmin();
  await traceChamadaTool(client, CTX, {
    tool: "consultar_audiencias", args: { de: "2026-08-04", ate: "2027-08-04", cliente_nome: "Fulana" },
    ok: true, retorno: [],
  });
  const md = linhas[0].metadata as Record<string, unknown>;
  assertEquals(md.retorno_forma, "array(0) VAZIO");
  assertEquals(md.retorno_previa, "[]");
  assertEquals(md.retorno_bytes, 2);
  // A forma aparece no output_summary, sem precisar abrir o metadata.
  assertEquals(linhas[0].output_summary, "ok · retorno=array(0) VAZIO");
});

Deno.test("traceChamadaTool sem retorno informado não inventa forma", async () => {
  const { client, linhas } = fakeAdmin();
  await traceChamadaTool(client, CTX, { tool: "x", ok: true });
  assertEquals(linhas[0].output_summary, "ok");
  assertEquals((linhas[0].metadata as Record<string, unknown>).retorno_forma, null);
});
