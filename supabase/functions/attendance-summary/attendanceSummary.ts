// Puro/testável — sem I/O. Usado por index.ts (edge attendance-summary).
export const SUMMARY_FIELDS = [
  "problemas","bancos","contratos","emprestimos","tarifas",
  "acoes_possiveis","documentos_solicitados","pendencias","orientacoes","proximos_passos",
] as const;

export type SummaryField = typeof SUMMARY_FIELDS[number];
export type AttendanceSummary = Record<SummaryField, string> & { gerado_em: string; fonte: string };

const FIELD_LABELS: Record<SummaryField, string> = {
  problemas: "Problemas relatados", bancos: "Bancos/credores envolvidos",
  contratos: "Contratos", emprestimos: "Empréstimos", tarifas: "Tarifas/cobranças",
  acoes_possiveis: "Ações possíveis", documentos_solicitados: "Documentos solicitados",
  pendencias: "Pendências", orientacoes: "Orientações dadas", proximos_passos: "Próximos passos",
};

// Monta o texto-insumo (papéis rotulados + resumos de anexos), com teto de chars
// (mantém o INÍCIO — onde costuma estar o contexto do atendimento).
export function assembleInput(
  messages: { role: string; content: string }[],
  attachmentSummaries: string[],
  maxChars = 12000,
): string {
  const conv = messages
    .filter((m) => (m.content ?? "").trim().length > 0)
    .map((m) => `${m.role === "user" ? "Cliente/recepção" : m.role === "assistant" ? "Assistente" : m.role}: ${m.content.trim()}`)
    .join("\n");
  const anexos = attachmentSummaries.filter((s) => (s ?? "").trim()).map((s) => `- ${s.trim()}`).join("\n");
  let out = "";
  if (conv) out += `CONVERSA DO ATENDIMENTO:\n${conv}\n`;
  if (anexos) out += `\nRESUMOS DE DOCUMENTOS DO ATENDIMENTO:\n${anexos}\n`;
  return out.slice(0, maxChars);
}

// Monta o texto-insumo a partir das transcrições do atendimento (6.1 → Whisper),
// na ordem em que vêm, com teto de chars (mantém o INÍCIO). Fonte real do 6.2:
// substitui o antigo insumo (chat da sessão do cliente, sempre vazio — chat é global).
export function assembleTranscriptionInput(
  transcricoes: string[],
  maxChars = 12000,
): string {
  const joined = transcricoes
    .filter((t) => (t ?? "").trim().length > 0)
    .map((t) => t.trim())
    .join("\n\n");
  if (!joined) return "";
  return `TRANSCRIÇÃO DO ATENDIMENTO:\n${joined}\n`.slice(0, maxChars);
}

export function buildSummaryPrompt(): string {
  const campos = SUMMARY_FIELDS.map((f) => `- "${f}" (${FIELD_LABELS[f]})`).join("\n");
  return [
    "Você resume atendimentos jurídicos (contexto: revisão de contratos bancários/consignados).",
    "Recebe o CONTEÚDO textual de um atendimento e produz um resumo ESTRUTURADO em JSON.",
    "Responda APENAS com um objeto JSON com EXATAMENTE estas chaves (todas string):",
    campos,
    "",
    "REGRAS (anti-alucinação): seja fiel e objetivo; NÃO invente. Se um dado não estiver",
    "explícito no conteúdo, escreva exatamente \"não informado\" naquele campo. É melhor",
    "\"não informado\" do que chutar. Este resumo é insumo para revisão humana.",
    "Escreva em português do Brasil, conciso.",
  ].join("\n");
}

function coerce(v: unknown): string {
  if (v == null) return "";
  if (Array.isArray(v)) return v.map((x) => String(x)).filter(Boolean).join("; ");
  return String(v);
}

export function normalizeSummary(raw: unknown, fonte: string, geradoEm: string): AttendanceSummary {
  const obj = (raw && typeof raw === "object") ? raw as Record<string, unknown> : {};
  const out = { gerado_em: geradoEm, fonte } as AttendanceSummary;
  for (const f of SUMMARY_FIELDS) {
    const val = coerce(obj[f]).trim();
    (out as Record<string, string>)[f] = val.length ? val : "não informado";
  }
  return out;
}
