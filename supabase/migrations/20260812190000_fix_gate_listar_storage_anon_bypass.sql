-- FIX DE SEGURANÇA — bypass do portão de admin nas RPCs de varredura do Storage
--
-- O QUE ESTAVA ERRADO
-- As duas funções abriam com:
--     IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(),'admin') THEN
--       RAISE EXCEPTION ...
--     END IF;
-- Quando `auth.uid()` é NULL a condição inteira é falsa e o RAISE NUNCA acontece.
-- Ou seja: o chamador SEM JWT (anon, com a chave publishable que é pública por
-- design) passava direto. Como o ACL das funções era `=X/postgres` (PUBLIC tem
-- EXECUTE), qualquer um na internet podia chamar e enumerar `storage.objects`
-- do bucket `chat-attachments` — anexos de clientes de um escritório de advocacia.
--
-- PROVA (12/08/2026, antes deste fix):
--     set local role anon;
--     select count(*) from public.listar_duplicatas_chat_attachments();
--   -> executou sem erro (0 linhas apenas porque hoje não há duplicatas;
--      o bucket tem 55 objetos). O portão não negou: ele foi pulado.
--
-- POR QUE O NULL ERA PROPOSITAL (e por que o fix não é só trocar AND por OR)
-- O script de manutenção `varredura-duplicatas.mjs` chama estas RPCs com a
-- SERVICE_ROLE_KEY, e para o service_role `auth.uid()` TAMBÉM é NULL. Exigir
-- `auth.uid() IS NOT NULL` fecharia o buraco e quebraria a manutenção junto.
-- Por isso o portão passa a distinguir explicitamente os dois casos:
--   - service_role  -> liberado (é a chave de servidor, nunca chega do browser)
--   - humano        -> precisa de JWT E do papel admin
--   - anon/sem JWT  -> NEGADO
--
-- DEFESA EM PROFUNDIDADE: além do portão, revoga-se o EXECUTE de PUBLIC, que era
-- o que dava o acesso a anon. Portão E privilégio, não um ou outro.

BEGIN;

CREATE OR REPLACE FUNCTION public.listar_duplicatas_chat_attachments()
 RETURNS TABLE(name text, sz bigint, etag text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role'
     AND NOT (auth.uid() IS NOT NULL
              AND public.has_role(auth.uid(), 'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'somente admin lista duplicatas do storage' USING errcode='42501';
  END IF;

  RETURN QUERY
  WITH ranked AS (
    SELECT o.name::text AS nm,
           (o.metadata->>'size')::bigint AS s,
           (o.metadata->>'eTag')::text AS e,
           o.created_at AS c,
           row_number() OVER (PARTITION BY o.metadata->>'eTag'
                              ORDER BY o.created_at ASC, o.name ASC) AS rn,
           EXISTS (SELECT 1 FROM public.chat_attachments a WHERE a.storage_path = o.name) AS tem_reg
    FROM storage.objects o
    WHERE o.bucket_id = 'chat-attachments' AND o.metadata->>'eTag' IS NOT NULL
  )
  SELECT r.nm, r.s, r.e, r.c FROM ranked r
   WHERE r.rn > 1 AND NOT r.tem_reg
   ORDER BY r.c, r.nm;
END; $function$;

CREATE OR REPLACE FUNCTION public.listar_descartaveis_chat_attachments()
 RETURNS TABLE(name text, sz bigint, etag text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role'
     AND NOT (auth.uid() IS NOT NULL
              AND public.has_role(auth.uid(), 'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'somente admin lista descartáveis do storage' USING errcode='42501';
  END IF;

  RETURN QUERY
  SELECT o.name::text, (o.metadata->>'size')::bigint, (o.metadata->>'eTag')::text, o.created_at
  FROM storage.objects o
  WHERE o.bucket_id = 'chat-attachments'
    AND split_part(o.name,'/', array_length(string_to_array(o.name,'/'),1)) ILIKE '%TESTE\_COWORK%'
    AND NOT EXISTS (SELECT 1 FROM public.chat_attachments a WHERE a.storage_path = o.name)
  ORDER BY o.created_at;
END; $function$;

-- Tira o EXECUTE de PUBLIC (era o `=X/postgres` no ACL) e devolve só a quem precisa.
REVOKE ALL ON FUNCTION public.listar_duplicatas_chat_attachments() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.listar_descartaveis_chat_attachments() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.listar_duplicatas_chat_attachments() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.listar_descartaveis_chat_attachments() TO authenticated, service_role;

-- `salvar_peca` JÁ nega corretamente quem chega sem JWT (checa auth.uid() IS NULL
-- e levanta 42501). Ainda assim não há motivo para anon ter EXECUTE numa função
-- que ESCREVE: retira-se o privilégio como segunda barreira.
REVOKE ALL ON FUNCTION public.salvar_peca(uuid, text, text, uuid, text, text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.salvar_peca(uuid, text, text, uuid, text, text, uuid, uuid) TO authenticated, service_role;

-- Metadado de tipos de documento: não é sensível, mas anon não tem uso para ele.
REVOKE ALL ON FUNCTION public._document_types_permitidos() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._document_types_permitidos() TO authenticated, service_role;

COMMIT;
