import { describe, it, expect } from "vitest";
import {
  primeiroNome,
  apenasDigitos,
  telefoneBR,
  renderBirthdayMessage,
  waMeUrl,
  telHref,
  DEFAULT_BIRTHDAY_TEMPLATE,
} from "./aniversariantes";

describe("primeiroNome", () => {
  it("pega o primeiro token", () => {
    expect(primeiroNome("Maria Silva Souza")).toBe("Maria");
  });
  it("tolera espaços extras", () => {
    expect(primeiroNome("  João   Pedro ")).toBe("João");
  });
  it("string vazia → vazia", () => {
    expect(primeiroNome("")).toBe("");
  });
});

describe("apenasDigitos", () => {
  it("remove máscara", () => {
    expect(apenasDigitos("(31) 99999-8888")).toBe("31999998888");
  });
  it("null/undefined → vazio", () => {
    expect(apenasDigitos(null)).toBe("");
    expect(apenasDigitos(undefined)).toBe("");
  });
});

describe("telefoneBR (DDI 55 sem duplicar)", () => {
  it("celular com máscara ganha o 55", () => {
    expect(telefoneBR("(31) 99999-8888")).toBe("5531999998888");
  });
  it("fixo (10 dígitos) ganha o 55", () => {
    expect(telefoneBR("(31) 3333-4444")).toBe("553133334444");
  });
  it("número que já veio com DDI 55 (13 dígitos) NÃO duplica", () => {
    expect(telefoneBR("5531999998888")).toBe("5531999998888");
  });
  it("DDD 55 (Santa Maria/RS) sem DDI recebe o DDI corretamente", () => {
    // "(55) 99999-8888" → 11 dígitos → prefixa DDI → 55 + 55 + assinante
    expect(telefoneBR("(55) 99999-8888")).toBe("5555999998888");
  });
  it("vazio → vazio", () => {
    expect(telefoneBR("")).toBe("");
    expect(telefoneBR(null)).toBe("");
  });
});

describe("renderBirthdayMessage", () => {
  it("substitui {nome} pelo primeiro nome", () => {
    expect(renderBirthdayMessage(DEFAULT_BIRTHDAY_TEMPLATE, "João Pedro")).toBe(
      "Olá, João! 🎉 A equipe do Bacellar Advogados deseja um feliz aniversário!",
    );
  });
  it("substitui todas as ocorrências de {nome}", () => {
    expect(renderBirthdayMessage("{nome}, feliz aniversário {nome}!", "Ana Lima")).toBe(
      "Ana, feliz aniversário Ana!",
    );
  });
});

describe("waMeUrl", () => {
  it("monta wa.me com número BR e mensagem url-encoded", () => {
    const url = waMeUrl("(31) 99999-8888", "Olá, João! 🎉");
    expect(url.startsWith("https://wa.me/5531999998888?text=")).toBe(true);
    // espaço e vírgula codificados; texto recuperável ao decodificar
    const text = decodeURIComponent(url.split("?text=")[1]);
    expect(text).toBe("Olá, João! 🎉");
  });
});

describe("telHref", () => {
  it("gera tel:+<E164>", () => {
    expect(telHref("(31) 3333-4444")).toBe("tel:+553133334444");
  });
  it("vazio → tel: inócuo", () => {
    expect(telHref(null)).toBe("tel:");
  });
});
