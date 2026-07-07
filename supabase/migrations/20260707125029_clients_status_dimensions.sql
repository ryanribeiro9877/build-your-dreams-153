-- [3.2] Cinco dimensões de status em `clients` + permissão por dimensão.
-- NÃO recria campos PF/PJ (já existem). NÃO toca colunas _enc/cpf_bidx (R-2 intacto).
-- origem = client_origin (já existe). Row-gate is_recepcao_or_socio() permanece.

-- 1. Cinco colunas de dimensão: text + CHECK, nullable, sem default.
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS status_comercial   text,
  ADD COLUMN IF NOT EXISTS status_juridico    text,
  ADD COLUMN IF NOT EXISTS status_documental  text,
  ADD COLUMN IF NOT EXISTS status_atendimento text,
  ADD COLUMN IF NOT EXISTS status_processo    text;

-- CHECKs permissivos a NULL (as 35 linhas existentes ficam NULL; o form define ao editar).
ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_status_comercial_check;
ALTER TABLE public.clients ADD  CONSTRAINT clients_status_comercial_check
  CHECK (status_comercial IS NULL OR status_comercial IN
    ('prospecto','em_negociacao','ativo','inativo','perdido'));

ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_status_juridico_check;
ALTER TABLE public.clients ADD  CONSTRAINT clients_status_juridico_check
  CHECK (status_juridico IS NULL OR status_juridico IN
    ('sem_processo','com_processo_ativo','processo_inativo','em_recurso','arquivado','encerrado'));

ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_status_documental_check;
ALTER TABLE public.clients ADD  CONSTRAINT clients_status_documental_check
  CHECK (status_documental IS NULL OR status_documental IN
    ('pendente','incompleto','completo','vencido'));

ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_status_atendimento_check;
ALTER TABLE public.clients ADD  CONSTRAINT clients_status_atendimento_check
  CHECK (status_atendimento IS NULL OR status_atendimento IN
    ('aguardando_contato','em_atendimento','atendido','sem_retorno'));

ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_status_processo_check;
ALTER TABLE public.clients ADD  CONSTRAINT clients_status_processo_check
  CHECK (status_processo IS NULL OR status_processo IN
    ('inicial','audiencia','em_andamento','sentenca','recurso','transitado_em_julgado'));

COMMENT ON COLUMN public.clients.status_comercial   IS 'Dimensão comercial (recepção+sócio editam). Mapeia o `status` legado.';
COMMENT ON COLUMN public.clients.status_juridico     IS 'Dimensão jurídica — ownership: só sócio/advogado edita (trigger + UI).';
COMMENT ON COLUMN public.clients.status_documental   IS 'Dimensão documental (recepção+sócio editam).';
COMMENT ON COLUMN public.clients.status_atendimento  IS 'Dimensão de atendimento (recepção+sócio editam).';
COMMENT ON COLUMN public.clients.status_processo     IS 'Dimensão do processo — ownership: só sócio/advogado edita (trigger + UI).';

-- 2. Backfill do comercial a partir do `status` legado (mantido — o badge 3.1 ainda o lê).
UPDATE public.clients
   SET status_comercial = status
 WHERE status_comercial IS NULL
   AND status IN ('prospecto','em_negociacao','ativo','inativo','perdido');

-- 3. Helper de papel: sócio ou advogado (adv_*). Recepção NÃO entra.
CREATE OR REPLACE FUNCTION public.is_socio_or_advogado()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.role_templates rt ON rt.id = p.role_template_id
    WHERE p.user_id = auth.uid()
      AND (rt.code = 'socio' OR rt.code LIKE 'adv_%')
  );
$fn$;

-- 4. Camada 2 (defesa em profundidade): só sócio/advogado (ou master admin) altera
--    status_juridico/status_processo. Demais papéis: reverte ao valor antigo (silencioso).
--    O form envia todas as colunas no UPDATE; RAISE quebraria o save legítimo da recepção,
--    então revertemos só os dois campos jurídicos quando de fato mudaram.
CREATE OR REPLACE FUNCTION public.clients_status_ownership_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF public.is_socio_or_advogado() OR public.is_master_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;
  IF NEW.status_juridico IS DISTINCT FROM OLD.status_juridico THEN
    NEW.status_juridico := OLD.status_juridico;
  END IF;
  IF NEW.status_processo IS DISTINCT FROM OLD.status_processo THEN
    NEW.status_processo := OLD.status_processo;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_clients_status_ownership ON public.clients;
CREATE TRIGGER trg_clients_status_ownership
  BEFORE UPDATE ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION public.clients_status_ownership_guard();

-- 5. Expor as 5 dimensões na view decifrada (append no fim — status não é PII;
--    o detalhe/edição do front lê exclusivamente de clients_decrypted).
CREATE OR REPLACE VIEW public.clients_decrypted WITH (security_invoker = true) AS
 SELECT id,
    full_name,
    COALESCE(pii_decrypt(cpf_enc), cpf) AS cpf,
    COALESCE(pii_decrypt(rg_enc), rg) AS rg,
    email,
    phone,
    address,
    city,
    state,
    zip_code,
    notes,
    status,
    responsible_lawyer_id,
    created_by,
    created_at,
    updated_at,
    tipo_pessoa,
    client_origin,
    fantasy_name,
    COALESCE(pii_decrypt(cnpj_enc), cnpj) AS cnpj,
    COALESCE(pii_decrypt(ie_enc), ie) AS ie,
    COALESCE(pii_decrypt(im_enc), im) AS im,
    foundation_date,
    legal_rep_name,
    COALESCE(pii_decrypt(legal_rep_cpf_enc), legal_rep_cpf) AS legal_rep_cpf,
    rg_issuer,
    rg_uf,
    birth_date,
    gender,
    marital_status,
    nationality,
    natural_city,
    natural_uf,
    mother_name,
    father_name,
    profession,
    COALESCE(pii_decrypt(pis_nit_enc), pis_nit) AS pis_nit,
    phone_commercial,
    phone_home,
    address_number,
    address_complement,
    neighborhood,
    country,
    bank_name,
    COALESCE(pii_decrypt(bank_agency_enc), bank_agency) AS bank_agency,
    COALESCE(pii_decrypt(bank_account_enc), bank_account) AS bank_account,
    bank_account_type,
    COALESCE(pii_decrypt(pix_key_enc), pix_key) AS pix_key,
    pix_key_type,
    gov_br_profile,
    cpf_bidx,
    status_comercial,
    status_juridico,
    status_documental,
    status_atendimento,
    status_processo
   FROM clients;