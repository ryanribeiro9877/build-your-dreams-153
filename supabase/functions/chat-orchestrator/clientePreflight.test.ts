import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  TOOLS_QUE_RESOLVEM_CLIENTE, escolherCandidato, montarPerguntaCliente,
  nomeClienteDosArgs, type CandidatoCliente,
} from "./clientePreflight.ts";

/* Repo público: todo nome/UUID aqui é FICTÍCIO. */
const CANDS: CandidatoCliente[] = [
  { id: "aaaaaaaa-0000-0000-0000-000000000001", nome: "Ficticia Alves Souza" },
  { id: "aaaaaaaa-0000-0000-0000-000000000002", nome: "Ficticia Barros Souza" },
];

Deno.test("as tools listadas são só ESCRITA que resolve cliente por nome", () => {
  // A lista tem de conter as do incidente e NÃO conter consultas.
  assert("registrar_relacao_bancaria" in TOOLS_QUE_RESOLVEM_CLIENTE);
  assert("atualizar_status_credencial_gov" in TOOLS_QUE_RESOLVEM_CLIENTE);
  assert(!("consultar_apolices" in TOOLS_QUE_RESOLVEM_CLIENTE));
  assert(!("consultar_cliente" in TOOLS_QUE_RESOLVEM_CLIENTE));
  // Todo valor é o "o que NÃO foi feito" (frase, não vazio).
  for (const [tool, txt] of Object.entries(TOOLS_QUE_RESOLVEM_CLIENTE)) {
    assert(txt.trim().length > 5, `${tool} sem frase de "não foi feito"`);
  }
});

Deno.test("nomeClienteDosArgs respeita a precedência de handlers.ts", () => {
  assertEquals(nomeClienteDosArgs({ cliente_nome: " Ficticia ", client_nome: "Outra" }), "Ficticia");
  assertEquals(nomeClienteDosArgs({ client_nome: "Ficticia B" }), "Ficticia B");
  assertEquals(nomeClienteDosArgs({ nome: "Ficticia C" }), "Ficticia C");
  assertEquals(nomeClienteDosArgs({ cliente_nome: "   " }), null);
  assertEquals(nomeClienteDosArgs({}), null);
});

/* ─── A.4 (1): a pergunta vem ANTES, e diz o que não foi feito ──────────────── */

Deno.test("pergunta de ambiguidade lista candidatos e diz o que NÃO foi feito", () => {
  const q = montarPerguntaCliente("Ficticia", CANDS, "nada foi registrado");
  assert(q.includes("1. Ficticia Alves Souza"), q);
  assert(q.includes("2. Ficticia Barros Souza"), q);
  assert(q.includes("nada foi registrado"), q);
  // Nunca UUID no texto (cláusula H).
  assert(!/[0-9a-f]{8}-[0-9a-f]{4}-/i.test(q), q);
});

Deno.test("0 candidatos pede confirmação/cadastro, não inventa", () => {
  const q = montarPerguntaCliente("Inexistente", [], "a apólice não foi registrada");
  assert(q.includes("Não encontrei cliente"), q);
  assert(q.includes("a apólice não foi registrada"), q);
});

/* ─── A.4 (2): a resposta curta CONTINUA a ação ─────────────────────────────── */

Deno.test("escolha pelo nome discriminante", () => {
  assertEquals(escolherCandidato("Ficticia Alves Souza", CANDS)?.id, CANDS[0].id);
  assertEquals(escolherCandidato("é a Barros", CANDS)?.id, CANDS[1].id);
  assertEquals(escolherCandidato("a dona Ficticia Barros", CANDS)?.id, CANDS[1].id);
});

Deno.test("escolha pelo número da lista e pelo ordinal", () => {
  assertEquals(escolherCandidato("2", CANDS)?.id, CANDS[1].id);
  assertEquals(escolherCandidato("a 1", CANDS)?.id, CANDS[0].id);
  assertEquals(escolherCandidato("o segundo", CANDS)?.id, CANDS[1].id);
  assertEquals(escolherCandidato("a primeira", CANDS)?.id, CANDS[0].id);
  // Fora da faixa não escolhe nada.
  assertEquals(escolherCandidato("7", CANDS), null);
});

Deno.test("token comum a TODOS os candidatos não desempata (é o que causou a ambiguidade)", () => {
  // "Ficticia" e "Souza" estão nos dois → sozinhos não escolhem.
  assertEquals(escolherCandidato("Ficticia", CANDS), null);
  assertEquals(escolherCandidato("Souza", CANDS), null);
  assertEquals(escolherCandidato("Ficticia Souza", CANDS), null);
});

Deno.test("tratamento e conectivo sozinhos não escolhem", () => {
  assertEquals(escolherCandidato("a dona", CANDS), null);
  assertEquals(escolherCandidato("sim", CANDS), null);
  assertEquals(escolherCandidato("", CANDS), null);
});

Deno.test("pedido NOVO (mensagem longa) não é interpretado como escolha", () => {
  const longo = "na verdade esquece isso, registra a apólice da SEGURADORA EXEMPLO com "
    + "prêmio de 43,90 mensal descontado no extrato e abre uma pendência para conferir depois";
  assertEquals(escolherCandidato(longo, CANDS), null);
});

Deno.test("mais de um número na frase não vira escolha por índice", () => {
  // "de 2025 a 2 vezes" — dois números: ambíguo, não escolhe.
  assertEquals(escolherCandidato("de 2025, 2 vezes", CANDS), null);
});

Deno.test("empate entre candidatos devolve null (a pergunta se repete, sem chute)", () => {
  const tres: CandidatoCliente[] = [
    { id: "b1", nome: "Ficticia Alves Souza" },
    { id: "b2", nome: "Ficticia Alves Lima" },
    { id: "b3", nome: "Ficticia Barros Souza" },
  ];
  // "Alves" casa 2 candidatos → empate.
  assertEquals(escolherCandidato("Alves", tres), null);
  // "Alves Lima" desempata.
  assertEquals(escolherCandidato("Alves Lima", tres)?.id, "b2");
});

Deno.test("acento e caixa não impedem o casamento", () => {
  const acentuados: CandidatoCliente[] = [
    { id: "c1", nome: "Ficticia Conceição Ramos" },
    { id: "c2", nome: "Ficticia Andrade Ramos" },
  ];
  assertEquals(escolherCandidato("CONCEICAO", acentuados)?.id, "c1");
  assertEquals(escolherCandidato("conceição", acentuados)?.id, "c1");
});
