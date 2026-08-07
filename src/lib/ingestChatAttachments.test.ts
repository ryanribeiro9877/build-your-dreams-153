import { beforeEach, describe, expect, it, vi } from "vitest";

// ingestChatAttachments.ts importa o client do Supabase e a flag de transcrição no
// topo; sem VITE_SUPABASE_URL o createClient lança na carga do módulo. O mock é
// MUTÁVEL para o teste de órfão poder controlar a resposta do insert — e vive em
// `vi.hoisted` porque `vi.mock` é içado acima das declarações do arquivo.
const { mockSupabase } = vi.hoisted(() => ({
  mockSupabase: { from: vi.fn(), storage: { from: vi.fn() } },
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: mockSupabase }));
vi.mock("@/lib/transcribeVoiceMessage", () => ({ TRANSCRIPTION_ENABLED: false }));
// Extração real puxa pdf.js/mammoth: irrelevante aqui e caro de carregar.
vi.mock("@/lib/extractFileText", () => ({
  extractFileText: vi.fn().mockResolvedValue(null),
  sanitizeExtractedText: (t: string | null) => t,
}));

import { ingestChatAttachments, isAudioAttachment } from "./ingestChatAttachments";

const arquivo = (name: string, type = "") => ({ name, type });

// A.8 (validação 03-04/08, teste A-05): o .ogg anexado à mão era barrado pelo
// ingestor de peça ("anexos não ingeridos — use PDF/DOCX/TXT pesquisável"), o que
// tornava o Card 5 (áudio de autorização) inalcançável pela tela. Classificar o
// áudio ANTES da extração é o que desvia o arquivo para a transcrição.
describe("isAudioAttachment — A.8", () => {
  it("reconhece por MIME audio/*", () => {
    expect(isAudioAttachment(arquivo("qualquer.bin", "audio/ogg"))).toBe(true);
    expect(isAudioAttachment(arquivo("voz", "audio/webm;codecs=opus"))).toBe(true);
    expect(isAudioAttachment(arquivo("voz", "AUDIO/MPEG"))).toBe(true);
  });

  it("reconhece por EXTENSÃO quando o mime vem vazio (caso medido)", () => {
    for (const nome of [
      "autorizacao.ogg", "autorizacao.oga", "voz.opus", "mensagem_de_voz.webm",
      "gravacao.m4a", "gravacao.MP3", "gravacao.wav", "gravacao.aac", "gravacao.amr",
    ]) {
      expect(isAudioAttachment(arquivo(nome))).toBe(true);
    }
  });

  it("NÃO confunde documento textual nem imagem com áudio", () => {
    expect(isAudioAttachment(arquivo("contrato.pdf", "application/pdf"))).toBe(false);
    expect(isAudioAttachment(arquivo("peca.docx"))).toBe(false);
    expect(isAudioAttachment(arquivo("extrato.txt", "text/plain"))).toBe(false);
    expect(isAudioAttachment(arquivo("rg.png", "image/png"))).toBe(false);
    // "ogg" no meio do nome não conta — a regra é a extensão final.
    expect(isAudioAttachment(arquivo("logging.txt"))).toBe(false);
    expect(isAudioAttachment(arquivo(""))).toBe(false);
  });

  it("a lista de extensões é a MESMA do espelho no edge (caseDocFilter.ts)", () => {
    // Se estas listas divergirem, o áudio volta a ser tratado como insumo de peça
    // em um dos lados. O espelho do edge é supabase/functions/chat-orchestrator/
    // caseDocFilter.ts — este teste documenta o contrato compartilhado.
    const esperadas = ["ogg", "oga", "opus", "webm", "m4a", "mp3", "wav", "aac", "amr", "mp4a"];
    for (const ext of esperadas) {
      expect(isAudioAttachment(arquivo(`arquivo.${ext}`))).toBe(true);
    }
  });
});

/* ── ÓRFÃO DE STORAGE: o upload que sobe e não vira registro ─────────────────── */

// A causa medida em 06/08: o binário sobe ao bucket ANTES do insert em
// chat_attachments. Quando o insert falhava, o arquivo ficava no bucket sem
// sessão, sem dono e sem retenção — e o usuário lia "não subiu". Documento de
// cliente (PII) largado, e ninguém sabendo que estava lá.
describe("ingestChatAttachments — não deixa órfão no bucket", () => {
  const upload = vi.fn();
  const remove = vi.fn();
  const insert = vi.fn();

  // O `.select().eq()...maybeSingle()` da trava anti-duplicação: sempre "não existe".
  const selectChain = {
    select: () => selectChain,
    eq: () => selectChain,
    limit: () => selectChain,
    maybeSingle: () => Promise.resolve({ data: null }),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    upload.mockResolvedValue({ error: null });
    remove.mockResolvedValue({ error: null });
    mockSupabase.storage.from.mockReturnValue({ upload, remove });
    mockSupabase.from.mockReturnValue({ ...selectChain, insert });
  });

  const pdf = () => ({
    name: "contrato.pdf", size: 1024, type: "application/pdf",
  } as unknown as File);

  it("insert falhou → o arquivo recém-subido é REMOVIDO do bucket", async () => {
    insert.mockReturnValue({
      select: () => ({ single: () => Promise.resolve({ data: null, error: { message: "23503" } }) }),
    });

    const r = await ingestChatAttachments("sess-1", "user-1", [pdf()]);

    // Subiu, o registro falhou, então o binário não pode ficar lá.
    expect(upload).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(1);
    // Removido pelo MESMO caminho que foi usado no upload.
    const pathSubido = upload.mock.calls[0][0];
    expect(remove.mock.calls[0][0]).toEqual([pathSubido]);
    // E a mensagem ao usuário é verdadeira: não ficou anexado.
    expect(r.uploaded).toBe(0);
    expect(r.failedUpload).toEqual(["contrato.pdf"]);
  });

  it("insert OK → nada é removido (o caminho bom segue intacto)", async () => {
    insert.mockReturnValue({
      select: () => ({ single: () => Promise.resolve({ data: { id: "att-1" }, error: null }) }),
    });

    const r = await ingestChatAttachments("sess-1", "user-1", [pdf()]);

    expect(upload).toHaveBeenCalledTimes(1);
    expect(remove).not.toHaveBeenCalled();
    expect(r.uploaded).toBe(1);
    expect(r.failedUpload).toEqual([]);
    // PDF sem texto extraível continua sendo relatado como tal (gate da tela).
    expect(r.failedExtraction).toEqual(["contrato.pdf"]);
  });
});
