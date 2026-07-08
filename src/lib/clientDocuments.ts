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

// document_type padronizado por slot (§7·B·A). Os obrigatórios do conjunto
// alimentam o checklist/gate (client_document_checklist) do cliente.
export type ClientDocSlot =
  | "rg_frente"
  | "rg_verso"
  | "comprovante_residencia"
  | "extrato_ir"
  | "extrato_bancario";

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
  const { error: insErr } = await supabase.from("client_documents").insert({
    client_id: clientId,
    client_name: clientName,
    document_type: slot,
    document_name: label,
    file_path: filePath,
    file_size: file.size,
    mime_type: file.type,
    notes: null,
    uploaded_by: uploadedBy,
  } as never);
  if (insErr) return { slot, ok: false, error: insErr.message };
  return { slot, ok: true };
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
