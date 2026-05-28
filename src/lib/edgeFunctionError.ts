import { FunctionsHttpError } from "@supabase/supabase-js";

/** Extrai mensagem legível quando a edge function retorna status != 2xx. */
export async function getEdgeFunctionErrorMessage(error: unknown, fallback: string): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = (await error.context.json()) as { message?: string; error?: string };
      if (body?.message) return body.message;
      if (body?.error) return String(body.error);
    } catch {
      /* ignore parse errors */
    }
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
