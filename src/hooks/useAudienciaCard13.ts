import { supabase } from "@/integrations/supabase/client";
import type {
  ErroRpc, ImportacaoRet, LembreteRow, PreparacaoRet, RegistrarLembreteRet,
} from "@/lib/audienciaCard13";

/* ============================================================
   Card 13 — acesso a dados dos três incrementos
   ============================================================
   `audiencia_lembretes` e as três RPCs (importar_audiencias_planilha,
   registrar_lembrete_audiencia, preparar_audiencia) NÃO estão nos tipos gerados
   do Supabase, então usamos o mesmo cast pontual de useAudiencias.ts. O `rpc`/
   `from` é chamado ACOPLADO ao client (desacoplar quebra em `this.rest`).

   Escrita só por RPC SECURITY DEFINER: a tabela `audiencia_lembretes` tem
   APENAS policy de SELECT (`can_view_clients() OR is_socio_or_advogado()`),
   verificado em pg_policy em 30/07/2026. Leitura direta é o caminho certo para a
   régua — o RLS resolve quem vê.
============================================================ */

type UntypedRpc = {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: ErroRpc | null }>;
};
type UntypedFrom = {
  from: (t: string) => {
    select: (c: string) => {
      eq: (k: string, v: string) => {
        order: (k: string, o: { ascending: boolean }) => Promise<{ data: LembreteRow[] | null; error: ErroRpc | null }>;
      };
    };
  };
};

const LEMBRETE_COLS =
  "id, audiencia_id, data_prevista, canal, status, observacao, feito_em, pendencia_task_id";

/** Lembretes de uma audiência, do mais antigo ao mais novo. */
export async function fetchLembretesAudiencia(
  audienciaId: string,
): Promise<{ rows: LembreteRow[]; error: ErroRpc | null }> {
  const res = await (supabase as unknown as UntypedFrom)
    .from("audiencia_lembretes")
    .select(LEMBRETE_COLS)
    .eq("audiencia_id", audienciaId)
    .order("data_prevista", { ascending: true });
  return { rows: res.data ?? [], error: res.error };
}

/**
 * registrar_lembrete_audiencia(p_lembrete_id, p_status, p_observacao).
 * Observação vazia vai como null (a RPC faz COALESCE e preserva a anterior).
 */
export async function registrarLembreteAudiencia(args: {
  lembreteId: string; status: string; observacao?: string;
}): Promise<{ data: RegistrarLembreteRet | null; error: ErroRpc | null }> {
  const { data, error } = await (supabase as unknown as UntypedRpc).rpc("registrar_lembrete_audiencia", {
    p_lembrete_id: args.lembreteId,
    p_status: args.status,
    p_observacao: args.observacao?.trim() ? args.observacao.trim() : null,
  });
  return { data: (data as RegistrarLembreteRet) ?? null, error };
}

/** preparar_audiencia(p_audiencia_id). */
export async function prepararAudiencia(
  audienciaId: string,
): Promise<{ data: PreparacaoRet | null; error: ErroRpc | null }> {
  const { data, error } = await (supabase as unknown as UntypedRpc).rpc("preparar_audiencia", {
    p_audiencia_id: audienciaId,
  });
  return { data: (data as PreparacaoRet) ?? null, error };
}

/**
 * importar_audiencias_planilha(p_lote, p_offsets, p_dry_run).
 *
 * `dryRun` é OBRIGATÓRIO e booleano — nunca opcional, nunca null.
 * MEDIDO no corpo: o teste é `IF p_dry_run THEN ... CONTINUE`, e NULL em
 * condição plpgsql é falso. Um `p_dry_run: null` aqui GRAVA o lote inteiro
 * (~500 audiências do mês) sem ensaio nenhum.
 */
export async function importarAudienciasPlanilha(args: {
  lote: unknown[]; offsets: number[]; dryRun: boolean;
}): Promise<{ data: ImportacaoRet | null; error: ErroRpc | null }> {
  if (typeof args.dryRun !== "boolean") {
    // Guarda de programação: se algum caller futuro esquecer o booleano, falha
    // aqui em vez de escrever no banco por acidente.
    throw new Error("importarAudienciasPlanilha: dryRun tem de ser booleano explícito.");
  }
  const { data, error } = await (supabase as unknown as UntypedRpc).rpc("importar_audiencias_planilha", {
    p_lote: args.lote,
    p_offsets: args.offsets,
    p_dry_run: args.dryRun,
  });
  return { data: (data as ImportacaoRet) ?? null, error };
}
