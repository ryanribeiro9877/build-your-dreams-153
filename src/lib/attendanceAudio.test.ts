import { describe, it, expect, vi } from "vitest";

// attendanceAudio.ts importa o client do Supabase (via clientDocuments/uploadAttendanceBlock);
// stubamos como em clientDocuments.test.ts para não quebrar na carga do módulo.
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import {
  AUDIO_ATENDIMENTO_TYPE,
  buildAttendancePath,
  buildAttendanceName,
  buildAttendanceNotes,
  buildAudioDocInsert,
  parseSessionIdFromPath,
  groupBySession,
  type AudioDocRow,
} from "./attendanceAudio";

describe("attendanceAudio — naming", () => {
  it("path agrupa por cliente/sessão e preserva ordem no blockIndex", () => {
    const p = buildAttendancePath("c1", "s-abc", 2, 1720540800000);
    expect(p).toBe("c1/atendimento/s-abc/2_1720540800000.webm");
  });

  it("parseSessionIdFromPath extrai o sessionId do prefixo", () => {
    expect(parseSessionIdFromPath("c1/atendimento/s-abc/2_1720540800000.webm")).toBe("s-abc");
    expect(parseSessionIdFromPath("c1/rg.png")).toBeNull();
  });

  it("nome humano usa bloco 1-based", () => {
    // 2026-07-09 12:00 local — checamos só o sufixo do bloco p/ não depender de TZ.
    expect(buildAttendanceName(Date.parse("2026-07-09T12:00:00"), 0)).toMatch(/bloco 1$/);
    expect(buildAttendanceName(Date.parse("2026-07-09T12:00:00"), 4)).toMatch(/bloco 5$/);
  });
});

describe("attendanceAudio — buildAudioDocInsert", () => {
  it("grava document_type audio_atendimento, status recebido, origem recepcao e notes", () => {
    const notes = buildAttendanceNotes({ sessionId: "s1", blockIndex: 0, durationMs: 1000, startedAt: 10 });
    const row = buildAudioDocInsert("c1", "MARIA", "u1", {
      filePath: "c1/atendimento/s1/0_10.webm",
      fileSize: 123,
      mimeType: "audio/webm",
      notes,
      name: "Atendimento 09/07/2026 12:00 — bloco 1",
    });
    expect(row.document_type).toBe(AUDIO_ATENDIMENTO_TYPE);
    expect(row.status).toBe("recebido");
    expect(row.origem).toBe("recepcao");
    expect(row.mime_type).toBe("audio/webm");
    expect(JSON.parse(row.notes as string)).toMatchObject({ session_id: "s1", block_index: 0 });
  });
});

describe("attendanceAudio — groupBySession", () => {
  it("agrupa por sessão, ordena blocos por block_index e soma duração", () => {
    const rows: AudioDocRow[] = [
      { id: "b", file_path: "c1/atendimento/s1/1_20.webm", document_name: "b1", mime_type: "audio/webm",
        notes: JSON.stringify({ session_id: "s1", block_index: 1, duration_ms: 200, started_at: 20 }), created_at: "2026-07-09T12:10:00Z" },
      { id: "a", file_path: "c1/atendimento/s1/0_10.webm", document_name: "b0", mime_type: "audio/webm",
        notes: JSON.stringify({ session_id: "s1", block_index: 0, duration_ms: 100, started_at: 10 }), created_at: "2026-07-09T12:00:00Z" },
      { id: "c", file_path: "c1/atendimento/s2/0_99.webm", document_name: "x", mime_type: "audio/webm",
        notes: null, created_at: "2026-07-09T13:00:00Z" },
    ];
    const sessions = groupBySession(rows);
    expect(sessions).toHaveLength(2);
    const s1 = sessions.find((s) => s.sessionId === "s1")!;
    expect(s1.blocks.map((r) => r.id)).toEqual(["a", "b"]); // ordenado por block_index
    expect(s1.totalDurationMs).toBe(300);
    // s2 sem notes ainda agrupa pelo file_path
    expect(sessions.find((s) => s.sessionId === "s2")!.blocks).toHaveLength(1);
  });

  it("agrupa pelo file_path mesmo quando notes.session_id diverge (path é a fonte de verdade)", () => {
    const rows: AudioDocRow[] = [
      { id: "x", file_path: "c1/atendimento/sPATH/0_10.webm", document_name: "b0", mime_type: "audio/webm",
        notes: JSON.stringify({ session_id: "sNOTES", block_index: 0, duration_ms: 100, started_at: 10 }), created_at: "2026-07-09T12:00:00Z" },
    ];
    const sessions = groupBySession(rows);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].sessionId).toBe("sPATH");
  });
});
