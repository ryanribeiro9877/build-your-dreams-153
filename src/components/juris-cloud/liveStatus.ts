// Live status da orquestração (Caminho B — peça longa).
//
// Objetivo (Frente 1 do card de feedback): traduzir as ETAPAS emitidas pelo
// backend num indicador HONESTO e tranquilizador — rótulo amigável da fase +
// "bloco X de N" (SÓ quando o backend informa um contador real) + cronômetro.
//
// Regras que este módulo garante:
//  - NUNCA expõe o texto cru do validador ("Validador consultivo reprovou
//    rodada 2/2..."), nomes internos de etapa, nem observações de correção.
//    Só o rótulo amigável mapeado por fase sai daqui.
//  - "bloco X de N" só aparece se vier de dado real (regex "(X de N)" no texto
//    da etapa executing_n3). Sem dado real → sem contador inventado.

export interface LiveStage {
  /** Nome interno da fase (uso interno; nunca exibido cru ao usuário). */
  stage?: string;
  /** Rótulo amigável exibido ao usuário. */
  label: string;
  /** Bloco atual, quando o backend informa "(X de N)". */
  blockCurrent?: number;
  /** Total de blocos, quando o backend informa "(X de N)". */
  blockTotal?: number;
}

/**
 * Extrai "(X de N)" do texto da etapa. Retorna null se não houver contador
 * real — jamais inventa números. Ex.: "Redigindo fundamentação (2 de 5)..."
 */
export function parseBlockProgress(
  text: string | null | undefined,
): { current: number; total: number } | null {
  if (!text) return null;
  // Aceita "(2 de 5)" e "(bloco 3 de 5)" — as duas formas emitidas pelo backend.
  const m = text.match(/\(\s*(?:bloco\s+)?(\d+)\s+de\s+(\d+)\s*\)/i);
  if (!m) return null;
  const current = Number(m[1]);
  const total = Number(m[2]);
  if (!Number.isFinite(current) || !Number.isFinite(total)) return null;
  if (total <= 0 || current <= 0 || current > total) return null;
  return { current, total };
}

// Rótulos amigáveis por fase. Deliberadamente genéricos: escondem o log técnico
// cru (2.1) e não revelam rodada de correção/reprovação de validador.
const STAGE_LABELS: Record<string, string> = {
  routing_n1: "Analisando o caso",
  routing_n2: "Encaminhando ao especialista",
  executing_n3: "Redigindo a peça",
  // CADASTRO-CHAT-REFINO #4: fluxo de AÇÃO (cadastro etc.) — rótulo condizente,
  // nunca "Redigindo a peça". Emitido pelo edge como stage "executing_acao".
  executing_acao: "Processando o cadastro",
  validating_n2: "Revisando a peça",
  validating_n1: "Revisão final",
};

/** Rótulo amigável da fase. Fallback neutro para fases desconhecidas. */
export function stageLabel(stage: string | null | undefined): string {
  if (stage && STAGE_LABELS[stage]) return STAGE_LABELS[stage];
  return "Processando";
}

/** Deriva o LiveStage a partir de uma linha de etapa (kind === "stage"). */
export function deriveLiveStage(row: {
  content?: string | null;
  metadata?: { stage?: string } | null;
}): LiveStage {
  const stage = row.metadata?.stage;
  // "bloco X de N" só faz sentido — e só é honesto — durante a redação/correção
  // (executing_n3) E quando o texto traz o contador real.
  const prog = stage === "executing_n3" ? parseBlockProgress(row.content) : null;
  return {
    stage,
    label: stageLabel(stage),
    blockCurrent: prog?.current,
    blockTotal: prog?.total,
  };
}

/** Formata segundos decorridos: "12s", "1min 05s", "3min 20s". */
export function formatElapsed(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  if (s < 60) return `${s}s`;
  const min = Math.floor(s / 60);
  const rem = s % 60;
  return `${min}min ${String(rem).padStart(2, "0")}s`;
}

// Após este tempo sem resposta final, o indicador acrescenta um aviso explícito
// de que peças longas podem demorar (Frente 2). NÃO cancela nada — só informa.
export const LONG_RUN_NOTICE_MS = 210_000; // 3min30s
