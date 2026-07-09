// TRILHA C · 6.3 — mapeamento determinístico (texto livre → tipo de pendência do
// criar_pendencia) + título padronizado. Puro/testável (sem I/O).

// Enum aceito por criar_pendencia (registry.ts / RPC criar_pendencia).
export const PENDENCIA_TIPOS = [
  "documentacao","comprovante_endereco","senha_inss","reset_inss","extratos",
  "falta_documentacao","audiencia","reuniao","andamento","whatsapp","outro",
] as const;

// Menções livres → tipo. Chaves normalizadas (lower/trim). Default: 'documentacao'
// (o tipo genérico do enum) — nunca inventa um tipo fora do CHECK.
const DOC_TIPO_MAP: Record<string, string> = {
  "extrato": "extratos",
  "extratos": "extratos",
  "extrato bancario": "extratos",
  "extrato bancário": "extratos",
  "contrato": "documentacao",
  "comprovante": "comprovante_endereco",
  "comprovante de endereco": "comprovante_endereco",
  "comprovante de endereço": "comprovante_endereco",
  "comprovante de residencia": "comprovante_endereco",
  "comprovante de residência": "comprovante_endereco",
  "senha inss": "senha_inss",
  "senha do inss": "senha_inss",
  "senha": "senha_inss",
  "rg": "documentacao",
  "cpf": "documentacao",
  "procuracao": "documentacao",
  "procuração": "documentacao",
};

export function mapDocumentoToTipo(doc: string): string {
  const key = (doc ?? "").trim().toLowerCase();
  return DOC_TIPO_MAP[key] ?? "documentacao";
}

export function buildPendenciaTitulo(doc: string, reu?: string | null): string {
  const base = `Documento pendente: ${(doc ?? "").trim()}`;
  const r = (reu ?? "").trim();
  return r ? `${base} — ${r}` : base;
}
