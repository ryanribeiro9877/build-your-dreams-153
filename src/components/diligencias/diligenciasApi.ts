import { supabase } from "@/integrations/supabase/client";
import {
  DILIGENCIA_COLUNAS, DILIGENCIAS_LIMITE,
  type DiligenciaRow, type RpcErro, type RpcRetorno,
} from "./diligenciasLogic";

/* ============================================================
   Card 11 — acesso ao banco
   ============================================================
   LEITURA: `diligencias` direto (policy de SELECT
   `is_socio_or_advogado() OR has_role(admin)`).
   ESCRITA: só RPC. A tabela NÃO tem policy de INSERT/UPDATE/DELETE — nem esta
   tela nem o chat conseguem escrever por fora de `registrar_diligencia` /
   `cumprir_diligencia`, então os dois produzem exatamente o mesmo registro.
============================================================ */

/** Cast: as RPCs do Card 11 não estão nos tipos gerados. A chamada é ACOPLADA ao
 *  client de propósito — desacoplar o `rpc` quebra em `this.rest`. */
export function rpcDiligencia(fn: string, args: Record<string, unknown>) {
  return (supabase as unknown as {
    rpc: (f: string, a: Record<string, unknown>) => Promise<{ data: RpcRetorno | null; error: RpcErro }>;
  }).rpc(fn, args);
}

type Query = {
  select: (c: string, o?: { count?: "exact"; head?: boolean }) => Query;
  order: (c: string, o: { ascending: boolean; nullsFirst?: boolean }) => Query;
  limit: (n: number) => Query;
  then: <R>(f: (r: { data: unknown; error: RpcErro; count: number | null }) => R) => Promise<R>;
};

function from(table: string): Query {
  return (supabase as unknown as { from: (t: string) => Query }).from(table);
}

export interface CargaDiligencias {
  rows: DiligenciaRow[];
  /** Total no banco (count exato), para saber se o teto truncou a lista. */
  total: number;
  error: RpcErro;
}

/**
 * Uma carga única, ordenada por prazo (NULLS LAST, igual à RPC). Filtro e
 * agrupamento são locais porque a linhagem precisa da diligência ORIGINAL
 * mesmo quando ela não passa no filtro corrente — e porque o agrupador por vara
 * só faz sentido sobre o conjunto todo. O teto (`DILIGENCIAS_LIMITE`) é
 * comparado com o `count` exato para a tela poder dizer que truncou.
 */
export async function carregarDiligencias(): Promise<CargaDiligencias> {
  const res = await from("diligencias")
    .select(DILIGENCIA_COLUNAS, { count: "exact" })
    .order("prazo", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true })
    .limit(DILIGENCIAS_LIMITE);
  if (res.error) return { rows: [], total: 0, error: res.error };
  const rows = (res.data as DiligenciaRow[] | null) ?? [];
  return { rows, total: res.count ?? rows.length, error: null };
}

/** Varas já usadas, para o datalist do filtro e do formulário. */
export function varasConhecidas(rows: DiligenciaRow[]): string[] {
  const set = new Set<string>();
  for (const d of rows) {
    const v = d.vara?.trim();
    if (v) set.add(v);
  }
  return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
}
