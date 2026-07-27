// Testes das regras do CARD 1. Rodar: node --test scripts/lib/
//
// As senhas usadas aqui são FICTÍCIAS, escritas para o teste — nenhuma vem das
// planilhas reais.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeName, isValidCpf, formatCpf, parseSenhaCell, parseNivel,
  isMarcado, parseRelacoes, parseExtratoBancos, isSim,
} from "./card1Normalize.mjs";

test("normalizeName: dedup por versão sem acento/pontuação em maiúsculas", () => {
  assert.equal(normalizeName("José D'Ávila da Silva-Júnior"), "JOSE D AVILA DA SILVA JUNIOR");
  assert.equal(normalizeName("  maria   da   silva  "), "MARIA DA SILVA");
  // duas grafias do mesmo nome colidem na mesma chave (é o objetivo)
  assert.equal(normalizeName("ANTÔNIO JOSÉ"), normalizeName("antonio jose"));
  assert.equal(normalizeName(null), "");
});

test("isValidCpf: dígito verificador de verdade", () => {
  assert.equal(isValidCpf("123.456.789-09"), true);   // válido
  assert.equal(isValidCpf("12345678909"), true);
  assert.equal(isValidCpf("123.456.789-00"), false);  // DV errado
  assert.equal(isValidCpf("111.111.111-11"), false);  // repetido
  assert.equal(isValidCpf("123"), false);
  assert.equal(isValidCpf(""), false);
  assert.equal(isValidCpf(null), false);
});

test("formatCpf: formata o válido e DESCARTA o inválido (nunca grava sujo)", () => {
  assert.equal(formatCpf("12345678909"), "123.456.789-09");
  assert.equal(formatCpf("123.456.789-09"), "123.456.789-09");
  assert.equal(formatCpf("123.456.789-00"), null);
  assert.equal(formatCpf("abc"), null);
});

test("parseSenhaCell: texto-recado NÃO é senha", () => {
  for (const recado of ["Pedir a senha", "pedir", "não tem", "nao tem senha", "sem senha", "solicitar com o cliente", "aguardando"]) {
    const r = parseSenhaCell(recado);
    assert.equal(r.senha, null, `"${recado}" não deveria virar senha`);
    assert.equal(r.status, "pendente");
  }
});

test("parseSenhaCell: senha marcada como errada → fila de recuperação, sem gravar valor", () => {
  for (const t of ["Senha errada", "senha incorreta", "Xyz123@ (senha errada)", "inválida", "não funciona"]) {
    const r = parseSenhaCell(t);
    assert.equal(r.senha, null, `"${t}" não deveria gravar senha`);
    assert.equal(r.status, "senha_incorreta");
  }
});

test("parseSenhaCell: anotação '(2 fatores)' sai do valor e liga a flag", () => {
  const r = parseSenhaCell("SenhaFicticia9@ (2 fatores)");
  assert.equal(r.senha, "SenhaFicticia9@");   // anotação removida
  assert.equal(r.tem2fa, true);
  assert.equal(r.status, "pendente");
});

test("parseSenhaCell: senha normal passa intacta; vazio/curto é ausente", () => {
  assert.equal(parseSenhaCell("Abc1234@").senha, "Abc1234@");
  assert.equal(parseSenhaCell("  Abc1234@  ").senha, "Abc1234@");
  assert.equal(parseSenhaCell("").senha, null);
  assert.equal(parseSenhaCell("x").senha, null);
  assert.equal(parseSenhaCell("-").senha, null);
});

test("parseNivel: aceita variações e ignora o resto", () => {
  assert.equal(parseNivel("Ouro"), "Ouro");
  assert.equal(parseNivel("OURO "), "Ouro");
  assert.equal(parseNivel("conta prata"), "Prata");
  assert.equal(parseNivel("BRONZE"), "Bronze");
  assert.equal(parseNivel("Ouro e Prata"), "Ouro");   // o mais alto vence
  assert.equal(parseNivel("qualquer coisa"), null);
  assert.equal(parseNivel(""), null);
});

test("isMarcado: X/SIM marcam; texto livre não", () => {
  for (const v of ["X", "x", "XX", "sim", "SIM", "ok", "1"]) assert.equal(isMarcado(v), true, v);
  for (const v of ["", "  ", "não", "talvez", "0"]) assert.equal(isMarcado(v), false, v);
});

test("parseRelacoes: parseia 'BANCO:tipo', dedup e tipo desconhecido → outro", () => {
  const r = parseRelacoes("BMG:consignado; BRB:consignado; FACTA:seguro");
  assert.deepEqual(r, [
    { banco: "BMG", tipo: "consignado" },
    { banco: "BRB", tipo: "consignado" },
    { banco: "FACTA", tipo: "seguro" },
  ]);
  assert.deepEqual(parseRelacoes("X:coisa estranha"), [{ banco: "X", tipo: "outro" }]);
  // duplicata no mesmo texto entra uma única vez
  assert.equal(parseRelacoes("BMG:consignado; BMG:consignado").length, 1);
  assert.deepEqual(parseRelacoes(""), []);
});

test("parseRelacoes: marca extrato só no banco que está em posse", () => {
  const r = parseRelacoes("BRADESCO:consignado; AGIBANK:consignado", { extratoBancos: ["BRADESCO"] });
  assert.equal(r.find((x) => x.banco === "BRADESCO").extrato, true);
  assert.equal(r.find((x) => x.banco === "AGIBANK").extrato, undefined);
});

test("parseExtratoBancos / isSim", () => {
  assert.deepEqual(parseExtratoBancos("BRADESCO; AGIBANK"), ["BRADESCO", "AGIBANK"]);
  assert.deepEqual(parseExtratoBancos(""), []);
  assert.equal(isSim("SIM"), true);
  assert.equal(isSim("não"), false);
});
