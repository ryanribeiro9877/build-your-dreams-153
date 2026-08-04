import { describe, expect, it, vi } from "vitest";

// ingestChatAttachments.ts importa o client do Supabase e a flag de transcrição no
// topo; sem VITE_SUPABASE_URL o createClient lança na carga do módulo. Este teste
// só exercita a CLASSIFICAÇÃO pura do anexo, então stubamos as duas dependências.
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/transcribeVoiceMessage", () => ({ TRANSCRIPTION_ENABLED: false }));

import { isAudioAttachment } from "./ingestChatAttachments";

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
