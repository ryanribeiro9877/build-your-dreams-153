// src/lib/cooperadoOnboarding.ts
//
// COOP-DOCS-3 — orquestração client-side do "após confirmar o cadastro":
//   1. lê o cliente recém-criado pela via DECIFRADA (clients_decrypted) — nunca
//      as colunas cifradas cruas;
//   2. gera os documentos do cooperado (Fatia 2) → client_documents pendente;
//   3. lê o checklist do conjunto obrigatório (COOP-DOCS-1) para a UI mostrar o
//      que já existe e o que falta.
//
// É o passo que o ActionCard dispara quando a tool cadastrar_cliente executa.

import { supabase } from "@/integrations/supabase/client";
import { generateCooperadoDocuments, type GeneratedDocResult } from "./generateCooperadoDocs";
import type { CooperadoClientData } from "./cooperadoDocs";

// Uma linha do RPC client_cooperado_checklist (COOP-DOCS-1).
export interface CooperadoChecklistRow {
  set_code: string;
  document_type: string;
  required: boolean;
  sort_order: number;
  status: "ausente" | "pendente" | "recebido" | "validado" | "rejeitado" | string;
  document_id: string | null;
  validated_at: string | null;
}

export interface CooperadoOnboardingResult {
  client: CooperadoClientData | null;
  generated: GeneratedDocResult[];
  checklist: CooperadoChecklistRow[];
}

// Colunas do cadastro necessárias aos 4 documentos, lidas da view decifrada.
const DECRYPTED_COLS =
  "id, full_name, cpf, cnpj, rg, rg_issuer, rg_uf, nationality, marital_status, " +
  "profession, birth_date, email, phone, zip_code, address, address_number, " +
  "address_complement, neighborhood, city, state";

export async function fetchCooperadoClientData(clientId: string): Promise<CooperadoClientData | null> {
  // R-2: leitura pela view decifrada (clients_decrypted não está nos tipos
  // gerados — mesmo cast usado em ClientEdit/ClientDetails).
  const { data, error } = await (supabase as unknown as {
    from: (t: string) => {
      select: (c: string) => { eq: (k: string, v: string) => { maybeSingle: () => Promise<{ data: CooperadoClientData | null; error: unknown }> } };
    };
  }).from("clients_decrypted").select(DECRYPTED_COLS).eq("id", clientId).maybeSingle();
  if (error || !data) return null;
  return data as unknown as CooperadoClientData;
}

export async function fetchCooperadoChecklist(clientId: string): Promise<CooperadoChecklistRow[]> {
  const { data, error } = await (supabase as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: CooperadoChecklistRow[] | null; error: unknown }>;
  }).rpc("client_cooperado_checklist", { p_client_id: clientId });
  if (error) return [];
  return data ?? [];
}

// Roda o fluxo completo. Best-effort: se a leitura do cliente falhar, não gera
// documentos (evita gerar com dado incompleto), mas ainda devolve o checklist.
export async function runCooperadoOnboarding(
  clientId: string,
  userId: string,
): Promise<CooperadoOnboardingResult> {
  const client = await fetchCooperadoClientData(clientId);
  const generated = client
    ? await generateCooperadoDocuments(client, userId, { clientName: client.full_name ?? undefined })
    : [];
  const checklist = await fetchCooperadoChecklist(clientId);
  return { client, generated, checklist };
}
