// Item 3d do reteste 3 (27/07): o rótulo auditável estava sendo gravado em
// processes.process_number (campo do número no TRIBUNAL), o que quebraria busca por
// número, registrar_protocolo, integração Projudi/PJE e relatórios. Agora o campo
// fica NULL até haver número real e o rótulo é DERIVADO na exibição.

import { describe, it, expect } from "vitest";
import { processLabel } from "../processLabel";

describe("processLabel", () => {
  it("com número real, devolve o número (nunca inventa rótulo)", () => {
    expect(processLabel({ process_number: "0801234-56.2026.8.05.0001" }))
      .toBe("0801234-56.2026.8.05.0001");
  });

  it("sem número, deriva cliente + tipo + data", () => {
    const s = processLabel({
      process_number: null,
      client_name: "ANA LUCIA ANDRADE SANTOS",
      tipo_acao_nome: "Refin não autorizado / inexistência de relação jurídica",
      created_at: "2026-07-27T16:15:00.000Z",
    });
    expect(s.startsWith("(a distribuir) — ANA — ")).toBe(true);
    expect(s).toContain("Refin não autorizado");
    expect(s).toContain("27/07");
  });

  it("sem número e sem partes, devolve só o marcador", () => {
    expect(processLabel({ process_number: null })).toBe("(a distribuir)");
    expect(processLabel({})).toBe("(a distribuir)");
  });

  it("número vazio/espaços conta como ausente", () => {
    expect(processLabel({ process_number: "   " })).toBe("(a distribuir)");
  });

  it("data inválida é omitida em vez de virar 'Invalid Date'", () => {
    const s = processLabel({ process_number: null, client_name: "João", created_at: "não-é-data" });
    expect(s).toBe("(a distribuir) — João");
    expect(s).not.toContain("Invalid");
  });

  it("tipo longo é truncado sem cortar palavra no meio", () => {
    const s = processLabel({
      process_number: null,
      tipo_acao_nome: "Desconto indevido (Bradesco: tarifa, capitalização, investimento, seguro)",
    });
    expect(s.length).toBeLessThan(60);
    expect(s).toContain("Desconto indevido");
  });
});
