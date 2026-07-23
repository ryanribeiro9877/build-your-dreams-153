// supabase/functions/chat-orchestrator/ocrDocContext.ts
//
// Trilho B (documento→ação): monta o bloco de contexto que o especialista de
// cadastro/recepção recebe quando um anexo do chat foi CLASSIFICADO por OCR
// (tem `doc_type` em `ocr_fields`). O agente usa isso para propor cadastro/
// atualização via ActionCard — nunca executa sozinho.
//
// Fonte: `chat_attachments.ocr_fields` (jsonb array de campos com
// key/value/needsReview) + `ocr_confidence`. Só entram anexos que têm um campo
// `doc_type` (senão o bloco fica vazio e nada muda no comportamento atual).

const DOC_TYPE_KEY = "doc_type";

/** Rótulos legíveis por tipo de documento. */
const DOC_TYPE_LABELS: Record<string, string> = {
  identidade: "documento de identidade (RG)",
  cnh: "CNH",
  comprovante_residencia: "comprovante de residência",
  extrato_inss: "extrato do INSS",
  contracheque: "contracheque",
  procuracao: "procuração",
  outro: "outro documento",
};

interface OcrFieldLite {
  key: string;
  value: string;
  needsReview?: boolean;
}

export interface OcrDoc {
  file_name: string;
  ocr_fields: unknown;
  ocr_confidence: number | null;
}

/** Normaliza o jsonb de ocr_fields para uma lista tipada (defensivo). */
function parseFields(raw: unknown): OcrFieldLite[] {
  if (!Array.isArray(raw)) return [];
  const out: OcrFieldLite[] = [];
  for (const f of raw) {
    if (f && typeof f === "object" && typeof (f as { key?: unknown }).key === "string") {
      const ff = f as { key: string; value?: unknown; needsReview?: unknown };
      out.push({
        key: ff.key,
        value: ff.value == null ? "" : String(ff.value),
        needsReview: ff.needsReview === true,
      });
    }
  }
  return out;
}

function docTypeOf(fields: OcrFieldLite[]): string | null {
  const dt = fields.find((f) => f.key === DOC_TYPE_KEY);
  return dt && dt.value ? dt.value.toLowerCase() : null;
}

/**
 * Monta o bloco de contexto dos documentos classificados por OCR. Retorna "" se
 * nenhum anexo tiver `doc_type` (comportamento atual preservado).
 */
export function buildOcrDocContext(docs: OcrDoc[]): string {
  const lines: string[] = [];
  for (const d of docs) {
    const fields = parseFields(d.ocr_fields);
    const docType = docTypeOf(fields);
    if (!docType) continue; // só anexos classificados entram

    const label = DOC_TYPE_LABELS[docType] ?? docType;
    const conf = typeof d.ocr_confidence === "number"
      ? ` (confiança ${d.ocr_confidence.toFixed(2)})`
      : "";
    lines.push(`- ${d.file_name} — tipo: ${label}${conf}`);
    for (const f of fields) {
      if (f.key === DOC_TYPE_KEY) continue; // já exibido como "tipo:"
      if (!f.value) continue;
      const flag = f.needsReview ? " [REVISAR]" : "";
      lines.push(`  • ${f.key} = ${f.value}${flag}`);
    }
  }
  if (lines.length === 0) return "";
  return [
    "DOCUMENTO(S) IDENTIFICADO(S) POR OCR (anexo do chat):",
    ...lines,
    "Campos marcados [REVISAR] têm baixa confiança — NÃO afirme como fato; trate como a preencher.",
  ].join("\n");
}
