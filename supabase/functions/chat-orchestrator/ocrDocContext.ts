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
 * Aritmética de idade DETERMINÍSTICA (nunca delegada ao LLM — num sistema
 * jurídico, capacidade civil errada é inaceitável). Aceita "DD/MM/AAAA",
 * "DD-MM-AAAA", "DD.MM.AAAA" e ISO "AAAA-MM-DD". Devolve a idade em anos
 * completos na data `now`, ou null se a data não for parseável/plausível
 * (nesse caso nenhuma linha de idade é injetada).
 */
export function computeAge(birthDate: string, now: Date): number | null {
  const s = (birthDate || "").trim();
  let y: number, mo: number, d: number;
  const br = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/); // DD/MM/AAAA
  if (br) {
    d = +br[1]; mo = +br[2]; y = +br[3];
  } else {
    const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); // ISO AAAA-MM-DD
    if (!iso) return null;
    y = +iso[1]; mo = +iso[2]; d = +iso[3];
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const ny = now.getUTCFullYear(), nm = now.getUTCMonth() + 1, nd = now.getUTCDate();
  let age = ny - y;
  if (nm < mo || (nm === mo && nd < d)) age--; // ainda não fez aniversário
  if (age < 0 || age > 130) return null; // fora do plausível → provável erro de OCR
  return age;
}

/**
 * Linha de idade pronta (fato já calculado que o LLM só consome). Se a data de
 * nascimento veio com baixa confiança ([REVISAR]), a idade sai explicitamente
 * como "a confirmar" — nunca como fato firme.
 */
function ageLine(birthDate: string, needsReview: boolean, now: Date): string | null {
  const age = computeAge(birthDate, now);
  if (age == null) return null;
  const capacidade = age >= 18 ? "maior de idade" : "menor de idade";
  if (needsReview) {
    return `  • idade calculada: ${age} anos (${capacidade}) — derivada de data de nascimento lida com BAIXA confiança; CONFIRME a data antes de afirmar`;
  }
  return `  • idade calculada: ${age} anos (${capacidade})`;
}

/**
 * Monta o bloco de contexto dos documentos classificados por OCR. Retorna "" se
 * nenhum anexo tiver `doc_type` (comportamento atual preservado). `now` é
 * injetável para testes; em produção usa a data corrente do edge.
 */
export function buildOcrDocContext(docs: OcrDoc[], now: Date = new Date()): string {
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
    // Idade determinística: a aritmética de data é feita AQUI (código), não pelo
    // LLM. Considera sufixos (birth_date_2) e respeita o [REVISAR] da data.
    const bd = fields.find((f) => f.key.replace(/_\d+$/, "") === "birth_date" && f.value);
    if (bd) {
      const al = ageLine(bd.value, !!bd.needsReview, now);
      if (al) lines.push(al);
    }
  }
  if (lines.length === 0) return "";
  return [
    "DOCUMENTO(S) IDENTIFICADO(S) POR OCR (anexo do chat):",
    ...lines,
    // REGRA DE CONFIANÇA (#3): campos [REVISAR] NUNCA como fato. O caso clássico
    // é o número do CPF lido no campo RG (verso do documento).
    "REGRA DE CONFIANÇA (obrigatória): campos marcados [REVISAR] foram lidos com BAIXA confiança e PODEM estar errados ou trocados (ex.: o número do CPF aparecer no campo RG). É PROIBIDO apresentá-los como validados e é PROIBIDO dizer \"validei/conferi os dados\". Ao citar um campo [REVISAR], escreva exatamente no formato \"li com baixa confiança, confirme: <campo> = <valor>?\" e aguarde a confirmação do usuário antes de tratar como fato.",
    "Afirme como certos SOMENTE os campos SEM [REVISAR]. A linha \"idade calculada\" acima já é determinística — use-a como está, não recalcule.",
    "",
    OCR_ACTION_GUIDANCE,
  ].join("\n");
}

// Guia de ação (Trilho B) anexada ao bloco quando há documento classificado.
// Vive AQUI (código versionado/testável), não no prompt do agente em prod: a
// orientação é da SITUAÇÃO (o documento), não da persona, e vale para qualquer
// especialista que atender o turno. Cobre cadastro novo (glue determinístico
// aplica os campos + cria a pendência após a confirmação) e CPF já cadastrado
// (propõe pendência de revisão no cliente existente — nunca duplica).
export const OCR_ACTION_GUIDANCE = [
  "COMO AGIR COM O DOCUMENTO ACIMA (sempre PROPONHA via ActionCard; nunca execute sem a confirmação do usuário):",
  "1. Se for documento de identidade (identidade/CNH) e tiver CPF: chame consultar_cliente com esse CPF para verificar se a pessoa já está cadastrada.",
  "2. Se NÃO existir cliente com esse CPF: proponha cadastrar_cliente com o nome e o CPF lidos do documento. Os demais campos do documento serão preenchidos automaticamente após a confirmação, e uma pendência de \"completar cadastro\" será criada listando o que faltar — NÃO precisa listar campo por campo você mesmo.",
  "3. Se o CPF JÁ estiver cadastrado: NUNCA cadastre de novo (não duplique). Em vez disso, proponha criar_pendencia apontando o cliente existente (cliente_id), título \"Revisar cadastro (documento recebido)\", descrevendo os dados lidos do documento, para revisão humana.",
  "4. Para outros tipos de documento (comprovante de residência, extrato do INSS, contracheque, procuração): use os dados como contexto; se identificar uma ação pertinente, proponha-a via ActionCard.",
].join("\n");
