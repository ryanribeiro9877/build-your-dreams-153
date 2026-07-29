import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Bancos que JÁ EXISTEM na base (client_bank_relations.banco + o banco do
 * benefício dos clientes), em ordem alfabética e sem repetição.
 *
 * Serve de `datalist` para o campo de banco e de dropdown nos filtros da lista
 * de clientes. Deliberadamente NÃO há lista fixa de bancos no código: a base é
 * a fonte de verdade e um nome novo aparece sozinho na próxima carga. Como o
 * campo continua livre, um banco inédito pode ser digitado — o datalist sugere,
 * não restringe.
 *
 * O nome é comparado em MAIÚSCULAS na base (a RPC faz `upper(btrim(banco))`),
 * por isso não normalizo aqui além do trim.
 */
// `client_bank_relations` e `clients.banco_beneficio` ainda não estão nos tipos
// gerados (desync do types.ts, igual ao de client_documents.task_id). Cast local
// até o próximo types:regen — a chamada segue ACOPLADA ao client.
type BancoRow = { banco?: string | null; banco_beneficio?: string | null };
type BancoRes = Promise<{ data: BancoRow[] | null; error: unknown }>;

export function useBancosConhecidos(): string[] {
  const [bancos, setBancos] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sb = supabase as unknown as {
        from: (t: string) => {
          select: (c: string) => {
            limit: (n: number) => BancoRes;
            not: (c: string, op: string, v: unknown) => { limit: (n: number) => BancoRes };
          };
        };
      };
      const [relRes, cliRes] = await Promise.all([
        sb.from("client_bank_relations").select("banco").limit(5000),
        sb.from("clients").select("banco_beneficio").not("banco_beneficio", "is", null).limit(5000),
      ]);
      if (cancelled) return;
      const set = new Set<string>();
      for (const r of (relRes.data ?? [])) {
        const v = (r.banco ?? "").trim();
        if (v) set.add(v);
      }
      for (const c of (cliRes.data ?? [])) {
        const v = (c.banco_beneficio ?? "").trim();
        if (v) set.add(v);
      }
      setBancos([...set].sort((a, b) => a.localeCompare(b, "pt-BR")));
    })();
    return () => { cancelled = true; };
  }, []);

  return bancos;
}
