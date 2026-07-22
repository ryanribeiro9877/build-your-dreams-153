import { describe, it, expect, vi } from "vitest";

// generateCooperadoDocs.ts importa o client do Supabase no topo; sem
// VITE_SUPABASE_URL (ambiente de teste/CI) o createClient lança
// "supabaseUrl is required." na carga do módulo. Este teste só exercita a
// função pura selectDocsToGenerate, então stubamos o client. (Mesmo padrão de
// clientDocuments.test.ts.)
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { selectDocsToGenerate } from "./generateCooperadoDocs";
import { COOPERADO_DOC_DEFS } from "./cooperadoDocs";

const ALL_TYPES = COOPERADO_DOC_DEFS.map((d) => d.documentType);

describe("selectDocsToGenerate — idempotência dos documentos de sistema", () => {
  it("sem nenhum gerado, gera os 4 documentos do cooperado", () => {
    expect(selectDocsToGenerate([]).map((d) => d.documentType)).toEqual(ALL_TYPES);
  });

  // Regressão do bug 2026-07-22: reabrir a fase de documentos / concluir um
  // upload regerava os 4 docs, criando 20 linhas onde deviam existir 4.
  it("com todos os 4 tipos já gerados, não regenera nenhum", () => {
    expect(selectDocsToGenerate(ALL_TYPES)).toEqual([]);
  });

  it("gera apenas os tipos que ainda faltam", () => {
    const out = selectDocsToGenerate(["procuracao", "contrato_honorarios"]);
    expect(out.map((d) => d.documentType)).toEqual([
      "declaracao_hipossuficiencia",
      "termo_cooperado",
    ]);
  });

  it("ignora tipos desconhecidos presentes na lista de já gerados", () => {
    const out = selectDocsToGenerate(["procuracao", "xpto_inexistente"]);
    const types = out.map((d) => d.documentType);
    expect(types).not.toContain("procuracao");
    expect(types).toContain("contrato_honorarios");
    expect(types).toHaveLength(3);
  });
});
