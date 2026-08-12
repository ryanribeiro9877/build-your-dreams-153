import { describe, it, expect } from "vitest";
import { safeInternalPath } from "./safeRoute";

describe("safeInternalPath", () => {
  it("deixa passar caminho interno normal", () => {
    expect(safeInternalPath("/sistema/tarefas")).toBe("/sistema/tarefas");
    expect(safeInternalPath("/clientes?busca=ana#topo")).toBe("/clientes?busca=ana#topo");
  });

  it("apara espaços em volta", () => {
    expect(safeInternalPath("  /sistema/agenda  ")).toBe("/sistema/agenda");
  });

  it("REJEITA protocol-relative (o open redirect da CVE)", () => {
    expect(safeInternalPath("//evil.com")).toBeNull();
    expect(safeInternalPath("//evil.com/fake-login")).toBeNull();
  });

  it("REJEITA barra invertida que o navegador normaliza para //", () => {
    expect(safeInternalPath("/\\evil.com")).toBeNull();
    expect(safeInternalPath("\\\\evil.com")).toBeNull();
  });

  it("REJEITA URL absoluta e esquemas perigosos", () => {
    expect(safeInternalPath("https://evil.com")).toBeNull();
    expect(safeInternalPath("javascript:alert(1)")).toBeNull();
    expect(safeInternalPath("mailto:a@b.c")).toBeNull();
  });

  it("REJEITA caminho relativo (ambíguo quanto à base)", () => {
    expect(safeInternalPath("sistema/tarefas")).toBeNull();
    expect(safeInternalPath("../admin")).toBeNull();
  });

  it("REJEITA caracteres de controle", () => {
    expect(safeInternalPath("/rota" + String.fromCharCode(0) + "x")).toBeNull();
    expect(safeInternalPath("/rota" + String.fromCharCode(10) + "x")).toBeNull();
  });

  it("REJEITA vazio, nulo e não-string", () => {
    expect(safeInternalPath("")).toBeNull();
    expect(safeInternalPath("   ")).toBeNull();
    expect(safeInternalPath(null)).toBeNull();
    expect(safeInternalPath(undefined)).toBeNull();
  });
});
