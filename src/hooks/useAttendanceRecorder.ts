import { useCallback, useEffect, useRef, useState } from "react";
import {
  ROTATE_MS, TIMESLICE_MS, newSessionId, pickAudioMime, isRecordingSupported,
  uploadAttendanceBlock, createUploadQueue,
  type AttendanceBlock, type QueueItem,
} from "@/lib/attendanceAudio";

export interface UseAttendanceRecorder {
  supported: boolean;
  recording: boolean;
  elapsedMs: number;
  items: QueueItem[];
  start(): Promise<void>;
  stop(): void;
  retry(sessionId: string, blockIndex: number): void;
  error: string | null;
}

export function useAttendanceRecorder(
  clientId: string, clientName: string, uploadedBy: string,
  opts?: { rotateMs?: number },
): UseAttendanceRecorder {
  const rotateMs = opts?.rotateMs ?? ROTATE_MS;
  const [supported] = useState(isRecordingSupported);
  const [recording, setRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const sessionRef = useRef<string>("");
  const blockIndexRef = useRef(0);
  const rotateTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef(0);
  const mimeRef = useRef("audio/webm");
  const queueRef = useRef<ReturnType<typeof createUploadQueue> | null>(null);

  // Monta um bloco a partir dos chunks DAQUELE recorder (buffer capturado no
  // closure, não ref compartilhada) → fronteiras corretas independentemente do
  // timeslice. Enfileira o upload incremental.
  const flushBlock = useCallback((chunks: BlobPart[], blockIndex: number, blockStart: number) => {
    if (chunks.length === 0) return;
    const block: AttendanceBlock = {
      sessionId: sessionRef.current,
      blockIndex,
      startedAt: blockStart,
      durationMs: Date.now() - blockStart,
      blob: new Blob(chunks, { type: mimeRef.current }),
      mimeType: mimeRef.current,
    };
    queueRef.current?.enqueue(block);
  }, []);

  // Cria um MediaRecorder novo no MESMO stream, com buffer/índice/início próprios
  // (capturados no closure). Avança a contabilidade para o próximo bloco.
  const newRecorder = useCallback(() => {
    const stream = streamRef.current!;
    const chunks: BlobPart[] = [];
    const blockIndex = blockIndexRef.current;
    const blockStart = Date.now();
    const rec = new MediaRecorder(stream, { mimeType: mimeRef.current });
    rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    rec.onstop = () => flushBlock(chunks, blockIndex, blockStart);
    rec.start(TIMESLICE_MS);
    recorderRef.current = rec;
    blockIndexRef.current = blockIndex + 1;
  }, [flushBlock]);

  const stop = useCallback(() => {
    if (rotateTimerRef.current) { clearInterval(rotateTimerRef.current); rotateTimerRef.current = null; }
    if (tickTimerRef.current) { clearInterval(tickTimerRef.current); tickTimerRef.current = null; }
    if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setRecording(false);
  }, []);

  // Rotação (invisível ao usuário): para o recorder atual (o onstop faz o flush
  // do bloco) e começa um novo no mesmo stream. Se a criação do novo recorder
  // falhar, encerra falando alto em vez de morrer silenciosamente.
  const rotate = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
      try {
        newRecorder();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Falha ao continuar a gravação");
        stop();
      }
    }
  }, [newRecorder, stop]);

  const start = useCallback(async () => {
    if (!supported || recording) return;
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      mimeRef.current = pickAudioMime();
      sessionRef.current = newSessionId();
      blockIndexRef.current = 0;
      startedAtRef.current = Date.now();
      queueRef.current = createUploadQueue(
        (b) => uploadAttendanceBlock(clientId, clientName, uploadedBy, b),
        setItems,
      );
      newRecorder();
      rotateTimerRef.current = setInterval(rotate, rotateMs);
      tickTimerRef.current = setInterval(() => setElapsedMs(Date.now() - startedAtRef.current), 1000);
      setRecording(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao acessar o microfone");
    }
  }, [supported, recording, clientId, clientName, uploadedBy, newRecorder, rotate, rotateMs]);

  const retry = useCallback((sessionId: string, blockIndex: number) => {
    queueRef.current?.retry(sessionId, blockIndex);
  }, []);

  // beforeunload: avisa se há gravação ou upload pendente.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      const pending = items.some((i) => i.status === "pending" || i.status === "uploading");
      if (recording || pending) { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [recording, items]);

  // cleanup ao desmontar.
  useEffect(() => () => { stop(); }, [stop]);

  return { supported, recording, elapsedMs, items, start, stop, retry, error };
}
