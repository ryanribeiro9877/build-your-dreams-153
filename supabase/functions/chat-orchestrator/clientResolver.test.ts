import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { extractClientQuery, resolveClient, type ClientHit } from "./clientResolver.ts";

Deno.test("extractClientQuery: pega o nome após 'cliente'", () => {
  assertEquals(extractClientQuery("quero anexar documentos do cliente João Silva"), "João Silva");
  assertEquals(extractClientQuery("modificar o cadastro do cliente Maria Souza"), "Maria Souza");
  assertEquals(extractClientQuery("abrir cliente Pedro"), "Pedro");
});

Deno.test("extractClientQuery: para em pontuação", () => {
  assertEquals(extractClientQuery("anexar no cliente João Silva, por favor"), "João Silva");
});

Deno.test("extractClientQuery: CPF tem precedência", () => {
  assertEquals(extractClientQuery("abrir cadastro do 084.822.105-21"), "084.822.105-21");
  assertEquals(extractClientQuery("cliente 08482210521"), "08482210521");
});

Deno.test("extractClientQuery: 'cadastro de X' sem a palavra cliente", () => {
  assertEquals(extractClientQuery("modificar cadastro de Ana Lima"), "Ana Lima");
});

Deno.test("extractClientQuery: sem alvo → null", () => {
  assertEquals(extractClientQuery("bom dia"), null);
  assertEquals(extractClientQuery(""), null);
});

Deno.test("resolveClient: 0 hits → none", async () => {
  const r = await resolveClient(async () => [], "x");
  assertEquals(r.status, "none");
});

Deno.test("resolveClient: 1 hit → resolved", async () => {
  const one: ClientHit[] = [{ id: "c1", full_name: "MARIA" }];
  const r = await resolveClient(async () => one, "maria");
  assertEquals(r.status, "resolved");
  if (r.status === "resolved") assertEquals(r.client.id, "c1");
});

Deno.test("resolveClient: N hits (homônimos) → ambiguous", async () => {
  const many: ClientHit[] = [
    { id: "c1", full_name: "MARIA A" },
    { id: "c2", full_name: "MARIA B" },
  ];
  const r = await resolveClient(async () => many, "maria");
  assertEquals(r.status, "ambiguous");
  if (r.status === "ambiguous") assertEquals(r.candidates.length, 2);
});
