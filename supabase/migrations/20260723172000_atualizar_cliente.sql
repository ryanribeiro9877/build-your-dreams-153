-- ============================================================================
-- Onda 1.3 — atualizar_cliente (corrigir cadastro pelo chat) + auditoria leve
-- ============================================================================
-- Gate = trio do search_clients (is_recepcao / admin / has_menu_grant 'clientes').
-- Whitelist explícita (NUNCA cpf/cnpj/nome pelo chat). A cifragem/bidx fica com o
-- trigger trg_clients_pii_sync (escrevemos nas colunas de entrada normalmente).
-- Não havia auditoria de update de cliente: cria-se client_update_log (rastreável).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.client_update_log (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id  uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  changed_by uuid NOT NULL REFERENCES auth.users(id),
  changes    jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_client_update_log_client ON public.client_update_log(client_id, created_at DESC);
ALTER TABLE public.client_update_log ENABLE ROW LEVEL SECURITY;
-- Leitura pelo mesmo público que vê clientes; escrita só via a RPC (definer).
DROP POLICY IF EXISTS client_update_log_select ON public.client_update_log;
CREATE POLICY client_update_log_select ON public.client_update_log FOR SELECT TO authenticated
  USING (public.is_recepcao() OR public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_menu_grant(auth.uid(),'clientes'));

CREATE OR REPLACE FUNCTION public.atualizar_cliente(p_client_id uuid, p_fields jsonb)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
AS $function$
declare
  v_uid     uuid := auth.uid();
  v_before  public.clients%rowtype;
  v_after   public.clients%rowtype;
  v_bj      jsonb;
  v_aj      jsonb;
  v_changes jsonb := '{}'::jsonb;
  v_allowed text[] := array['email','phone','address','address_number','address_complement',
                            'neighborhood','city','state','zip_code','birth_date',
                            'client_origin','tipo_pessoa','status'];
  v_key text;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not (public.is_recepcao()
          or public.has_role(v_uid,'admin'::public.app_role)
          or public.has_menu_grant(v_uid,'clientes')) then
    raise exception 'sem permissão para editar clientes' using errcode = '42501';
  end if;
  select * into v_before from public.clients where id = p_client_id;
  if not found then raise exception 'cliente não encontrado'; end if;
  -- CPF/CNPJ/nome mudam SÓ na tela (auditoria própria) — nunca pelo chat.
  if p_fields ? 'cpf' or p_fields ? 'cnpj' or p_fields ? 'full_name' then
    raise exception 'CPF/CNPJ/nome não podem ser alterados pelo chat — use a tela de edição do cliente';
  end if;

  update public.clients set
    email              = case when p_fields ? 'email' then nullif(p_fields->>'email','') else email end,
    phone              = case when p_fields ? 'phone' then nullif(p_fields->>'phone','') else phone end,
    address            = case when p_fields ? 'address' then nullif(p_fields->>'address','') else address end,
    address_number     = case when p_fields ? 'address_number' then nullif(p_fields->>'address_number','') else address_number end,
    address_complement = case when p_fields ? 'address_complement' then nullif(p_fields->>'address_complement','') else address_complement end,
    neighborhood       = case when p_fields ? 'neighborhood' then nullif(p_fields->>'neighborhood','') else neighborhood end,
    city               = case when p_fields ? 'city' then nullif(p_fields->>'city','') else city end,
    state              = case when p_fields ? 'state' then nullif(p_fields->>'state','') else state end,
    zip_code           = case when p_fields ? 'zip_code' then nullif(p_fields->>'zip_code','') else zip_code end,
    birth_date         = case when p_fields ? 'birth_date' then nullif(p_fields->>'birth_date','')::date else birth_date end,
    client_origin      = case when p_fields ? 'client_origin' then nullif(p_fields->>'client_origin','') else client_origin end,
    tipo_pessoa        = case when p_fields ? 'tipo_pessoa' then nullif(p_fields->>'tipo_pessoa','') else tipo_pessoa end,
    status             = case when p_fields ? 'status' then nullif(p_fields->>'status','') else status end,
    updated_at         = now()
  where id = p_client_id
  returning * into v_after;

  -- Diff só das chaves da whitelist que vieram e mudaram (para log + card).
  v_bj := to_jsonb(v_before);
  v_aj := to_jsonb(v_after);
  foreach v_key in array v_allowed loop
    if (p_fields ? v_key) and ((v_bj->>v_key) is distinct from (v_aj->>v_key)) then
      v_changes := v_changes || jsonb_build_object(v_key,
        jsonb_build_object('antes', v_bj->>v_key, 'depois', v_aj->>v_key));
    end if;
  end loop;

  if v_changes <> '{}'::jsonb then
    insert into public.client_update_log(client_id, changed_by, changes)
    values (p_client_id, v_uid, v_changes);
  end if;

  return jsonb_build_object('ok', true, 'client_id', p_client_id, 'changes', v_changes);
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.atualizar_cliente(uuid,jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.atualizar_cliente(uuid,jsonb) TO authenticated, service_role;
