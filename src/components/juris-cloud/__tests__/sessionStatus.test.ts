import { describe, it, expect } from "vitest";
import { deriveConversationStatus, ACTIVE_RUN_STATUSES, STATUS_META } from "../sessionStatus";

describe("deriveConversationStatus — status por conversa (card 2.4)", () => {
  it("sinal AO VIVO (thinking) tem prioridade ⇒ em andamento", () => {
    // Mesmo sem status de run no banco ainda, a UI já rastreia a geração.
    expect(deriveConversationStatus(null, true)).toBe("em_andamento");
    // E vence até um status terminal desatualizado no banco.
    expect(deriveConversationStatus("done", true)).toBe("em_andamento");
  });

  it("sem run conhecida e sem thinking ⇒ null (não inventa status)", () => {
    expect(deriveConversationStatus(null, false)).toBeNull();
    expect(deriveConversationStatus(undefined, false)).toBeNull();
  });

  it("todos os status ATIVOS de run ⇒ em andamento", () => {
    for (const st of ACTIVE_RUN_STATUSES) {
      expect(deriveConversationStatus(st, false)).toBe("em_andamento");
    }
  });

  it("done ⇒ concluída · failed ⇒ erro · awaiting_confirmation ⇒ aguardando", () => {
    expect(deriveConversationStatus("done", false)).toBe("concluida");
    expect(deriveConversationStatus("failed", false)).toBe("erro");
    expect(deriveConversationStatus("awaiting_confirmation", false)).toBe("aguardando");
  });

  it("status desconhecido/não mapeado ⇒ null (honestidade: melhor sem rótulo)", () => {
    // "cancelled" NÃO existe em orchestration_runs — não mapeamos "cancelada".
    expect(deriveConversationStatus("cancelled", false)).toBeNull();
    expect(deriveConversationStatus("routing_qualquer_coisa", false)).toBeNull();
    expect(deriveConversationStatus("", false)).toBeNull();
  });

  it("STATUS_META cobre exatamente os 4 status derivávels", () => {
    expect(Object.keys(STATUS_META).sort()).toEqual(
      ["aguardando", "concluida", "em_andamento", "erro"],
    );
    for (const meta of Object.values(STATUS_META)) {
      expect(meta.label.length).toBeGreaterThan(0);
      expect(meta.dot).toMatch(/^#|rgb/);
    }
  });
});
