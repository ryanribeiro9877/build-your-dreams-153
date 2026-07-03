import { supabase } from "@/integrations/supabase/client";

export async function confirmAction(runId: string, actionId: string, decision: "confirm" | "cancel") {
  const { data, error } = await supabase.functions.invoke("chat-orchestrator", {
    body: { mode: "confirm", runId, actionId, decision },
  });
  if (error) throw error;
  return data;
}

/**
 * STOP instantâneo: pede o cancelamento da run DAQUELA conversa (mode:"cancel").
 * O endpoint grava cancel_requested=true (autenticando a posse) e retorna rápido —
 * o worker aborta a geração em ~1-2s e encerra a run como 'cancelled'. A UI
 * reconcilia pelo status via Realtime (não espera a resposta aqui). Passa runId
 * quando conhecido; senão sessionId (última run da conversa) como fallback.
 */
export async function cancelRun(params: { runId?: string | null; sessionId?: string | null }) {
  const { data, error } = await supabase.functions.invoke("chat-orchestrator", {
    body: { mode: "cancel", runId: params.runId ?? undefined, sessionId: params.sessionId ?? undefined },
  });
  if (error) throw error;
  return data;
}
