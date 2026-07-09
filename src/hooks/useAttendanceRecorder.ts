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
  const chunksRef = useRef<BlobPart[]>([]);
  const sessionRef = useRef<string>("");
  const blockIndexRef = useRef(0);
  const blockStartRef = useRef(0);
  const rotateTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef(0);
  const mimeRef = useRef("audio/webm");
  const queueRef = useRef<ReturnType<typeof createUploadQueue> | null>(null);

  // Monta o bloco a partir dos chunks acumulados e enfileira o upload.
  const flushBlock = useCallback(() => {
    if (chunksRef.current.length === 0) return;
    const blob = new Blob(chunksRef.current, { type: mimeRef.current });
    chunksRef.current = [];
    const block: AttendanceBlock = {
      sessionId: sessionRef.current,
      blockIndex: blockIndexRef.current,
      startedAt: blockStartRef.current,
      durationMs: Date.now() - blockStartRef.current,
      blob,
      mimeType: mimeRef.current,
    };
    blockIndexRef.current += 1;
    blockStartRef.current = Date.now();
    queueRef.current?.enqueue(block);
  }, []);

  const newRecorder = useCallback(() => {
    const stream = streamRef.current!;
    const rec = new MediaRecorder(stream, { mimeType: mimeRef.current });
    rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    rec.onstop = () => flushBlock();
    rec.start(TIMESLICE_MS);
    recorderRef.current = rec;
  }, [flushBlock]);

  // rotação: para o recorder (onstop faz o flush) e recomeça no MESMO stream.
  const rotate = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
      newRecorder();
    }
  }, [newRecorder]);

  const start = useCallback(async () => {
    if (!supported || recording) return;
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      mimeRef.current = pickAudioMime();
      sessionRef.current = newSessionId();
      blockIndexRef.current = 0;
      const now = Date.now();
      blockStartRef.current = now;
      startedAtRef.current = now;
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

  const stop = useCallback(() => {
    if (rotateTimerRef.current) { clearInterval(rotateTimerRef.current); rotateTimerRef.current = null; }
    if (tickTimerRef.current) { clearInterval(tickTimerRef.current); tickTimerRef.current = null; }
    if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setRecording(false);
  }, []);

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
