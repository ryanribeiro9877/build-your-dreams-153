-- Migração: add_cnpj_bidx_client_lookup
-- Espelho da migração aplicada em produção via apply_migration (project ref tsltxvswzdnlmvljpryh).
-- NÃO reexecutar: este arquivo é registro de versão, não script de execução.
--
-- Objetivo: fazer agent_consultar_cliente encontrar clientes PJ por CNPJ,
-- espelhando o índice cego (blind index) que já existe para CPF (pii_bidx).
-- Tudo aditivo: soma capacidade de busca; não altera CPF nem nome; não destrói dado.
-- Ordem importa: coluna -> backfill -> índices -> trigger -> função.

-- 1) Coluna do índice cego de CNPJ (espelha cpf_bidx)
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS cnpj_bidx text;

-- 2) Backfill dos registros existentes (UPDATE direto; não muda cnpj, então o trigger não interfere)
UPDATE public.clients
   SET cnpj_bidx = public.pii_bidx(cnpj)
 WHERE cnpj IS NOT NULL AND cnpj_bidx IS NULL;

-- 3) Índices espelhando o CPF (único parcial + btree comum)
CREATE INDEX IF NOT EXISTS idx_clients_cnpj_bidx
  ON public.clients USING btree (cnpj_bidx);
CREATE UNIQUE INDEX IF NOT EXISTS clients_cnpj_bidx_uniq
  ON public.clients USING btree (cnpj_bidx)
  WHERE (cnpj_bidx IS NOT NULL);

-- 4) Trigger de PII: passa a manter cnpj_bidx em INSERT/UPDATE.
--    A ÚNICA mudança em relação à versão atual é a linha "NEW.cnpj_bidx := public.pii_bidx(NEW.cnpj);".
CREATE OR REPLACE FUNCTION public.clients_pii_sync()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NEW.cpf IS NOT NULL AND ((TG_OP = 'INSERT') OR (NEW.cpf IS DISTINCT FROM OLD.cpf)) THEN
    NEW.cpf_enc  := public.pii_encrypt(NEW.cpf);
    NEW.cpf_bidx := public.pii_bidx(NEW.cpf);
  END IF;
  IF NEW.rg IS NOT NULL AND ((TG_OP = 'INSERT') OR (NEW.rg IS DISTINCT FROM OLD.rg)) THEN
    NEW.rg_enc := public.pii_encrypt(NEW.rg);
  END IF;
  IF NEW.legal_rep_cpf IS NOT NULL AND ((TG_OP = 'INSERT') OR (NEW.legal_rep_cpf IS DISTINCT FROM OLD.legal_rep_cpf)) THEN
    NEW.legal_rep_cpf_enc := public.pii_encrypt(NEW.legal_rep_cpf);
  END IF;
  IF NEW.pis_nit IS NOT NULL AND ((TG_OP = 'INSERT') OR (NEW.pis_nit IS DISTINCT FROM OLD.pis_nit)) THEN
    NEW.pis_nit_enc := public.pii_encrypt(NEW.pis_nit);
  END IF;
  IF NEW.bank_agency IS NOT NULL AND ((TG_OP = 'INSERT') OR (NEW.bank_agency IS DISTINCT FROM OLD.bank_agency)) THEN
    NEW.bank_agency_enc := public.pii_encrypt(NEW.bank_agency);
  END IF;
  IF NEW.bank_account IS NOT NULL AND ((TG_OP = 'INSERT') OR (NEW.bank_account IS DISTINCT FROM OLD.bank_account)) THEN
    NEW.bank_account_enc := public.pii_encrypt(NEW.bank_account);
  END IF;
  IF NEW.pix_key IS NOT NULL AND ((TG_OP = 'INSERT') OR (NEW.pix_key IS DISTINCT FROM OLD.pix_key)) THEN
    NEW.pix_key_enc := public.pii_encrypt(NEW.pix_key);
  END IF;
  IF NEW.cnpj IS NOT NULL AND ((TG_OP = 'INSERT') OR (NEW.cnpj IS DISTINCT FROM OLD.cnpj)) THEN
    NEW.cnpj_enc  := public.pii_encrypt(NEW.cnpj);
    NEW.cnpj_bidx := public.pii_bidx(NEW.cnpj);   -- <<< ÚNICA LINHA NOVA
  END IF;
  IF NEW.ie IS NOT NULL AND ((TG_OP = 'INSERT') OR (NEW.ie IS DISTINCT FROM OLD.ie)) THEN
    NEW.ie_enc := public.pii_encrypt(NEW.ie);
  END IF;
  IF NEW.im IS NOT NULL AND ((TG_OP = 'INSERT') OR (NEW.im IS DISTINCT FROM OLD.im)) THEN
    NEW.im_enc := public.pii_encrypt(NEW.im);
  END IF;
  RETURN NEW;
END;
$function$;

-- 5) Resolver do agente: no ramo de dígitos, buscar TAMBÉM por cnpj_bidx.
--    A ÚNICA mudança é o "or c.cnpj_bidx = ...". HMAC de 11 dígitos != HMAC de 14 dígitos,
--    então não há falso-positivo entre CPF e CNPJ.
CREATE OR REPLACE FUNCTION public.agent_consultar_cliente(p_busca text)
 RETURNS TABLE(id uuid, full_name text, cpf text, status text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_raw   text := coalesce(p_busca, '');
  v_clean text;
begin
  if not (public.is_recepcao_or_socio() or public.is_socio_or_advogado()) then
    return;
  end if;
  v_clean := regexp_replace(v_raw, '[.\-/ ]', '', 'g');
  if v_clean <> '' and v_clean ~ '^[0-9]+$' then
    return query
      select c.id, c.full_name, public.pii_decrypt(c.cpf_enc), c.status
        from public.clients c
       where c.cpf_bidx  = public.pii_bidx(v_raw)
          or c.cnpj_bidx = public.pii_bidx(v_raw)   -- <<< ÚNICA LINHA NOVA
       limit 10;
  else
    return query
      select c.id, c.full_name, public.pii_decrypt(c.cpf_enc), c.status
        from public.clients c
       where c.full_name ilike '%' || v_raw || '%'
       limit 10;
  end if;
end;
$function$;
