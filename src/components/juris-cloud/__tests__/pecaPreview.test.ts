import { describe, it, expect } from "vitest";
import { truncatePecaPreview, PECA_PREVIEW_LINES } from "../pecaPreview";

describe("truncatePecaPreview", () => {
  it("não trunca texto vazio", () => {
    expect(truncatePecaPreview("")).toEqual({ preview: "", truncated: false });
  });

  it("não trunca quando há menos linhas que o limite", () => {
    const text = "linha 1\nlinha 2\nlinha 3";
    expect(truncatePecaPreview(text)).toEqual({ preview: text, truncated: false });
  });

  it("não trunca quando há exatamente o limite de linhas", () => {
    const text = Array.from({ length: PECA_PREVIEW_LINES }, (_, i) => `linha ${i + 1}`).join("\n");
    const r = truncatePecaPreview(text);
    expect(r.truncated).toBe(false);
    expect(r.preview).toBe(text);
  });

  it("trunca às primeiras N linhas quando há mais que o limite", () => {
    const total = Array.from({ length: PECA_PREVIEW_LINES + 5 }, (_, i) => `linha ${i + 1}`);
    const text = total.join("\n");
    const r = truncatePecaPreview(text);
    expect(r.truncated).toBe(true);
    expect(r.preview).toBe(total.slice(0, PECA_PREVIEW_LINES).join("\n"));
    // o trecho tem exatamente N linhas
    expect(r.preview.split("\n")).toHaveLength(PECA_PREVIEW_LINES);
  });

  it("respeita um maxLines customizado", () => {
    const text = "a\nb\nc\nd";
    const r = truncatePecaPreview(text, 2);
    expect(r).toEqual({ preview: "a\nb", truncated: true });
  });

  it("preserva as quebras de linha (markdown por linha) do trecho", () => {
    const text = "**Título**\n\nparágrafo 1\nparágrafo 2\n" + "x\n".repeat(20);
    const r = truncatePecaPreview(text);
    expect(r.truncated).toBe(true);
    expect(r.preview.startsWith("**Título**\n\nparágrafo 1")).toBe(true);
  });
});
