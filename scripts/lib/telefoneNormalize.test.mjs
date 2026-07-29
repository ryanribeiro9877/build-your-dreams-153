// Testes da normalização de TELEFONE (adendo ao Card 1). Rodar: node --test scripts/lib/
//
// Todos os números aqui são FICTÍCIOS, escritos para o teste — nenhum vem das
// planilhas reais.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatarTelefoneBR, classificarTelefone, extrairTelefonesDaCelula,
  parseWhatsappDeclarado, montarItemTelefone, pontuarCabecalhoTelefone,
} from "./telefoneNormalize.mjs";

test("formatarTelefoneBR: mesma máscara do cadastro (formatPhone do front)", () => {
  assert.equal(formatarTelefoneBR("71988887777"), "(71) 98888-7777");
  assert.equal(formatarTelefoneBR("7133334444"), "(71) 3333-4444");
  // tamanho fora de 10/11 volta cru (quem chama já validou)
  assert.equal(formatarTelefoneBR("123"), "123");
});

test("classificarTelefone: celular, fixo e o 55 do país", () => {
  assert.equal(classificarTelefone("(71) 98888-7777").tipo, "celular");
  assert.equal(classificarTelefone("71 3333-4444").tipo, "fixo");
  // +55 sai só quando o resto tem tamanho nacional
  assert.equal(classificarTelefone("+55 71 98888-7777").telefone, "(71) 98888-7777");
  assert.equal(classificarTelefone("5571988887777").digitos, "71988887777");
});

test("classificarTelefone: lixo é recusado com motivo", () => {
  assert.deepEqual(classificarTelefone("123").motivo, "curto_demais");
  assert.deepEqual(classificarTelefone("0000000000").motivo, "digito_repetido");
  assert.deepEqual(classificarTelefone("0199988887777").motivo, "longo_demais");
  assert.deepEqual(classificarTelefone("0188887777").motivo, "ddd_invalido");   // DDD 01
  assert.deepEqual(classificarTelefone("71188887777").motivo, "celular_sem_nove"); // 9 dígitos sem o 9
});

// Regra explícita do desenho: NÃO inventar o nono dígito. O número entra como
// está e o aviso manda a recepção confirmar na ligação.
test("classificarTelefone: celular pré-2016 entra com aviso, sem inventar o nono dígito", () => {
  const r = classificarTelefone("71 8888-7777");
  assert.equal(r.ok, true);
  assert.equal(r.digitos, "7188887777");          // 10 dígitos, intacto
  assert.equal(r.tipo, "celular_antigo");
  assert.equal(r.aviso, "formato_antigo_verificar");
});

test("extrairTelefonesDaCelula: vários números na mesma célula", () => {
  const r = extrairTelefonesDaCelula("(71) 98888-7777 / (71) 3333-4444");
  assert.deepEqual(r.telefones.map(t => t.telefone), ["(71) 98888-7777", "(71) 3333-4444"]);

  const r2 = extrairTelefonesDaCelula("71988887777, 7133334444");
  assert.equal(r2.telefones.length, 2);

  // máscaras completas coladas, sem separador
  const r3 = extrairTelefonesDaCelula("(71)98888-7777(71)3333-4444");
  assert.equal(r3.telefones.length, 2);
});

test("extrairTelefonesDaCelula: dedupe e descarte com motivo", () => {
  const r = extrairTelefonesDaCelula("71988887777 / (71) 98888-7777 / 123");
  assert.equal(r.telefones.length, 1);              // o mesmo número duas vezes
  assert.deepEqual(r.descartes.map(d => d.motivo), ["curto_demais"]);
});

test("extrairTelefonesDaCelula: máscara não é quebrada por separador simples", () => {
  // um único espaço/hífen/parêntese faz parte da máscara — não separa números
  assert.equal(extrairTelefonesDaCelula("(71) 98888-7777").telefones.length, 1);
  assert.equal(extrairTelefonesDaCelula("71 98888 7777").telefones.length, 1);
});

test("extrairTelefonesDaCelula: célula vazia ou sem dígito não gera nada", () => {
  assert.deepEqual(extrairTelefonesDaCelula(""), { telefones: [], descartes: [] });
  assert.deepEqual(extrairTelefonesDaCelula(null), { telefones: [], descartes: [] });
  assert.deepEqual(extrairTelefonesDaCelula("não tem"), { telefones: [], descartes: [] });
});

// WhatsApp nunca é inferido: "é celular" NÃO implica WhatsApp. null = não declarado
// e a RPC deixa o flag como está.
test("parseWhatsappDeclarado: só o que a planilha declara", () => {
  assert.equal(parseWhatsappDeclarado("sim"), true);
  assert.equal(parseWhatsappDeclarado("X"), true);
  assert.equal(parseWhatsappDeclarado("zap"), true);
  assert.equal(parseWhatsappDeclarado("não"), false);
  assert.equal(parseWhatsappDeclarado("0"), false);
  assert.equal(parseWhatsappDeclarado(""), null);
  assert.equal(parseWhatsappDeclarado("talvez"), null);
  assert.equal(parseWhatsappDeclarado(null), null);
});

test("montarItemTelefone: dedupe entre células e formato do lote", () => {
  const r = montarItemTelefone({
    nome: "  Maria da Silva ",
    cpf: "123.456.789-09",
    celulas: ["(71) 98888-7777", "71988887777 / 71 3333-4444"],
    whatsapp: "sim",
    origem: "PLANILHA X / aba Y",
  });
  assert.deepEqual(r.item, {
    nome: "Maria da Silva",
    cpf: "12345678909",
    telefones: ["(71) 98888-7777", "(71) 3333-4444"],
    whatsapp_declarado: true,
    origem: "PLANILHA X / aba Y",
  });
});

test("montarItemTelefone: sem telefone válido → null (não vai para o lote)", () => {
  assert.equal(montarItemTelefone({ nome: "Fulano", celulas: ["", "abc", "123"] }), null);
  assert.equal(montarItemTelefone({ nome: "", celulas: ["71988887777"] }), null);
});

test("montarItemTelefone: avisos de formato antigo sobem para o relatório", () => {
  const r = montarItemTelefone({ nome: "Fulano", celulas: ["71 8888-7777"], origem: "P" });
  assert.equal(r.item.telefones.length, 1);
  assert.deepEqual(r.avisos, [{ telefone: "(71) 8888-7777", aviso: "formato_antigo_verificar" }]);
});

test("montarItemTelefone: cpf ausente vira null (a RPC cai no match por nome)", () => {
  const r = montarItemTelefone({ nome: "Fulano", cpf: "", celulas: ["71988887777"] });
  assert.equal(r.item.cpf, null);
});

test("pontuarCabecalhoTelefone: sugere coluna, com acento e caixa quaisquer", () => {
  assert.ok(pontuarCabecalhoTelefone("Telefone") > 0);
  assert.ok(pontuarCabecalhoTelefone("CELULAR / WHATS") > 0);
  assert.ok(pontuarCabecalhoTelefone("Contato") > 0);
  assert.ok(pontuarCabecalhoTelefone("Nº do telefone") > 0);
  assert.equal(pontuarCabecalhoTelefone("Nome completo"), 0);
  assert.equal(pontuarCabecalhoTelefone("Banco"), 0);
  assert.equal(pontuarCabecalhoTelefone(""), 0);
});
