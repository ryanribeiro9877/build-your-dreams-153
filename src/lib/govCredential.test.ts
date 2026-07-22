import { describe, it, expect } from "vitest";
import { decideGovCredential } from "./govCredential";

describe("decideGovCredential — decisão da coleta de credencial GOV.BR no wizard", () => {
  it("usuário + senha + consentimento → save", () => {
    expect(decideGovCredential("12345678900", "senha123", true)).toBe("save");
  });

  it("usuário + senha SEM consentimento → missing-consent (avisa, não trava)", () => {
    expect(decideGovCredential("12345678900", "senha123", false)).toBe("missing-consent");
  });

  it("nada preenchido → skip (cadastro segue sem tocar na credencial)", () => {
    expect(decideGovCredential("", "", false)).toBe("skip");
    expect(decideGovCredential("", "", true)).toBe("skip");
  });

  it("preenchimento parcial (só um dos dois) → skip", () => {
    expect(decideGovCredential("12345678900", "", true)).toBe("skip");
    expect(decideGovCredential("", "senha123", true)).toBe("skip");
  });

  it("usuário só com espaços não conta como preenchido → skip", () => {
    expect(decideGovCredential("   ", "senha123", true)).toBe("skip");
  });

  it("senha com espaços É válida (não sofre trim) → save", () => {
    expect(decideGovCredential("usuario", "   ", true)).toBe("save");
  });
});
