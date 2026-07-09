import { describe, it, expect } from "vitest";
import { CLIENT_DOC_SLOTS, DOC_TYPE_BY_SLOT, type ClientDocSlot } from "./clientDocuments";

// Contrato do banco (produção), verificado via information_schema em 2026-07-09:
// CHECK client_documents_document_type_check. O document_type gravado por qualquer
// slot PRECISA pertencer a este conjunto, senão o INSERT quebra (check_violation).
const ALLOWED_DOC_TYPES = new Set([
  "rg", "cpf", "comprovante", "procuracao", "contrato", "termo_cooperado", "outro",
  "comprovante_residencia", "extrato_conta", "extrato_ir", "extrato_inss", "cnis",
  "certidao", "contrato_honorarios", "declaracao_hipossuficiencia",
]);

// Tipos que o gate documental (required_document_sets) exige e que NÃO têm
// produtor gerado — precisam vir de upload. cpf foi removido por decisão do
// Rodrigo (o CPF já consta no próprio RG).
const GATE_UPLOAD_TYPES = new Set(["rg", "comprovante"]);

describe("clientDocuments — vocabulário de document_type", () => {
  it("todo slot mapeia para um document_type aceito pelo CHECK do banco", () => {
    for (const { slot } of CLIENT_DOC_SLOTS) {
      const dt = DOC_TYPE_BY_SLOT[slot];
      expect(ALLOWED_DOC_TYPES.has(dt), `${slot} → ${dt} fora do CHECK`).toBe(true);
    }
  });

  it("RG frente e verso são dois slots, ambos gravando document_type 'rg'", () => {
    const slots = CLIENT_DOC_SLOTS.map((s) => s.slot);
    expect(slots).toContain("rg_frente");
    expect(slots).toContain("rg_verso");
    expect(DOC_TYPE_BY_SLOT.rg_frente).toBe("rg");
    expect(DOC_TYPE_BY_SLOT.rg_verso).toBe("rg");
  });

  it("comprovante de residência grava 'comprovante' (o que o gate exige)", () => {
    expect(DOC_TYPE_BY_SLOT.comprovante_residencia).toBe("comprovante");
  });

  it("extrato bancário grava 'extrato_conta' (valor válido no CHECK)", () => {
    expect(DOC_TYPE_BY_SLOT.extrato_bancario).toBe("extrato_conta");
  });

  it("os slots obrigatórios cobrem os tipos de upload exigidos pelo gate", () => {
    const producedByRequired = new Set(
      CLIENT_DOC_SLOTS.filter((s) => s.required).map((s) => DOC_TYPE_BY_SLOT[s.slot]),
    );
    for (const t of GATE_UPLOAD_TYPES) {
      expect(producedByRequired.has(t), `nenhum slot obrigatório produz '${t}'`).toBe(true);
    }
  });

  it("não sobra slot fora do mapa (todo ClientDocSlot tem document_type)", () => {
    const mapped = Object.keys(DOC_TYPE_BY_SLOT) as ClientDocSlot[];
    for (const { slot } of CLIENT_DOC_SLOTS) expect(mapped).toContain(slot);
  });
});
