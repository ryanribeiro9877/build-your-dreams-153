import { describe, it, expect, vi } from "vitest";

// chatImages importa o cliente supabase (para loadSessionImages); mockamos para
// não instanciar o client real (URL/anon ausentes no ambiente de teste).
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(),
    storage: { from: vi.fn() },
  },
}));

import {
  isImageFile,
  isImageMime,
  validateImageFile,
  IMAGE_FILE_SIZE_LIMIT,
} from "./chatImages";

// Helper: cria um File "fake" com tamanho controlado sem alocar os bytes de fato.
function fakeFile(name: string, type: string, size: number): File {
  const f = new File(["x"], name, { type });
  Object.defineProperty(f, "size", { value: size });
  return f;
}

describe("isImageMime", () => {
  it("reconhece mimes de imagem e ignora o resto", () => {
    expect(isImageMime("image/png")).toBe(true);
    expect(isImageMime("image/jpeg")).toBe(true);
    expect(isImageMime("application/pdf")).toBe(false);
    expect(isImageMime(null)).toBe(false);
    expect(isImageMime(undefined)).toBe(false);
  });
});

describe("isImageFile", () => {
  it("detecta por mime", () => {
    expect(isImageFile(fakeFile("a.png", "image/png", 100))).toBe(true);
  });
  it("detecta por extensão quando o mime vem vazio", () => {
    expect(isImageFile(fakeFile("scan.jpg", "", 100))).toBe(true);
  });
  it("não trata documento como imagem", () => {
    expect(isImageFile(fakeFile("peca.pdf", "application/pdf", 100))).toBe(false);
  });
});

describe("validateImageFile", () => {
  it("aceita PNG/JPG/WEBP dentro do limite", () => {
    expect(validateImageFile(fakeFile("a.png", "image/png", 1024))).toBeNull();
    expect(validateImageFile(fakeFile("a.jpg", "image/jpeg", 1024))).toBeNull();
    expect(validateImageFile(fakeFile("a.webp", "image/webp", 1024))).toBeNull();
  });

  it("rejeita não-imagem com aviso claro", () => {
    const err = validateImageFile(fakeFile("doc.pdf", "application/pdf", 1024));
    expect(err).toMatch(/não é uma imagem suportada/i);
  });

  it("rejeita imagem acima do limite de tamanho", () => {
    const err = validateImageFile(fakeFile("big.png", "image/png", IMAGE_FILE_SIZE_LIMIT + 1));
    expect(err).toMatch(/grande demais/i);
  });

  it("aceita no limite exato de tamanho", () => {
    expect(validateImageFile(fakeFile("edge.png", "image/png", IMAGE_FILE_SIZE_LIMIT))).toBeNull();
  });

  it("aceita por extensão quando o mime vem vazio", () => {
    expect(validateImageFile(fakeFile("scan.jpeg", "", 2048))).toBeNull();
  });
});
