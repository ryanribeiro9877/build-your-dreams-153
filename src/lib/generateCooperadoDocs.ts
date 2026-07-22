// src/lib/generateCooperadoDocs.ts
//
// COOP-DOCS-2 — orquestração: gera os 4 documentos do cooperado preenchidos com
// os dados (DECIFRADOS) do cliente, salva cada um no bucket `client-documents` e
// registra em `client_documents` com origem='sistema' e status='pendente'
// (aguardando assinatura — NUNCA nasce 'validado'; validar é humano/Validação).
//
// Pré-requisito: os 4 templates .docx em public/templates/ (procuracao_template,
// contrato_honorarios_template, declaracao_hipossuficiencia_template,
// ficha_cadastral_cooperado_template). Enquanto os arquivos-modelo do Ryan não
// estiverem lá, cada geração retorna ok:false com erro claro (template ausente),
// sem gravar nada — não há lacuna nem documento falso.

import { supabase } from "@/integrations/supabase/client";
import {
  COOPERADO_DOC_DEFS,
  renderCooperadoDoc,
  type CooperadoClientData,
  type CooperadoDocDef,
  type CooperadoDocType,
} from "./cooperadoDocs";
import { DOCX_MIME } from "./fillDocxTemplate";

const BUCKET = "client-documents";

export interface GeneratedDocResult {
  documentType: CooperadoDocType;
  label: string;
  ok: boolean;
  filePath?: string;
  /** campos sem valor no template (viraram [A PREENCHER]) — revisão humana. */
  missing?: string[];
  error?: string;
}

// Idempotência dos documentos de sistema (bug 2026-07-22: reabrir a fase de
// documentos ou concluir um upload reinseria as 4 linhas — 8 anexos exibiam 25
// documentos). Dada a lista de tipos já gerados (origem='sistema') do cliente,
// devolve apenas as definições que ainda faltam gerar. Pura/testável.
export function selectDocsToGenerate(
  existingSystemTypes: Iterable<string>,
): CooperadoDocDef[] {
  const have = new Set(existingSystemTypes);
  return COOPERADO_DOC_DEFS.filter((d) => !have.has(d.documentType));
}

// Gera + persiste os 4 documentos. Best-effort por documento: uma falha não
// aborta os demais; o resultado por documento diz o que gerou e o que faltou.
// `nowIso` opcional torna a data determinística (testes/repro).
// Idempotente: um tipo de sistema já gerado é devolvido sem regravar (ver acima).
export async function generateCooperadoDocuments(
  client: CooperadoClientData,
  uploadedBy: string,
  opts: { clientName?: string; now?: Date } = {},
): Promise<GeneratedDocResult[]> {
  const results: GeneratedDocResult[] = [];

  // Lê os documentos de sistema já existentes para o cliente. Cada tipo presente
  // NÃO é regenerado nem reinserido — apenas devolvido (mantém o link de
  // download na UI). É esta checagem que corta a duplicação na raiz.
  const { data: existingRows } = await supabase
    .from("client_documents")
    .select("document_type, file_path")
    .eq("client_id", client.id)
    .eq("origem", "sistema");
  const existingByType = new Map<string, string | null>(
    (existingRows ?? []).map((r) => [
      r.document_type as string,
      (r.file_path as string | null) ?? null,
    ]),
  );

  // 1) Já gerados: devolve como ok, sem tocar no Storage nem no banco.
  for (const def of COOPERADO_DOC_DEFS) {
    if (existingByType.has(def.documentType)) {
      results.push({
        documentType: def.documentType,
        label: def.label,
        ok: true,
        filePath: existingByType.get(def.documentType) ?? undefined,
      });
    }
  }

  // 2) Só os tipos que faltam são efetivamente gerados e inseridos.
  for (const def of selectDocsToGenerate(existingByType.keys())) {
    const base: GeneratedDocResult = { documentType: def.documentType, label: def.label, ok: false };
    try {
      // 1. Carrega o template (public/templates/…). Ausente => erro claro, sem gravar.
      const resp = await fetch(`/templates/${def.templateFile}`);
      if (!resp.ok) {
        results.push({ ...base, error: `template ausente: ${def.templateFile} (${resp.status})` });
        continue;
      }
      const templateBytes = await resp.arrayBuffer();

      // 2. Preenche de forma determinística (sem LLM).
      const rendered = await renderCooperadoDoc(def, client, templateBytes, { now: opts.now });

      // 3. Sobe no bucket, path escopado ao cliente.
      const stamp = (opts.now ?? new Date()).getTime();
      const filePath = `${client.id}/${stamp}_${def.documentType}.docx`;
      const blob = new Blob([rendered.bytes as BlobPart], { type: DOCX_MIME });
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(filePath, blob, { contentType: DOCX_MIME, upsert: false });
      if (upErr) {
        results.push({ ...base, error: `upload: ${upErr.message}`, missing: rendered.missing });
        continue;
      }

      // 4. Registra em client_documents (origem=sistema, status=pendente).
      //    O trigger de log do 3.6 registra o evento 'upload' automaticamente.
      const { error: insErr } = await supabase.from("client_documents").insert({
        client_id: client.id,
        client_name: opts.clientName ?? client.full_name ?? null,
        document_type: def.documentType,
        document_name: `${def.label}.docx`,
        file_path: filePath,
        file_size: rendered.bytes.byteLength,
        mime_type: DOCX_MIME,
        origem: "sistema",
        status: "pendente",
        uploaded_by: uploadedBy,
      });
      if (insErr) {
        // Desfaz o binário órfão se o registro falhar (mesmo cuidado do upload manual).
        await supabase.storage.from(BUCKET).remove([filePath]);
        results.push({ ...base, error: `registro: ${insErr.message}`, missing: rendered.missing });
        continue;
      }

      results.push({ ...base, ok: true, filePath, missing: rendered.missing });
    } catch (e) {
      results.push({ ...base, error: (e as Error)?.message ?? "erro" });
    }
  }

  return results;
}
