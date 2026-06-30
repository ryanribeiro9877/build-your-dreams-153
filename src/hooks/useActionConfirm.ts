import { supabase } from "@/integrations/supabase/client";

export async function confirmAction(runId: string, actionId: string, decision: "confirm" | "cancel") {
  const { data, error } = await supabase.functions.invoke("chat-orchestrator", {
    body: { mode: "confirm", runId, actionId, decision },
  });
  if (error) throw error;
  return data;
}
