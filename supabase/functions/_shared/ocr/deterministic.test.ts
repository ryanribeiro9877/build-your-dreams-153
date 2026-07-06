import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  extractDeterministicFields,
  formatCpf,
  isValidCpf,
} from "./deterministic.ts";
import type { OcrLine } from "./types.ts";

const THRESHOLD = 0.85;

// CPFs fictícios com dígito verificador CORRETO (uso em teste).
const VALID_CPF = "529.982.247-25";
const VALID_CPF_2 = "111.444.777-35";
// Mesmos 9 primeiros dígitos do válido, DV trocado → inválido.
const INVALID_CPF = "529.982.247-24";

Deno.test("isValidCpf: aceita CPF com dígito verificador correto", () => {
  assert(isValidCpf(VALID_CPF));
  assert(isValidCpf(VALID_CPF_2));
  assert(isValidCpf("12345678909")); // cru, sem formatação
});

Deno.test("isValidCpf: rejeita DV errado, repetidos e tamanho errado", () => {
  assert(!isValidCpf(INVALID_CPF));
  assert(!isValidCpf("111.111.111-11"));
  assert(!isValidCpf("123"));
  assert(!isValidCpf(""));
});

Deno.test("formatCpf: normaliza para 000.000.000-00", () => {
  assertEquals(formatCpf("52998224725"), "529.982.247-25");
});

Deno.test("CPF válido em documento legível → alta confiança, sem review", () => {
  const lines: OcrLine[] = [{ text: `CPF ${VALID_CPF}`, confidence: 0.98 }];
  const fields = extractDeterministicFields(`CPF ${VALID_CPF}`, lines, "RG_autora", THRESHOLD);
  const cpf = fields.find((f) => f.key === "cpf");
  assert(cpf, "cpf capturado");
  assertEquals(cpf!.method, "deterministic");
  assertEquals(cpf!.sourceDocument, "RG_autora");
  assert(cpf!.confidence >= THRESHOLD, `confiança ${cpf!.confidence} deve ser alta`);
  assertEquals(cpf!.needsReview, false);
});

Deno.test("CPF com DV inválido → confiança tampada e needsReview, mesmo legível", () => {
  const lines: OcrLine[] = [{ text: `CPF ${INVALID_CPF}`, confidence: 0.99 }];
  const fields = extractDeterministicFields(`CPF ${INVALID_CPF}`, lines, "doc", THRESHOLD);
  const cpf = fields.find((f) => f.key === "cpf");
  assert(cpf);
  assert(cpf!.confidence <= 0.3, `confiança ${cpf!.confidence} deve ser baixa`);
  assertEquals(cpf!.needsReview, true);
  assertEquals(cpf!.reviewReason, "dígito verificador não confere");
});

Deno.test("CPF válido em documento borrado → abaixo do limiar → review", () => {
  const lines: OcrLine[] = [{ text: `CPF ${VALID_CPF}`, confidence: 0.5 }];
  const fields = extractDeterministicFields(`CPF ${VALID_CPF}`, lines, "doc", THRESHOLD);
  const cpf = fields.find((f) => f.key === "cpf");
  assert(cpf);
  assert(cpf!.confidence < THRESHOLD, "borrado fica abaixo do limiar");
  assertEquals(cpf!.needsReview, true);
});

Deno.test("data, CEP e RG são capturados com atribuição", () => {
  const text = "Nascimento 05/03/1990\nCEP 01310-100\nRG 12.345.678-9";
  const lines: OcrLine[] = [
    { text: "Nascimento 05/03/1990", confidence: 0.97 },
    { text: "CEP 01310-100", confidence: 0.96 },
    { text: "RG 12.345.678-9", confidence: 0.9 },
  ];
  const fields = extractDeterministicFields(text, lines, "RG_autora", THRESHOLD);
  const date = fields.find((f) => f.key === "date");
  const cep = fields.find((f) => f.key === "cep");
  const rg = fields.find((f) => f.key === "rg");
  assert(date && cep && rg, "data, cep e rg capturados");
  assertEquals(date!.value, "05/03/1990");
  assertEquals(cep!.value, "01310-100");
  assertEquals(date!.sourceDocument, "RG_autora");
  // data carrega motivo de atribuição (é o campo do ALERTA 1).
  assertEquals(date!.method, "regex");
});

Deno.test("múltiplas datas no mesmo doc → indexadas (date, date_2)", () => {
  const text = "Emissao 01/01/2020 Nascimento 05/03/1990";
  const lines: OcrLine[] = [{ text, confidence: 0.95 }];
  const fields = extractDeterministicFields(text, lines, "doc", THRESHOLD);
  const dates = fields.filter((f) => f.key === "date" || f.key === "date_2");
  assertEquals(dates.length, 2);
});
