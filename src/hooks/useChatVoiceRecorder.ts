import { useCallback, useEffect, useRef, useState } from "react";
import { TIMESLICE_MS, pickAudioMime, isRecordingSupported } from "@/lib/attendanceAudio";

// Gravador de MENSAGEM DE VOZ do chat (Trilho A). Diferente do atendimento
// (useAttendanceRecorder), aqui é um blob ÚNICO, sem rotação: o usuário grava um
// trecho curto, para, e o áudio inteiro sai como um Blob para transcrever.
// Auto-stop em 2 min (limite do briefing). Ao parar, chama `onComplete(blob)`.

// Limite de gravação (~2 min). Ao atingir, para sozinho e entrega o que houver.
export const MAX_RECORDING_MS = 120_000;

export interface UseChatVoiceRecorder {
  supported: boolean;
  recording: boolean;
  elapsedMs: number;
  error: string | null;
  start(): Promise<void>;
  stop(): void;
}

export function useChatVoiceRecorder(
  onComplete: (blob: Blob) => void,
): UseChatVoiceRecorder {
  const [supported] = useState(isRecordingSupported);
  const [recording, setRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const mimeRef = useRef("audio/webm");
  const tickTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedAtRef = useRef(0);
  // onComplete via ref: evita recriar start/stop a cada render do consumidor.
  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

  const clearTimers = useCallback(() => {
    if (tickTimerRef.current) { clearInterval(tickTimerRef.current); tickTimerRef.current = null; }
    if (maxTimerRef.current) { clearTimeout(maxTimerRef.current); maxTimerRef.current = null; }
  }, []);

  const stop = useCallback(() => {
    clearTimers();
    // onstop (definido no start) monta o blob e chama onComplete.
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setRecording(false);
  }, [clearTimers]);

  const start = useCallback(async () => {
    if (!supported || recording) return;
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      mimeRef.current = pickAudioMime();
      startedAtRef.current = Date.now();
      const chunks: BlobPart[] = [];
      const rec = new MediaRecorder(stream, { mimeType: mimeRef.current });
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(chunks, { type: mimeRef.current });
        if (blob.size > 0) onCompleteRef.current(blob);
      };
      rec.start(TIMESLICE_MS);
      recorderRef.current = rec;
      tickTimerRef.current = setInterval(
        () => setElapsedMs(Date.now() - startedAtRef.current), 1000,
      );
      // Auto-stop no limite: para e entrega o áudio gravado até aqui.
      maxTimerRef.current = setTimeout(() => stop(), MAX_RECORDING_MS);
      setElapsedMs(0);
      setRecording(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao acessar o microfone");
    }
  }, [supported, recording, stop]);

  // cleanup ao desmontar.
  useEffect(() => () => { stop(); }, [stop]);

  return { supported, recording, elapsedMs, error, start, stop };
}
