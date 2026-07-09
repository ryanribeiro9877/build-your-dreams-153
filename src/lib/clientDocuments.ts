// src/lib/clientDocuments.ts
//
// CADASTRO-MODELO-A §7·B·A — upload dos documentos do cliente (fonte única).
// Mesma gravação que a seção "Documentos obrigatórios" do cadastro manual usava:
// arquivo no bucket `client-documents` + linha em `client_documents`. As triggers
// stamp_client_document_validation / log_client_document_event cuidam de
// validação/auditoria — não recriamos nada aqui.
//
// Regra de gating (Rodrigo): a falta de upload NÃO bloqueia o cadastro — gera
// pendência. Por isso este helper é chamado APÓS o save_client, best-effort:
// uma falha num arquivo não derruba os demais nem o cadastro.

import { supabase } from "@/integrations/supabase/client";

// Slot = identidade do campo de upload na UI (frente/verso são dois slots
// distintos, por decisão do Rodrigo). NÃO é o document_type gravado.
export type ClientDocSlot =
  | "rg_frente"
  | "rg_verso"
  | "comprovante_residencia"
  | "extrato_ir"
  | "extrato_bancario";

// Mapa slot → document_type gravado em client_documents.
// O document_type PRECISA pertencer ao CHECK de produção
// (client_documents_document_type_check) e casar com o vocabulário do gate
// (required_document_sets: rg, comprovante, ...), senão (a) o INSERT quebra com
// check_violation e (b) o gate documental (client_document_checklist) nunca fecha.
// RG frente e verso gravam ambos como 'rg' (o gate exige um 'rg' validado, não
// importa a face). Comprovante de residência grava 'comprovante' (o que o gate
// exige). Extrato bancário grava 'extrato_conta' (valor válido no CHECK).
// CPF não é slot: já consta no próprio RG (decisão do Rodrigo, 2026-07-09).
export const DOC_TYPE_BY_SLOT: Record<ClientDocSlot, string> = {
  rg_frente: "rg",
  rg_verso: "rg",
  comprovante_residencia: "comprovante",
  extrato_ir: "extrato_ir",
  extrato_bancario: "extrato_conta",
};

export const CLIENT_DOC_SLOTS: { slot: ClientDocSlot; label: string; required: boolean }[] = [
  { slot: "rg_frente", label: "RG — Frente", required: true },
  { slot: "rg_verso", label: "RG — Verso", required: true },
  { slot: "comprovante_residencia", label: "Comprovante de Residência", required: true },
  { slot: "extrato_ir", label: "Extrato de Imposto de Renda", required: false },
  { slot: "extrato_bancario", label: "Extrato Bancário", required: false },
];

export interface ClientDocUploadResult {
  slot: ClientDocSlot;
  ok: boolean;
  error?: string;
}

export interface DocInsertInput {
  documentType: string;
  documentName: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
  /** default 'recebido' — upload manual chega recebido (não 'pendente de assinatura'). */
  status?: string;
  /** default 'recepcao'. */
  origem?: string;
  /** default null — usado por áudio de atendimento p/ metadados de sessão/bloco. */
  notes?: string | null;
}

// Payload puro do insert em client_documents (testável sem rede). O default de
// status é 'recebido' (o upload de RG/comprovante/assinado JÁ está em mãos; o
// 'pendente' fica reservado aos documentos GERADOS aguardando assinatura).
export function buildDocInsert(
  clientId: string,
  clientName: string,
  uploadedBy: string,
  d: DocInsertInput,
) {
  return {
    client_id: clientId,
    client_name: clientName,
    document_type: d.documentType,
    document_name: d.documentName,
    file_path: d.filePath,
    file_size: d.fileSize,
    mime_type: d.mimeType,
    notes: d.notes ?? null,
    uploaded_by: uploadedBy,
    status: d.status ?? "recebido",
    origem: d.origem ?? "recepcao",
  } as const;
}

// Faz o upload de um único documento e registra em client_documents.
export async function uploadClientDocument(
  clientId: string,
  clientName: string,
  uploadedBy: string,
  slot: ClientDocSlot,
  file: File,
): Promise<ClientDocUploadResult> {
  const label = CLIENT_DOC_SLOTS.find((s) => s.slot === slot)?.label ?? slot;
  // Nome de arquivo determinístico por cliente/slot; Date.now evita colisão em
  // reenvios do mesmo slot.
  const filePath = `${clientId}/${Date.now()}_${slot}_${file.name}`;
  const { error: upErr } = await supabase.storage.from("client-documents").upload(filePath, file);
  if (upErr) return { slot, ok: false, error: upErr.message };
  const { error: insErr } = await supabase.from("client_documents").insert(
    buildDocInsert(clientId, clientName, uploadedBy, {
      documentType: DOC_TYPE_BY_SLOT[slot],
      documentName: label,
      filePath,
      fileSize: file.size,
      mimeType: file.type,
      status: "recebido",
    }) as never,
  );
  if (insErr) return { slot, ok: false, error: insErr.message };
  return { slot, ok: true };
}

// Upload de um documento GERADO já assinado (procuração, contrato, etc.).
// Grava com o MESMO document_type do gerado e status 'recebido' — o checklist
// (precedência validado>recebido>pendente) move o item de "pendente de
// assinatura" para "recebido". Ponto 6 (card [6.5]).
export async function uploadSignedDocument(
  clientId: string,
  clientName: string,
  uploadedBy: string,
  documentType: string,
  documentLabel: string,
  file: File,
): Promise<{ ok: boolean; error?: string }> {
  const filePath = `${clientId}/${Date.now()}_assinado_${documentType}_${file.name}`;
  const { error: upErr } = await supabase.storage.from("client-documents").upload(filePath, file);
  if (upErr) return { ok: false, error: upErr.message };
  const { error: insErr } = await supabase.from("client_documents").insert(
    buildDocInsert(clientId, clientName, uploadedBy, {
      documentType,
      documentName: `${documentLabel} (assinado)`,
      filePath,
      fileSize: file.size,
      mimeType: file.type,
      status: "recebido",
    }) as never,
  );
  if (insErr) return { ok: false, error: insErr.message };
  return { ok: true };
}

// Sobe todos os slots preenchidos, best-effort. Retorna o resultado por slot.
export async function uploadClientDocuments(
  clientId: string,
  clientName: string,
  uploadedBy: string,
  files: Partial<Record<ClientDocSlot, File>>,
): Promise<ClientDocUploadResult[]> {
  const out: ClientDocUploadResult[] = [];
  for (const { slot } of CLIENT_DOC_SLOTS) {
    const file = files[slot];
    if (!file) continue;
    out.push(await uploadClientDocument(clientId, clientName, uploadedBy, slot, file));
  }
  return out;
}
