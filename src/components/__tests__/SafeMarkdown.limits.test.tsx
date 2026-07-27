// B5 (E2E 24/07) — guarda de tamanho do renderizador de mensagens.
//
// A aba congelou ~3 min ao renderizar a resposta de um fluxo: sem teto, uma
// mensagem enorme virava milhares de nós React de uma vez (long task). Estes
// testes travam o contrato das guardas: formatação normal abaixo do limite, texto
// puro acima dele, truncagem avisada no limite duro.

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SafeMarkdown, RICH_LIMIT, HARD_LIMIT } from "../SafeMarkdown";

describe("SafeMarkdown — guardas de tamanho (B5)", () => {
  it("abaixo do limite: mantém a formatação rica (negrito vira <strong>)", () => {
    const { container } = render(<SafeMarkdown>{"olá **mundo**"}</SafeMarkdown>);
    expect(container.querySelector("strong")?.textContent).toBe("mundo");
  });

  it("acima do limite: renderiza TEXTO PURO (sem tokenizar) para não travar a aba", () => {
    const big = "a".repeat(RICH_LIMIT + 1) + " **negrito**";
    const { container } = render(<SafeMarkdown>{big}</SafeMarkdown>);
    // nenhum nó de formatação foi criado — o conteúdo continua presente como texto
    expect(container.querySelector("strong")).toBeNull();
    expect(container.textContent).toContain("**negrito**");
  });

  it("acima do limite duro: trunca e avisa, preservando o começo do conteúdo", () => {
    const huge = "b".repeat(HARD_LIMIT + 500);
    const { container } = render(<SafeMarkdown>{huge}</SafeMarkdown>);
    expect(container.textContent).toContain("conteúdo muito longo");
    // não renderiza mais do que o teto (+ o texto do aviso)
    expect((container.textContent ?? "").length).toBeLessThan(HARD_LIMIT + 200);
  });

  it("vazio continua não renderizando nada", () => {
    const { container } = render(<SafeMarkdown>{""}</SafeMarkdown>);
    expect(container.firstChild).toBeNull();
  });

  it("mensagem de chat típica não é afetada pela guarda", () => {
    render(<SafeMarkdown>{"Processo criado para **ANA** — confira a lista."}</SafeMarkdown>);
    expect(screen.getByText("ANA").tagName).toBe("STRONG");
  });
});
