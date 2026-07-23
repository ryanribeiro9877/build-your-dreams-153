// Trilho A — mensagem de voz no chat (gravar → transcrever → revisar → enviar).
//
// Sobe o áudio gravado ao bucket privado `chat-attachments`, cria a linha normal
// em `chat_attachments` (mime audio/webm, extracted_text=null) e invoca a edge
// `transcribe-audio` SÍNCRONA (com timeout) — espelho do invoke de OCR de imagem
// em `ingestChatAttachments`. Devolve a transcrição para o front preencher o
// campo de digitação; o usuário revisa e envia normalmente.
//
// A transcrição também fica persistida em `chat_attachments.extracted_text` (o
// edge grava), mas o anexo `audio/*` é EXCLUÍDO dos documentos de caso no
// orquestrador (ver caseDocFilter): voz é comando, não prova.

import { supabase } from "@/integrations/supabase/client";

// Flag espelho da env do edge (default OFF): com "false"/ausente, o botão de
// microfone de gravação não aparece. Padrão idêntico ao OCR_ENABLED.
export const TRANSCRIPTION_ENABLED =
  String(import.meta.env.VITE_TRANSCRIPTION_ENABLED).toLowerCase() === "true";

// Timeout do invoke síncrono: o Whisper pode levar alguns segundos por ~2 min de
// áudio. Ao estourar, degrade — o campo fica editável e nada bloqueia.
const INVOKE_TIMEOUT_MS = 20_000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("transcribe_timeout")), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

export interface VoiceTranscriptionResult {
  ok: boolean;
  text: string;
}

export async function transcribeVoiceMessage(
  sessionId: string,
  userId: string,
  blob: Blob,
): Promise<VoiceTranscriptionResult> {
  // Path determinístico SEM nome de arquivo do usuário → chave de Storage sempre válida.
  const path = `${userId}/${sessionId}/${Date.now()}_voice.webm`;

  const { error: upErr } = await supabase.storage
    .from("chat-attachments")
    .upload(path, blob, { upsert: false, contentType: blob.type || "audio/webm" });
  if (upErr) return { ok: false, text: "" };

  const { data: inserted, error: insErr } = await supabase
    .from("chat_attachments")
    .insert({
      session_id: sessionId,
      user_id: userId,
      storage_path: path,
      file_name: "mensagem_de_voz.webm",
      mime_type: blob.type || "audio/webm",
      file_size: blob.size,
      extracted_text: null,
    })
    .select("id")
    .single();
  if (insErr || !inserted) return { ok: false, text: "" };

  try {
    const { data } = await withTimeout(
      supabase.functions.invoke("transcribe-audio", { body: { attachmentId: inserted.id } }),
      INVOKE_TIMEOUT_MS,
    );
    const d = data as { ok?: boolean; text?: string } | null;
    if (d?.ok && typeof d.text === "string" && d.text.trim()) {
      return { ok: true, text: d.text.trim() };
    }
  } catch {
    // timeout / rede → degrade seguro (campo continua editável)
  }
  return { ok: false, text: "" };
}
