import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  findIdentityDocId, fieldsForCadastro, computeMissingFields, buildPendenciaDescricao, isIdentityDoc, parseOcrFields,
} from "./ocrApplyGlue.ts";

const identityFields = [
  { key: "doc_type", value: "identidade", needsReview: false },
  { key: "cpf", value: "123.456.789-09", needsReview: false },
  { key: "rg", value: "MG-12.345.678", needsReview: false },
  { key: "mother_name", value: "Maria", needsReview: true }, // baixa confiança
];

Deno.test("findIdentityDocId acha o anexo de identidade (doc_type identidade/cnh)", () => {
  const docs = [
    { id: "a1", ocrFields: [{ key: "doc_type", value: "comprovante_residencia" }] },
    { id: "a2", ocrFields: identityFields },
  ];
  assertEquals(findIdentityDocId(docs), "a2");
});

Deno.test("findIdentityDocId → null quando nenhum doc é de identidade", () => {
  assertEquals(findIdentityDocId([{ id: "x", ocrFields: [{ key: "doc_type", value: "outro" }] }]), null);
  assertEquals(findIdentityDocId([]), null);
});

Deno.test("isIdentityDoc reconhece identidade e cnh, rejeita outros", () => {
  assert(isIdentityDoc(parseOcrFields([{ key: "doc_type", value: "cnh" }])));
  assert(!isIdentityDoc(parseOcrFields([{ key: "doc_type", value: "extrato_inss" }])));
});

Deno.test("fieldsForCadastro só pega alta confiança e mapeia colunas (sem doc_type)", () => {
  const out = fieldsForCadastro(identityFields);
  assertEquals(out.cpf, "123.456.789-09");
  assertEquals(out.rg, "MG-12.345.678");
  assertEquals(out.mother_name, undefined); // needsReview → fora
  assertEquals((out as Record<string, string>).doc_type, undefined); // nunca cadastro
});

Deno.test("computeMissingFields lista ausentes + [REVISAR] em pt-BR", () => {
  const missing = computeMissingFields(identityFields);
  // mother_name veio [REVISAR] → deve aparecer
  assert(missing.includes("nome da mãe"), `esperava 'nome da mãe' em ${JSON.stringify(missing)}`);
  // birth_date ausente → aparece
  assert(missing.includes("data de nascimento"));
  // cpf/rg entraram com confiança → NÃO aparecem
  assert(!missing.includes("CPF"));
  assert(!missing.includes("RG"));
});

Deno.test("buildPendenciaDescricao inclui nome e faltantes", () => {
  const d = buildPendenciaDescricao("João Silva", ["CPF", "data de nascimento"]);
  assert(d.includes("João Silva"));
  assert(d.includes("CPF, data de nascimento"));
});
