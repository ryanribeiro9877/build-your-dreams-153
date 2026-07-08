import { describe, it, expect } from "vitest";
import { isValidCPF, isValidCNPJ, isValidEmail, formatCNPJ } from "../shared";

// CADASTRO-MODELO-A §3/§9 — dígitos verificadores e máscara de CNPJ.

describe("isValidCPF", () => {
  it("aceita CPF com DV correto", () => {
    expect(isValidCPF("529.982.247-25")).toBe(true);
    expect(isValidCPF("52998224725")).toBe(true);
  });
  it("rejeita DV incorreto e sequências repetidas", () => {
    expect(isValidCPF("529.982.247-24")).toBe(false);
    expect(isValidCPF("111.111.111-11")).toBe(false);
    expect(isValidCPF("123")).toBe(false);
  });
  it("trata vazio como válido (obrigatoriedade é à parte)", () => {
    expect(isValidCPF("")).toBe(true);
  });
});

describe("isValidCNPJ", () => {
  it("aceita CNPJ com DV correto", () => {
    expect(isValidCNPJ("11.222.333/0001-81")).toBe(true);
    expect(isValidCNPJ("11222333000181")).toBe(true);
  });
  it("rejeita DV incorreto e repetidos", () => {
    expect(isValidCNPJ("11.222.333/0001-82")).toBe(false);
    expect(isValidCNPJ("00.000.000/0000-00")).toBe(false);
  });
  it("vazio → válido", () => {
    expect(isValidCNPJ("")).toBe(true);
  });
});

describe("formatCNPJ", () => {
  it("aplica a máscara 00.000.000/0000-00", () => {
    expect(formatCNPJ("11222333000181")).toBe("11.222.333/0001-81");
    expect(formatCNPJ("112223")).toBe("11.222.3");
  });
});

describe("isValidEmail", () => {
  it("valida formato e aceita vazio", () => {
    expect(isValidEmail("a@b.com")).toBe(true);
    expect(isValidEmail("")).toBe(true);
    expect(isValidEmail("nao-email")).toBe(false);
  });
});
