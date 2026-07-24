// supabase/functions/gerar-kit-documental/generate.ts
//
// PORTE Deno (Onda 2.3) de src/lib/generateCooperadoDocs.ts — MESMA orquestração
// e MESMA idempotência (check-before-insert + corrida 23505 = sucesso). Duas
// diferenças de ambiente, ambas equivalentes ao front:
//   1. o cliente Supabase é injetado (`db`) — aqui é o client com o JWT do usuário,
//      então Storage + insert respeitam a MESMA RLS que a tela usaria (o chat não
//      pode mais que o usuário);
//   2. o template é buscado por URL ABSOLUTA (TEMPLATES_BASE_URL) em vez de path
//      relativo `/templates/...` — no edge não há origem implícita.
//
// Gera os 4 documentos preenchidos com os dados DECIFRADOS do cliente, salva cada
// um no bucket `client-documents` e registra em `client_documents` com
// origem='sistema' e status='pendente' (aguardando assinatura — NUNCA nasce
// 'validado'; validar é humano/Validação).

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  COOPERADO_DOC_DEFS,
  renderCooperadoDoc,
  type CooperadoClientData,
  type CooperadoDocDef,
  type CooperadoDocType,
} from "./cooperadoDocs.ts";
import { DOCX_MIME } from "./fillDocxTemplate.ts";

const BUCKET = "client-documents";

export interface GeneratedDocResult {
  documentType: CooperadoDocType;
  label: string;
  ok: boolean;
  filePath?: string;
  /** true = já existia (checagem prévia OU corrida 23505); NÃO foi gerado agora. */
  alreadyExisted?: boolean;
  /** campos sem valor no template (viraram [A PREENCHER]) — revisão humana. */
  missing?: string[];
  error?: string;
}

// Idempotência dos documentos de sistema (bug 2026-07-22). Dada a lista de tipos
// já gerados (origem='sistema') do cliente, devolve só as definições que faltam.
export function selectDocsToGenerate(
  existingSystemTypes: Iterable<string>,
): CooperadoDocDef[] {
  const have = new Set(existingSystemTypes);
  return COOPERADO_DOC_DEFS.filter((d) => !have.has(d.documentType));
}

// Gera + persiste os 4 documentos. Best-effort por documento: uma falha não aborta
// os demais. Idempotente: um tipo de sistema já gerado é devolvido sem regravar.
export async function generateCooperadoDocuments(
  db: SupabaseClient,
  templatesBaseUrl: string,
  client: CooperadoClientData,
  uploadedBy: string,
  opts: { clientName?: string; now?: Date } = {},
): Promise<GeneratedDocResult[]> {
  const results: GeneratedDocResult[] = [];
  const base = templatesBaseUrl.replace(/\/+$/, "");

  // Documentos de sistema já existentes: cada tipo presente NÃO é regenerado nem
  // reinserido — apenas devolvido. É esta checagem que corta a duplicação na raiz.
  const { data: existingRows } = await db
    .from("client_documents")
    .select("document_type, file_path")
    .eq("client_id", client.id)
    .eq("origem", "sistema");
  const existingByType = new Map<string, string | null>(
    (existingRows ?? []).map((r: { document_type: string; file_path: string | null }) => [
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
        alreadyExisted: true,
        filePath: existingByType.get(def.documentType) ?? undefined,
      });
    }
  }

  // 2) Só os tipos que faltam são efetivamente gerados e inseridos.
  for (const def of selectDocsToGenerate(existingByType.keys())) {
    const item: GeneratedDocResult = { documentType: def.documentType, label: def.label, ok: false };
    try {
      // 1. Carrega o template (URL absoluta). Ausente => erro claro, sem gravar.
      const resp = await fetch(`${base}/${def.templateFile}`);
      if (!resp.ok) {
        results.push({ ...item, error: `template ausente: ${def.templateFile} (${resp.status})` });
        continue;
      }
      const templateBytes = await resp.arrayBuffer();

      // 2. Preenche de forma determinística (sem LLM).
      const rendered = await renderCooperadoDoc(def, client, templateBytes, { now: opts.now });

      // 3. Sobe no bucket, path escopado ao cliente.
      const stamp = (opts.now ?? new Date()).getTime();
      const filePath = `${client.id}/${stamp}_${def.documentType}.docx`;
      const { error: upErr } = await db.storage
        .from(BUCKET)
        .upload(filePath, rendered.bytes, { contentType: DOCX_MIME, upsert: false });
      if (upErr) {
        results.push({ ...item, error: `upload: ${upErr.message}`, missing: rendered.missing });
        continue;
      }

      // 4. Registra em client_documents (origem=sistema, status=pendente).
      const { error: insErr } = await db.from("client_documents").insert({
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
        await db.storage.from(BUCKET).remove([filePath]);
        // 23505 = índice único uq_client_documents_sistema_kit: outro clique/mount já
        // inseriu este tipo (corrida que fura o check-before-insert). Idempotente =
        // SUCESSO, não erro vermelho — o binário recém-subido virou órfão e foi removido.
        const already = (insErr as { code?: string }).code === "23505";
        results.push(already
          ? { ...item, ok: true, alreadyExisted: true, missing: rendered.missing }
          : { ...item, error: `registro: ${insErr.message}`, missing: rendered.missing });
        continue;
      }

      results.push({ ...item, ok: true, filePath, missing: rendered.missing });
    } catch (e) {
      results.push({ ...item, error: (e as Error)?.message ?? "erro" });
    }
  }

  return results;
}
