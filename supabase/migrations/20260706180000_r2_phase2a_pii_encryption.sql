-- ============================================================================
-- R-2 (Fase 2A) — Cripto em repouso + índice cego de CPF (expand-contract)
-- ----------------------------------------------------------------------------
-- Cifra em repouso os campos sensíveis de public.clients e cria o índice cego
-- (blind index) que mantém a busca EXATA por CPF funcionando.
--
-- Estratégia expand-contract: esta é a fase EXPAND — só adiciona e preenche.
--   * Ninguém LÊ as colunas cifradas ainda (isso é a Fase 2B — o app).
--   * O texto puro NÃO é removido aqui (isso é a Fase 2C, depois de validar).
--   * O banco nunca fica quebrado: texto e cifrado convivem, mantidos em
--     sincronia por trigger durante a transição.
--
-- Campos cifrados (10): cpf, rg, legal_rep_cpf, pis_nit, bank_agency,
--   bank_account, pix_key, cnpj, ie, im   (cnpj/ie/im incluídos por decisão
--   do Ryan em 2026-07-06).
-- Índice cego (1): cpf — único campo pesquisado por igualdade hoje
--   (consultar_cliente → ilike em full_name e cpf).
--
-- Extensões (já instaladas): pgcrypto (schema extensions), supabase_vault
--   (schema vault). Duas chaves distintas no Vault: pii_enc_key (cifra) e
--   pii_bidx_key (índice cego). Nunca no código/git.
--
-- Todas as funções são SECURITY DEFINER com `set search_path = ''` (também
-- endereça o R-3) e só concedem EXECUTE a `authenticated`.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Chaves no Vault (idempotente: só cria se ainda não existir)
-- ----------------------------------------------------------------------------
SELECT vault.create_secret(
  encode(extensions.gen_random_bytes(32), 'hex'),
  'pii_enc_key',
  'R-2 Fase 2A: chave de cifra (pgp_sym) da PII de clients'
)
WHERE NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'pii_enc_key');

SELECT vault.create_secret(
  encode(extensions.gen_random_bytes(32), 'hex'),
  'pii_bidx_key',
  'R-2 Fase 2A: chave HMAC do índice cego de CPF em clients'
)
WHERE NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'pii_bidx_key');

-- ----------------------------------------------------------------------------
-- 2. Funções primitivas (SECURITY DEFINER, search_path vazio)
-- ----------------------------------------------------------------------------

-- Cifra um texto -> bytea. VOLATILE: pgp_sym_encrypt usa IV aleatório.
CREATE OR REPLACE FUNCTION public.pii_encrypt(p_plain text)
RETURNS bytea
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_key text;
BEGIN
  IF p_plain IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT decrypted_secret INTO v_key
    FROM vault.decrypted_secrets
   WHERE name = 'pii_enc_key';
  RETURN extensions.pgp_sym_encrypt(p_plain, v_key);
END;
$$;

-- Decifra bytea -> texto. STABLE: determinística dada a chave.
CREATE OR REPLACE FUNCTION public.pii_decrypt(p_cipher bytea)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_key text;
BEGIN
  IF p_cipher IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT decrypted_secret INTO v_key
    FROM vault.decrypted_secrets
   WHERE name = 'pii_enc_key';
  RETURN extensions.pgp_sym_decrypt(p_cipher, v_key);
END;
$$;

-- Índice cego: HMAC-SHA256 do valor normalizado (só dígitos, p/ CPF).
-- Mesmo CPF -> mesmo hash (busca por igualdade); sem a chave não dá p/ voltar.
-- STABLE: determinística dada a chave.
CREATE OR REPLACE FUNCTION public.pii_bidx(p_input text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_key  text;
  v_norm text;
BEGIN
  IF p_input IS NULL THEN
    RETURN NULL;
  END IF;
  -- normaliza: remove tudo que não é dígito (123.456.789-00 -> 12345678900)
  v_norm := regexp_replace(p_input, '[^0-9]', '', 'g');
  IF v_norm = '' THEN
    RETURN NULL;
  END IF;
  SELECT decrypted_secret INTO v_key
    FROM vault.decrypted_secrets
   WHERE name = 'pii_bidx_key';
  RETURN encode(extensions.hmac(v_norm, v_key, 'sha256'), 'hex');
END;
$$;

-- EXECUTE só para authenticated (recepção/sócio já veem tudo; a proteção é
-- contra dump do storage — a chave vive no Vault, não na tabela).
-- IMPORTANTE: no Supabase, DEFAULT PRIVILEGES concedem EXECUTE a anon,
-- authenticated e service_role automaticamente na criação. Um REVOKE só de
-- PUBLIC NÃO remove esses grants por-role — sem revogá-los explicitamente,
-- anon poderia chamar pii_decrypt() e transformar um ciphertext vazado em
-- texto puro. Revogamos de todos e concedemos apenas a authenticated.
REVOKE ALL ON FUNCTION public.pii_encrypt(text)  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.pii_decrypt(bytea) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.pii_bidx(text)     FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pii_encrypt(text)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.pii_decrypt(bytea) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pii_bidx(text)     TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. Colunas novas (aditivas, nullable) — NÃO tocar nas colunas de texto
-- ----------------------------------------------------------------------------
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS cpf_enc           bytea,
  ADD COLUMN IF NOT EXISTS rg_enc            bytea,
  ADD COLUMN IF NOT EXISTS legal_rep_cpf_enc bytea,
  ADD COLUMN IF NOT EXISTS pis_nit_enc       bytea,
  ADD COLUMN IF NOT EXISTS bank_agency_enc   bytea,
  ADD COLUMN IF NOT EXISTS bank_account_enc  bytea,
  ADD COLUMN IF NOT EXISTS pix_key_enc       bytea,
  ADD COLUMN IF NOT EXISTS cnpj_enc          bytea,
  ADD COLUMN IF NOT EXISTS ie_enc            bytea,
  ADD COLUMN IF NOT EXISTS im_enc            bytea,
  ADD COLUMN IF NOT EXISTS cpf_bidx          text;

-- ----------------------------------------------------------------------------
-- 4. Trigger de manutenção (transição): mantém _enc/_bidx em sincronia com o
--    texto enquanto o app (2B) ainda grava texto. SECURITY DEFINER para que
--    qualquer escritor (authenticated via RLS ou service_role via edge)
--    dispare a cifra sem precisar de EXECUTE direto nas primitivas.
--    Na 2C, quando o app parar de escrever texto, este trigger é substituído.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.clients_pii_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (TG_OP = 'INSERT') OR (NEW.cpf IS DISTINCT FROM OLD.cpf) THEN
    NEW.cpf_enc  := public.pii_encrypt(NEW.cpf);
    NEW.cpf_bidx := public.pii_bidx(NEW.cpf);
  END IF;
  IF (TG_OP = 'INSERT') OR (NEW.rg IS DISTINCT FROM OLD.rg) THEN
    NEW.rg_enc := public.pii_encrypt(NEW.rg);
  END IF;
  IF (TG_OP = 'INSERT') OR (NEW.legal_rep_cpf IS DISTINCT FROM OLD.legal_rep_cpf) THEN
    NEW.legal_rep_cpf_enc := public.pii_encrypt(NEW.legal_rep_cpf);
  END IF;
  IF (TG_OP = 'INSERT') OR (NEW.pis_nit IS DISTINCT FROM OLD.pis_nit) THEN
    NEW.pis_nit_enc := public.pii_encrypt(NEW.pis_nit);
  END IF;
  IF (TG_OP = 'INSERT') OR (NEW.bank_agency IS DISTINCT FROM OLD.bank_agency) THEN
    NEW.bank_agency_enc := public.pii_encrypt(NEW.bank_agency);
  END IF;
  IF (TG_OP = 'INSERT') OR (NEW.bank_account IS DISTINCT FROM OLD.bank_account) THEN
    NEW.bank_account_enc := public.pii_encrypt(NEW.bank_account);
  END IF;
  IF (TG_OP = 'INSERT') OR (NEW.pix_key IS DISTINCT FROM OLD.pix_key) THEN
    NEW.pix_key_enc := public.pii_encrypt(NEW.pix_key);
  END IF;
  IF (TG_OP = 'INSERT') OR (NEW.cnpj IS DISTINCT FROM OLD.cnpj) THEN
    NEW.cnpj_enc := public.pii_encrypt(NEW.cnpj);
  END IF;
  IF (TG_OP = 'INSERT') OR (NEW.ie IS DISTINCT FROM OLD.ie) THEN
    NEW.ie_enc := public.pii_encrypt(NEW.ie);
  END IF;
  IF (TG_OP = 'INSERT') OR (NEW.im IS DISTINCT FROM OLD.im) THEN
    NEW.im_enc := public.pii_encrypt(NEW.im);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clients_pii_sync ON public.clients;
CREATE TRIGGER trg_clients_pii_sync
  BEFORE INSERT OR UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.clients_pii_sync();

-- ----------------------------------------------------------------------------
-- 5. Backfill das linhas existentes (tabela pequena; roda em um passo).
--    A trigger é BEFORE UPDATE mas os guards (IS DISTINCT FROM) não disparam
--    aqui, pois só mexemos nas colunas _enc/_bidx — os valores explícitos
--    abaixo prevalecem.
-- ----------------------------------------------------------------------------
UPDATE public.clients SET
  cpf_enc           = public.pii_encrypt(cpf),
  rg_enc            = public.pii_encrypt(rg),
  legal_rep_cpf_enc = public.pii_encrypt(legal_rep_cpf),
  pis_nit_enc       = public.pii_encrypt(pis_nit),
  bank_agency_enc   = public.pii_encrypt(bank_agency),
  bank_account_enc  = public.pii_encrypt(bank_account),
  pix_key_enc       = public.pii_encrypt(pix_key),
  cnpj_enc          = public.pii_encrypt(cnpj),
  ie_enc            = public.pii_encrypt(ie),
  im_enc            = public.pii_encrypt(im),
  cpf_bidx          = public.pii_bidx(cpf);

-- ----------------------------------------------------------------------------
-- 6. Índice do blind index (busca exata por CPF)
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_clients_cpf_bidx ON public.clients (cpf_bidx);

-- ----------------------------------------------------------------------------
-- 7. Caminho de LEITURA para a Fase 2B consumir.
--    View decifrada + RPC de busca exata por CPF. A view é security_invoker,
--    então a RLS de linha de clients (is_recepcao_or_socio()) é respeitada
--    automaticamente; as funções de decifra são SECURITY DEFINER e leem a
--    chave do Vault. COALESCE(decrypt(_enc), <texto>) deixa a view correta
--    tanto agora (texto ainda presente) quanto na 2C (só cifrado).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.clients_decrypted
WITH (security_invoker = true) AS
SELECT
  id,
  full_name,
  COALESCE(public.pii_decrypt(cpf_enc), cpf)                     AS cpf,
  COALESCE(public.pii_decrypt(rg_enc), rg)                       AS rg,
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
  COALESCE(public.pii_decrypt(cnpj_enc), cnpj)                   AS cnpj,
  COALESCE(public.pii_decrypt(ie_enc), ie)                       AS ie,
  COALESCE(public.pii_decrypt(im_enc), im)                       AS im,
  foundation_date,
  legal_rep_name,
  COALESCE(public.pii_decrypt(legal_rep_cpf_enc), legal_rep_cpf) AS legal_rep_cpf,
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
  COALESCE(public.pii_decrypt(pis_nit_enc), pis_nit)            AS pis_nit,
  phone_commercial,
  phone_home,
  address_number,
  address_complement,
  neighborhood,
  country,
  bank_name,
  COALESCE(public.pii_decrypt(bank_agency_enc), bank_agency)     AS bank_agency,
  COALESCE(public.pii_decrypt(bank_account_enc), bank_account)   AS bank_account,
  bank_account_type,
  COALESCE(public.pii_decrypt(pix_key_enc), pix_key)            AS pix_key,
  pix_key_type,
  gov_br_profile,
  cpf_bidx
FROM public.clients;

-- Idem às funções: revoga o grant automático de anon/service_role (DEFAULT
-- PRIVILEGES) para que a view decifrada só seja legível por authenticated.
REVOKE ALL ON public.clients_decrypted FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.clients_decrypted TO authenticated;

-- Busca exata por CPF via índice cego, devolvendo as linhas decifradas.
-- security invoker -> RLS de clients (is_recepcao_or_socio) aplica ao chamador.
CREATE OR REPLACE FUNCTION public.search_clients_by_cpf(cpf_input text)
RETURNS SETOF public.clients_decrypted
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT *
    FROM public.clients_decrypted
   WHERE cpf_bidx = public.pii_bidx(cpf_input);
$$;

REVOKE ALL ON FUNCTION public.search_clients_by_cpf(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_clients_by_cpf(text) TO authenticated;

-- ============================================================================
-- Fim R-2 Fase 2A (EXPAND). Texto puro intacto. Nada é lido/removido aqui.
-- Próximos: 2B (app grava/busca/exibe via cifrado) e 2C (drop do texto puro).
-- ============================================================================
