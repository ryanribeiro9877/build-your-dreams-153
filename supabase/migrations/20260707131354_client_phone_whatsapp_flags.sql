-- ============================================================================
-- 3.3 (Gap A) — Marcador de WhatsApp por telefone em public.clients
-- Aditivo e idempotente: 3 booleanos NOT NULL DEFAULT false, um por telefone
-- (celular, comercial, residencial). NÃO cria tabela nova, NÃO toca em
-- pix_key/pix_key_enc nem nas colunas _enc/cpf_bidx (R-2 intacto).
-- Também expõe os flags na view decifrada clients_decrypted (caminho de leitura
-- do detalhe/edição), preservando toda a decifra de PII já existente.
-- ============================================================================

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS phone_is_whatsapp            boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS phone_commercial_is_whatsapp boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS phone_home_is_whatsapp       boolean NOT NULL DEFAULT false;

-- Recria a view decifrada preservando TODAS as colunas atuais (inclui os
-- status_* adicionados por clients_status_dimensions) e apenas ACRESCENTA os 3
-- flags ao final. security_invoker mantém a RLS de clients no chamador.
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
  cpf_bidx,
  status_comercial,
  status_juridico,
  status_documental,
  status_atendimento,
  status_processo,
  phone_is_whatsapp,
  phone_commercial_is_whatsapp,
  phone_home_is_whatsapp
FROM public.clients;

-- CREATE OR REPLACE preserva os grants; reafirmamos por segurança.
REVOKE ALL ON public.clients_decrypted FROM PUBLIC, anon, service_role;
GRANT SELECT ON public.clients_decrypted TO authenticated;
