-- ============================================================================
-- R-2 (Fase 2C — Passo 1 + 2) — Escrita de cliente pela via CIFRADA
-- ----------------------------------------------------------------------------
-- Objetivo do R-2 Fase 2C: eliminar as 10 colunas de TEXTO PURO de
-- public.clients (cpf, rg, cnpj, ie, im, legal_rep_cpf, pis_nit, bank_agency,
-- bank_account, pix_key), deixando a PII SÓ cifrada em repouso.
--
-- Ordem inegociável (briefing): escrita cifrada (1) -> backfill (2) ->
-- trigger (3) -> drop (4). Esta migration cobre os passos 1 e 2 e é
-- NÃO-DESTRUTIVA (não dropa nada). O drop das colunas de texto e o ajuste do
-- trigger de cifra ficam na migration seguinte (2C — Passo 3 + 4), aplicada
-- só DEPOIS de:
--   (a) esta migration aplicada;
--   (b) o app (ClientForm, tool cadastrar_cliente, ImportarDados) redeployado
--       usando a RPC save_client;
--   (c) cadastro/edição validados pela tela e pelo chat.
--
-- >>> ESCOPO / EXECUÇÃO <<<
--   NÃO APLICAR DIRETO. Revisão + backup + janela; Ryan aplica/acompanha.
--   Esta é a metade não-destrutiva; ainda assim faz parte de uma operação
--   sensível (mexe na escrita de PII de produção).
--
-- ----------------------------------------------------------------------------
-- POR QUE UMA RPC (e não continuar gravando texto + trigger de cifra):
--   Hoje a escrita grava as colunas de TEXTO e o trigger clients_pii_sync
--   (Fase 2A) lê NEW.cpf/NEW.rg/... para popular *_enc/cpf_bidx. Ou seja, o
--   texto puro é o PONTO DE ENTRADA da PII. Para dropar o texto sem quebrar a
--   gravação nem perder dado, a escrita precisa passar a alimentar *_enc
--   DIRETO, sem depender do texto — exatamente como GOV-CRED faz via
--   save_gov_credential. Esta RPC é o equivalente para clients.
--
-- DESENHO:
--   * save_client(p_id, p_data jsonb): upsert do cliente inteiro numa única
--     operação atômica (evita linha órfã e mantém a unicidade de CPF via
--     índice cego). p_id NULL => INSERT; p_id preenchido => UPDATE.
--   * A PII (10 campos) é cifrada SERVER-SIDE (pii_encrypt) e o cpf_bidx é
--     recomputado (pii_bidx) — as colunas de TEXTO NUNCA são tocadas por esta
--     RPC. Enquanto o texto ainda existir, o trigger de cifra continua como
--     rede de segurança, mas nada mais depende do texto para gravar.
--   * Campos de texto simples entram por NULLIF(...,'') => "" vira NULL
--     (paridade com o comportamento atual do ClientForm).
--   * SECURITY DEFINER + search_path='' (padrão do projeto; também R-3). Como
--     DEFINER bypassa a RLS de clients, a autorização é re-checada aqui
--     (is_recepcao_or_socio) e o created_by é fixado em auth.uid() no INSERT —
--     espelhando a policy de linha (is_recepcao_or_socio() AND uid=created_by).
--   * As colunas de status juridico/comercial/etc. e responsible_lawyer_id NÃO
--     são gerenciadas aqui (pertencem a outros fluxos); ficam intactas.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Backfill de SEGURANÇA (Passo 2) — idempotente.
--    Garante que toda linha com texto tenha o _enc correspondente ANTES de
--    qualquer drop. Só toca linhas com texto presente e _enc ainda nulo, então
--    é seguro reexecutar. (No estado atual do banco os counts já batem; isto é
--    a rede que garante que nenhuma linha perca PII na transição.)
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

-- ----------------------------------------------------------------------------
-- 1b. Trigger de cifra TRANSITION-SAFE (crítico para a janela de convivência).
--     A partir de agora a RPC save_client grava *_enc DIRETO, com as colunas de
--     TEXTO deixadas NULL. O trigger clients_pii_sync (Fase 2A) rodava, no
--     INSERT, `NEW.cpf_enc := pii_encrypt(NEW.cpf)` INCONDICIONALMENTE — como o
--     texto vem NULL, isso SOBRESCREVERIA com NULL a cifra que a RPC acabou de
--     setar, PERDENDO a PII na janela entre esta migration (app já usando a RPC)
--     e o drop (migration seguinte).
--
--     Correção: só (re)cifrar A PARTIR DO TEXTO quando o texto estiver PRESENTE
--     (NEW.<campo> IS NOT NULL). Se o texto vier NULL, o trigger NÃO toca o _enc
--     (preserva o que a RPC gravou). Assim texto e cifra convivem sem colisão:
--       * escritor legado (se restar algum) que grave texto -> trigger cifra;
--       * escritor novo (save_client) que grave _enc -> trigger não interfere.
--     Na migration de drop este trigger é removido de vez (texto some).
--     Mantém SECURITY DEFINER + search_path='' e os grants (revogados na 2B).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.clients_pii_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
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
    NEW.cnpj_enc := public.pii_encrypt(NEW.cnpj);
  END IF;
  IF NEW.ie IS NOT NULL AND ((TG_OP = 'INSERT') OR (NEW.ie IS DISTINCT FROM OLD.ie)) THEN
    NEW.ie_enc := public.pii_encrypt(NEW.ie);
  END IF;
  IF NEW.im IS NOT NULL AND ((TG_OP = 'INSERT') OR (NEW.im IS DISTINCT FROM OLD.im)) THEN
    NEW.im_enc := public.pii_encrypt(NEW.im);
  END IF;
  RETURN NEW;
END;
$$;
-- (trigger trg_clients_pii_sync já existe apontando para esta função; o
--  CREATE OR REPLACE acima basta. Grants seguem revogados de todos — 2B.)

-- ----------------------------------------------------------------------------
-- 2. RPC de escrita cifrada (Passo 1).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_client(p_id uuid, p_data jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
BEGIN
  -- Autorização (DEFINER bypassa RLS -> re-checa aqui, igual à policy de linha).
  IF NOT public.is_recepcao_or_socio() THEN
    RAISE EXCEPTION 'Acesso negado: apenas recepção ou sócio podem gravar clientes'
      USING ERRCODE = '42501';
  END IF;

  IF p_data IS NULL THEN
    RAISE EXCEPTION 'payload do cliente ausente' USING ERRCODE = '22004';
  END IF;

  IF p_id IS NULL THEN
    -- ---------------------------- INSERT (cadastro) --------------------------
    IF NULLIF(p_data->>'full_name','') IS NULL THEN
      RAISE EXCEPTION 'full_name (nome) é obrigatório' USING ERRCODE = '23502';
    END IF;

    INSERT INTO public.clients (
      created_by,
      full_name, tipo_pessoa, status, country,
      fantasy_name, client_origin, gov_br_profile,
      rg_issuer, rg_uf, gender, marital_status, nationality,
      natural_city, natural_uf, mother_name, father_name, profession, legal_rep_name,
      email, phone, phone_commercial, phone_home,
      phone_is_whatsapp, phone_commercial_is_whatsapp, phone_home_is_whatsapp,
      zip_code, address, address_number, address_complement, neighborhood, city, state,
      bank_name, bank_account_type, pix_key_type, notes,
      birth_date, foundation_date,
      -- PII: só cifrada + índice cego. Colunas de TEXTO ficam intocadas.
      cpf_enc,           cpf_bidx,
      rg_enc, cnpj_enc, ie_enc, im_enc, legal_rep_cpf_enc, pis_nit_enc,
      bank_agency_enc, bank_account_enc, pix_key_enc
    ) VALUES (
      auth.uid(),
      NULLIF(p_data->>'full_name',''),
      COALESCE(NULLIF(p_data->>'tipo_pessoa',''), 'fisica'),
      COALESCE(NULLIF(p_data->>'status',''), 'ativo'),
      COALESCE(NULLIF(p_data->>'country',''), 'Brasil'),
      NULLIF(p_data->>'fantasy_name',''),
      NULLIF(p_data->>'client_origin',''),
      NULLIF(p_data->>'gov_br_profile',''),
      NULLIF(p_data->>'rg_issuer',''),
      NULLIF(p_data->>'rg_uf',''),
      NULLIF(p_data->>'gender',''),
      NULLIF(p_data->>'marital_status',''),
      NULLIF(p_data->>'nationality',''),
      NULLIF(p_data->>'natural_city',''),
      NULLIF(p_data->>'natural_uf',''),
      NULLIF(p_data->>'mother_name',''),
      NULLIF(p_data->>'father_name',''),
      NULLIF(p_data->>'profession',''),
      NULLIF(p_data->>'legal_rep_name',''),
      NULLIF(p_data->>'email',''),
      NULLIF(p_data->>'phone',''),
      NULLIF(p_data->>'phone_commercial',''),
      NULLIF(p_data->>'phone_home',''),
      COALESCE((p_data->>'phone_is_whatsapp')::boolean, false),
      COALESCE((p_data->>'phone_commercial_is_whatsapp')::boolean, false),
      COALESCE((p_data->>'phone_home_is_whatsapp')::boolean, false),
      NULLIF(p_data->>'zip_code',''),
      NULLIF(p_data->>'address',''),
      NULLIF(p_data->>'address_number',''),
      NULLIF(p_data->>'address_complement',''),
      NULLIF(p_data->>'neighborhood',''),
      NULLIF(p_data->>'city',''),
      NULLIF(p_data->>'state',''),
      NULLIF(p_data->>'bank_name',''),
      NULLIF(p_data->>'bank_account_type',''),
      NULLIF(p_data->>'pix_key_type',''),
      NULLIF(p_data->>'notes',''),
      NULLIF(p_data->>'birth_date','')::date,
      NULLIF(p_data->>'foundation_date','')::date,
      public.pii_encrypt(NULLIF(p_data->>'cpf','')),
      public.pii_bidx(NULLIF(p_data->>'cpf','')),
      public.pii_encrypt(NULLIF(p_data->>'rg','')),
      public.pii_encrypt(NULLIF(p_data->>'cnpj','')),
      public.pii_encrypt(NULLIF(p_data->>'ie','')),
      public.pii_encrypt(NULLIF(p_data->>'im','')),
      public.pii_encrypt(NULLIF(p_data->>'legal_rep_cpf','')),
      public.pii_encrypt(NULLIF(p_data->>'pis_nit','')),
      public.pii_encrypt(NULLIF(p_data->>'bank_agency','')),
      public.pii_encrypt(NULLIF(p_data->>'bank_account','')),
      public.pii_encrypt(NULLIF(p_data->>'pix_key',''))
    )
    RETURNING id INTO v_id;
  ELSE
    -- ---------------------------- UPDATE (edição) ----------------------------
    -- O formulário de edição envia o registro COMPLETO (campos vazios => NULL),
    -- então a substituição total dos campos gerenciados é a semântica correta e
    -- idêntica ao ClientForm atual. Campos NOT NULL usam COALESCE com o valor
    -- corrente para nunca cair em NULL caso a chave venha ausente.
    UPDATE public.clients SET
      full_name                    = COALESCE(NULLIF(p_data->>'full_name',''), full_name),
      tipo_pessoa                  = COALESCE(NULLIF(p_data->>'tipo_pessoa',''), tipo_pessoa),
      status                       = COALESCE(NULLIF(p_data->>'status',''), status),
      country                      = COALESCE(NULLIF(p_data->>'country',''), country),
      fantasy_name                 = NULLIF(p_data->>'fantasy_name',''),
      client_origin                = NULLIF(p_data->>'client_origin',''),
      gov_br_profile               = NULLIF(p_data->>'gov_br_profile',''),
      rg_issuer                    = NULLIF(p_data->>'rg_issuer',''),
      rg_uf                        = NULLIF(p_data->>'rg_uf',''),
      gender                       = NULLIF(p_data->>'gender',''),
      marital_status               = NULLIF(p_data->>'marital_status',''),
      nationality                  = NULLIF(p_data->>'nationality',''),
      natural_city                 = NULLIF(p_data->>'natural_city',''),
      natural_uf                   = NULLIF(p_data->>'natural_uf',''),
      mother_name                  = NULLIF(p_data->>'mother_name',''),
      father_name                  = NULLIF(p_data->>'father_name',''),
      profession                   = NULLIF(p_data->>'profession',''),
      legal_rep_name               = NULLIF(p_data->>'legal_rep_name',''),
      email                        = NULLIF(p_data->>'email',''),
      phone                        = NULLIF(p_data->>'phone',''),
      phone_commercial             = NULLIF(p_data->>'phone_commercial',''),
      phone_home                   = NULLIF(p_data->>'phone_home',''),
      phone_is_whatsapp            = COALESCE((p_data->>'phone_is_whatsapp')::boolean, phone_is_whatsapp),
      phone_commercial_is_whatsapp = COALESCE((p_data->>'phone_commercial_is_whatsapp')::boolean, phone_commercial_is_whatsapp),
      phone_home_is_whatsapp       = COALESCE((p_data->>'phone_home_is_whatsapp')::boolean, phone_home_is_whatsapp),
      zip_code                     = NULLIF(p_data->>'zip_code',''),
      address                      = NULLIF(p_data->>'address',''),
      address_number               = NULLIF(p_data->>'address_number',''),
      address_complement           = NULLIF(p_data->>'address_complement',''),
      neighborhood                 = NULLIF(p_data->>'neighborhood',''),
      city                         = NULLIF(p_data->>'city',''),
      state                        = NULLIF(p_data->>'state',''),
      bank_name                    = NULLIF(p_data->>'bank_name',''),
      bank_account_type            = NULLIF(p_data->>'bank_account_type',''),
      pix_key_type                 = NULLIF(p_data->>'pix_key_type',''),
      notes                        = NULLIF(p_data->>'notes',''),
      birth_date                   = NULLIF(p_data->>'birth_date','')::date,
      foundation_date              = NULLIF(p_data->>'foundation_date','')::date,
      -- PII: recifra a partir do texto decifrado que o form devolve; colunas de
      -- TEXTO ficam intocadas. Limpar um campo => enc/bidx NULL.
      cpf_enc                      = public.pii_encrypt(NULLIF(p_data->>'cpf','')),
      cpf_bidx                     = public.pii_bidx(NULLIF(p_data->>'cpf','')),
      rg_enc                       = public.pii_encrypt(NULLIF(p_data->>'rg','')),
      cnpj_enc                     = public.pii_encrypt(NULLIF(p_data->>'cnpj','')),
      ie_enc                       = public.pii_encrypt(NULLIF(p_data->>'ie','')),
      im_enc                       = public.pii_encrypt(NULLIF(p_data->>'im','')),
      legal_rep_cpf_enc            = public.pii_encrypt(NULLIF(p_data->>'legal_rep_cpf','')),
      pis_nit_enc                  = public.pii_encrypt(NULLIF(p_data->>'pis_nit','')),
      bank_agency_enc              = public.pii_encrypt(NULLIF(p_data->>'bank_agency','')),
      bank_account_enc             = public.pii_encrypt(NULLIF(p_data->>'bank_account','')),
      pix_key_enc                  = public.pii_encrypt(NULLIF(p_data->>'pix_key',''))
    WHERE id = p_id
    RETURNING id INTO v_id;

    IF v_id IS NULL THEN
      RAISE EXCEPTION 'cliente % não encontrado', p_id USING ERRCODE = 'P0002';
    END IF;
  END IF;

  RETURN v_id;
END;
$$;

-- Só authenticated (ClientForm e a tool via userClient com JWT do usuário).
-- Nenhum caminho de escrita de clients usa service_role.
REVOKE ALL ON FUNCTION public.save_client(uuid, jsonb) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.save_client(uuid, jsonb) TO authenticated;

COMMENT ON FUNCTION public.save_client(uuid, jsonb) IS
  'R-2 Fase 2C: escrita cifrada de clients. Cifra a PII server-side em *_enc + '
  'cpf_bidx; NUNCA toca as colunas de texto puro. p_id NULL=INSERT, senão UPDATE. '
  'Único caminho de escrita de cliente após o drop do texto (Passo 4).';

COMMIT;

-- ============================================================================
-- Fim 2C — Passo 1 + 2. Nada dropado. Próximo:
--   20260707170000_r2_phase2c_drop_plaintext_pii.sql (Passo 3 + 4), só depois
--   de app redeployado com save_client e cadastro tela+chat validados.
-- ============================================================================
