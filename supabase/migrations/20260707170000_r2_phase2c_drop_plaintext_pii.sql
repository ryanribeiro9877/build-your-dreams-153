-- ============================================================================
-- R-2 (Fase 2C — Passo 3 + 4) — DROP das 10 colunas de TEXTO PURO de clients
-- ----------------------------------------------------------------------------
-- OPERAÇÃO DESTRUTIVA. Remove definitivamente o texto puro da PII de clients;
-- a partir daqui a PII só existe CIFRADA em repouso (*_enc) + índice cego
-- (cpf_bidx).
--
-- >>> PRÉ-REQUISITOS (todos obrigatórios ANTES de aplicar) <<<
--   1. Migration 20260707160000_r2_phase2c_save_client_rpc.sql aplicada
--      (RPC save_client + backfill de segurança).
--   2. App redeployado: ClientForm.tsx, tool cadastrar_cliente
--      (chat-orchestrator) e ImportarDados.tsx gravando via save_client —
--      NENHUM caminho de escrita toca mais as colunas de texto.
--   3. Cadastro/edição validados pela TELA e pelo CHAT (grava cifrado, leitura
--      decifra certo, unicidade de CPF valendo).
--   4. BACKUP feito; janela de baixa atividade; Ryan aplicando/acompanhando.
--
-- Se qualquer caminho de escrita de PII ainda tocar o texto, PARAR — não
-- aplicar. (Briefing §5: ordem inegociável escrita->backfill->trigger->drop.)
--
-- Dependências verificadas (2026-07-07): a ÚNICA dependência de banco sobre as
-- 10 colunas de texto é a view clients_decrypted (recriada abaixo antes do
-- drop). Nenhuma função referencia o texto além de clients_pii_sync (removida
-- abaixo). idx_clients_cnpj (sobre cnpj texto) é dropado automaticamente junto
-- com a coluna. agent_consultar_cliente e search_clients_by_cpf já usam só
-- *_enc/cpf_bidx (Fase 2B) — não mudam.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 0. Backfill defensivo (idempotente) + GUARD de segurança.
--    Reexecuta o backfill e, em seguida, ABORTA a transação inteira se alguma
--    linha ainda tiver texto sem o _enc correspondente (ou CPF sem bidx). É a
--    trava que garante "nenhuma linha perde PII na transição" (critério §4).
-- ----------------------------------------------------------------------------
UPDATE public.clients SET cpf_enc           = public.pii_encrypt(cpf)           WHERE cpf           IS NOT NULL AND cpf_enc           IS NULL;
UPDATE public.clients SET rg_enc            = public.pii_encrypt(rg)            WHERE rg            IS NOT NULL AND rg_enc            IS NULL;
UPDATE public.clients SET cnpj_enc          = public.pii_encrypt(cnpj)          WHERE cnpj          IS NOT NULL AND cnpj_enc          IS NULL;
UPDATE public.clients SET ie_enc            = public.pii_encrypt(ie)            WHERE ie            IS NOT NULL AND ie_enc            IS NULL;
UPDATE public.clients SET im_enc            = public.pii_encrypt(im)            WHERE im            IS NOT NULL AND im_enc            IS NULL;
UPDATE public.clients SET legal_rep_cpf_enc = public.pii_encrypt(legal_rep_cpf) WHERE legal_rep_cpf IS NOT NULL AND legal_rep_cpf_enc IS NULL;
UPDATE public.clients SET pis_nit_enc       = public.pii_encrypt(pis_nit)       WHERE pis_nit       IS NOT NULL AND pis_nit_enc       IS NULL;
UPDATE public.clients SET bank_agency_enc   = public.pii_encrypt(bank_agency)   WHERE bank_agency   IS NOT NULL AND bank_agency_enc   IS NULL;
UPDATE public.clients SET bank_account_enc  = public.pii_encrypt(bank_account)  WHERE bank_account  IS NOT NULL AND bank_account_enc  IS NULL;
UPDATE public.clients SET pix_key_enc       = public.pii_encrypt(pix_key)       WHERE pix_key       IS NOT NULL AND pix_key_enc       IS NULL;
UPDATE public.clients SET cpf_bidx          = public.pii_bidx(cpf)              WHERE cpf           IS NOT NULL AND cpf_bidx          IS NULL;

DO $$
DECLARE
  v_bad bigint;
BEGIN
  SELECT count(*) INTO v_bad
  FROM public.clients
  WHERE (cpf           IS NOT NULL AND cpf_enc           IS NULL)
     OR (cpf           IS NOT NULL AND cpf_bidx          IS NULL)
     OR (rg            IS NOT NULL AND rg_enc            IS NULL)
     OR (cnpj          IS NOT NULL AND cnpj_enc          IS NULL)
     OR (ie            IS NOT NULL AND ie_enc            IS NULL)
     OR (im            IS NOT NULL AND im_enc            IS NULL)
     OR (legal_rep_cpf IS NOT NULL AND legal_rep_cpf_enc IS NULL)
     OR (pis_nit       IS NOT NULL AND pis_nit_enc       IS NULL)
     OR (bank_agency   IS NOT NULL AND bank_agency_enc   IS NULL)
     OR (bank_account  IS NOT NULL AND bank_account_enc  IS NULL)
     OR (pix_key       IS NOT NULL AND pix_key_enc       IS NULL);

  IF v_bad > 0 THEN
    RAISE EXCEPTION 'ABORT 2C: % linha(s) com texto sem cifra correspondente — drop cancelado (nenhuma PII seria perdida, mas revise o backfill).', v_bad
      USING ERRCODE = 'P0001';
  END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- 1. (Passo 3) Recria clients_decrypted SEM o fallback de texto puro.
--    A view era a única dependência de banco sobre as colunas de texto (via
--    COALESCE(pii_decrypt(x_enc), x)). Trocamos por pii_decrypt(x_enc) puro —
--    mesmos nomes/tipos/ordem de colunas (CREATE OR REPLACE exige paridade), o
--    que remove a dependência e libera o DROP das colunas. Preserva
--    security_invoker (RLS de clients aplica ao chamador) e os grants (2A).
--    search_clients_by_cpf (RETURNS SETOF clients_decrypted) segue válida:
--    a assinatura de colunas não muda.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.clients_decrypted
WITH (security_invoker = true) AS
SELECT
  id,
  full_name,
  public.pii_decrypt(cpf_enc)           AS cpf,
  public.pii_decrypt(rg_enc)            AS rg,
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
  public.pii_decrypt(cnpj_enc)          AS cnpj,
  public.pii_decrypt(ie_enc)            AS ie,
  public.pii_decrypt(im_enc)            AS im,
  foundation_date,
  legal_rep_name,
  public.pii_decrypt(legal_rep_cpf_enc) AS legal_rep_cpf,
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
  public.pii_decrypt(pis_nit_enc)       AS pis_nit,
  phone_commercial,
  phone_home,
  address_number,
  address_complement,
  neighborhood,
  country,
  bank_name,
  public.pii_decrypt(bank_agency_enc)   AS bank_agency,
  public.pii_decrypt(bank_account_enc)  AS bank_account,
  bank_account_type,
  public.pii_decrypt(pix_key_enc)       AS pix_key,
  pix_key_type,
  gov_br_profile,
  cpf_bidx,
  -- Colunas de status/whatsapp adicionadas à view após a 2A (kanban/gate/flags);
  -- pass-through, sem PII. Mantidas na mesma ordem para o CREATE OR REPLACE
  -- preservar a assinatura exata da view atual (senão "cannot drop columns").
  status_comercial,
  status_juridico,
  status_documental,
  status_atendimento,
  status_processo,
  phone_is_whatsapp,
  phone_commercial_is_whatsapp,
  phone_home_is_whatsapp
FROM public.clients;

-- Reforça os grants (CREATE OR REPLACE preserva, mas mantemos explícito = 2A).
REVOKE ALL ON public.clients_decrypted FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.clients_decrypted TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. (Passo 3) Remove o trigger de cifra a-partir-do-texto e sua função.
--    Com a escrita indo direto em *_enc via save_client (Passo 1), o trigger
--    que lia NEW.cpf/NEW.rg/... deixa de ser necessário — e referencia colunas
--    que serão dropadas no passo seguinte, então PRECISA sair antes. Os demais
--    triggers de clients (status_ownership_guard, update_updated_at) não tocam
--    PII e permanecem.
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_clients_pii_sync ON public.clients;
DROP FUNCTION IF EXISTS public.clients_pii_sync();

-- ----------------------------------------------------------------------------
-- 3. (Passo 4) DROP das 10 colunas de TEXTO PURO.
--    A partir daqui a PII só existe cifrada (*_enc) + cpf_bidx. O índice
--    idx_clients_cnpj (sobre cnpj texto) cai junto com a coluna.
-- ----------------------------------------------------------------------------
ALTER TABLE public.clients
  DROP COLUMN cpf,
  DROP COLUMN rg,
  DROP COLUMN cnpj,
  DROP COLUMN ie,
  DROP COLUMN im,
  DROP COLUMN legal_rep_cpf,
  DROP COLUMN pis_nit,
  DROP COLUMN bank_agency,
  DROP COLUMN bank_account,
  DROP COLUMN pix_key;

COMMIT;

-- ============================================================================
-- Validação pós-aplicação (§4 — rodar após COMMIT, fora desta migration):
--   -- 1) Nenhuma coluna de texto puro sobrou:
--   SELECT column_name FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='clients'
--      AND column_name IN ('cpf','rg','cnpj','ie','im','legal_rep_cpf',
--                          'pis_nit','bank_agency','bank_account','pix_key');
--   -- (esperado: 0 linhas)
--
--   -- 2) Leitura decifra certo:
--   SELECT id, cpf, cnpj FROM public.clients_decrypted LIMIT 5;   -- como recepção
--   SELECT * FROM public.search_clients_by_cpf('<cpf de teste>'); -- como recepção
--
--   -- 3) Unicidade de CPF segue valendo (índice cego):
--   SELECT indexname FROM pg_indexes
--    WHERE tablename='clients' AND indexname='clients_cpf_bidx_uniq';
--
--   -- 4) Cadastro novo pela tela e pelo chat grava PII (só cifrada).
--
-- R-2 fecha; card 3.5 (metade "blindar dados sensíveis do cliente") concluído.
-- ============================================================================
