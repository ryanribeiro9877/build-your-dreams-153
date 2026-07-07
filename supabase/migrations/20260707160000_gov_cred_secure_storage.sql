-- ============================================================================
-- GOV-CRED (Card 3.4) — Credenciais Gov.br do cliente
--   Armazenamento seguro (cifra em repouso, chave dedicada) + acesso AUDITADO.
-- ----------------------------------------------------------------------------
-- Aprovação: Rodrigo aprovou; consentimento do cliente existe (registrado nesta
-- tabela). Este é o dado MAIS SENSÍVEL do sistema: a credencial Gov.br dá acesso
-- à identidade digital do cliente perante o Estado (inclui assinatura digital).
-- Por isso o desenho é mais rígido que o R-2 (PII de clients):
--
--   1. Tabela SEPARADA (client_gov_credentials), 1:1 com clients.
--   2. Cifra não-determinística (pgp_sym) com CHAVE DEDICADA `gov_cred_key`,
--      distinta da `pii_enc_key` do R-2 — comprometer uma chave não expõe a
--      outra base de segredos.
--   3. A senha em claro NUNCA sai por SELECT. As colunas `_enc` são bytea.
--      O ÚNICO caminho para a senha decifrada é a RPC AUDITADA
--      `reveal_gov_credential`, que GRAVA O LOG (quem/qual cliente/quando)
--      ANTES de decifrar e retornar.
--   4. 2FA preservado com o cliente: guardamos apenas a FLAG `tem_2fa` e, no
--      máximo, um código temporário EFÊMERO repassado pelo cliente na hora.
--      A seed TOTP NUNCA é armazenada (guardá-la anularia o 2FA e concentraria
--      a identidade digital inteira no banco).
--   5. Consentimento documentado e OBRIGATÓRIO para gravar credencial.
--
-- Todas as funções são SECURITY DEFINER com `set search_path = ''` (também
-- endereça o R-3). A cifra/decifra bruta (gov_encrypt/gov_decrypt) NÃO é
-- executável por anon/authenticated/service_role — a decifra real acontece
-- exclusivamente dentro da RPC auditada.
--
-- R-2 fica INTACTO: chave (`pii_enc_key`) e funções (`pii_encrypt`/`pii_decrypt`
-- /`pii_bidx`) são independentes e não são tocadas aqui.
--
-- >>> ESCOPO / EXECUÇÃO <<<
--   NÃO APLICAR DIRETO. Entregar esta migration para REVISÃO e aplicação pelo
--   Ryan (SQL Editor + schema_migrations, ou com o Ryan acompanhando). É a coisa
--   mais crítica do projeto.
--
-- >>> LGPD/DPA (pendência do Rodrigo) <<<
--   A partir desta migration o sistema passa a TRATAR credencial Gov.br. Isso
--   ELEVA a criticidade do tratamento e DEVE entrar no rol do DPA/LGPD.
--   Sinalizar para inclusão no DPA.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Chave DEDICADA no Vault (idempotente: só cria se não existir).
--    Distinta de `pii_enc_key` (R-2). Nunca no código/git.
-- ----------------------------------------------------------------------------
SELECT vault.create_secret(
  encode(extensions.gen_random_bytes(32), 'hex'),
  'gov_cred_key',
  'GOV-CRED: chave dedicada de cifra (pgp_sym) das credenciais Gov.br — distinta de pii_enc_key'
)
WHERE NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'gov_cred_key');

-- ----------------------------------------------------------------------------
-- 2. Primitivas de cifra com a chave dedicada (espelham o R-2, chave própria).
--    NÃO-determinística (pgp_sym_encrypt usa IV aleatório) => sem índice cego,
--    sem busca por credencial.
--    EXECUTE RESTRITO: revogado de todos. Ninguém decifra direto; a decifra só
--    acontece dentro da RPC auditada do §6 (que roda como owner, SECURITY
--    DEFINER, e por isso não depende destes grants).
-- ----------------------------------------------------------------------------

-- Cifra texto -> bytea. VOLATILE: IV aleatório a cada chamada.
CREATE OR REPLACE FUNCTION public.gov_encrypt(p_plain text)
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
   WHERE name = 'gov_cred_key';
  RETURN extensions.pgp_sym_encrypt(p_plain, v_key);
END;
$$;

-- Decifra bytea -> texto. STABLE: determinística dada a chave.
CREATE OR REPLACE FUNCTION public.gov_decrypt(p_cipher bytea)
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
   WHERE name = 'gov_cred_key';
  RETURN extensions.pgp_sym_decrypt(p_cipher, v_key);
END;
$$;

-- No Supabase, DEFAULT PRIVILEGES concedem EXECUTE a anon/authenticated/
-- service_role automaticamente. Revogamos de TODOS e NÃO concedemos a ninguém:
-- a única forma de obter a senha em claro é a RPC auditada (que executa como
-- owner). Isto impede que um ciphertext vazado seja transformado em texto puro
-- por qualquer papel da aplicação.
REVOKE ALL ON FUNCTION public.gov_encrypt(text)  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.gov_decrypt(bytea) FROM PUBLIC, anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2b. Predicado "só sócio" (para DELETE e para SELECT do log de auditoria).
--     is_recepcao_or_socio() já cobre sócio + as 3 recepcionistas
--     (role_templates.code IN 'socio','lider_recepcao','recepcionista'); aqui
--     precisamos do subconjunto só-sócio. SECURITY DEFINER + search_path=''.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_socio()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.role_templates rt ON rt.id = p.role_template_id
    WHERE p.user_id = auth.uid()
      AND rt.code = 'socio'
  );
$$;
REVOKE ALL ON FUNCTION public.is_socio() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.is_socio() TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. Tabela SEPARADA client_gov_credentials (1:1 com clients).
--    usuário/senha SÓ em bytea cifrado. `codigo_2fa_temporario` é EFÊMERO
--    (código repassado pelo cliente na hora; expira em minutos) — NUNCA é a
--    seed TOTP; a app deve limpá-lo após o uso.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.client_gov_credentials (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id                uuid NOT NULL UNIQUE REFERENCES public.clients(id) ON DELETE CASCADE,
  gov_usuario_enc          bytea,        -- usuário/login Gov.br, cifrado (gov_cred_key)
  gov_senha_enc            bytea,        -- senha Gov.br, cifrada (gov_cred_key)
  tem_2fa                  boolean NOT NULL DEFAULT false,
  codigo_2fa_temporario    text,         -- EFÊMERO: código repassado na hora; NÃO é seed. Limpar após uso.
  status_acesso            text DEFAULT 'pendente'
                             CHECK (status_acesso IN ('valido','invalido','pendente','bloqueado')),
  consentimento_registrado boolean NOT NULL DEFAULT false,
  consentimento_em         timestamptz,
  consentimento_versao     text,
  created_by               uuid,
  updated_by               uuid,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),

  -- Regra dura de consentimento: NÃO gravar material de credencial sem
  -- consentimento_registrado = true. Vale em QUALQUER caminho de escrita
  -- (RPC ou, defensivamente, INSERT/UPDATE direto).
  CONSTRAINT chk_gov_cred_consentimento CHECK (
    (gov_usuario_enc IS NULL AND gov_senha_enc IS NULL)
    OR consentimento_registrado = true
  )
);

COMMENT ON TABLE public.client_gov_credentials IS
  'Credencial Gov.br do cliente (1:1). Senha/usuário só em bytea cifrado (gov_cred_key). '
  'Senha em claro só via public.reveal_gov_credential (auditada). Seed TOTP NUNCA é armazenada. '
  'DADO no rol do DPA/LGPD (pendência Rodrigo).';
COMMENT ON COLUMN public.client_gov_credentials.codigo_2fa_temporario IS
  'Código 2FA EFÊMERO repassado pelo cliente na hora (expira em minutos). NÃO é a seed TOTP. Limpar após o uso.';

-- updated_at automático (reusa o helper compartilhado do projeto).
DROP TRIGGER IF EXISTS trg_client_gov_credentials_updated_at ON public.client_gov_credentials;
CREATE TRIGGER trg_client_gov_credentials_updated_at
  BEFORE UPDATE ON public.client_gov_credentials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 4. RLS da tabela: sócio + recepção (as 3 recepcionistas caem em
--    is_recepcao_or_socio()). DELETE só sócio.
--    IMPORTANTE: a senha decifrada NÃO sai por SELECT — as colunas são bytea;
--    ninguém lê a senha por `select`. Só a RPC do §6 revela.
-- ----------------------------------------------------------------------------
ALTER TABLE public.client_gov_credentials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gov_cred select recepcao/socio" ON public.client_gov_credentials;
CREATE POLICY "gov_cred select recepcao/socio" ON public.client_gov_credentials
  FOR SELECT TO authenticated
  USING (public.is_recepcao_or_socio());

DROP POLICY IF EXISTS "gov_cred insert recepcao/socio" ON public.client_gov_credentials;
CREATE POLICY "gov_cred insert recepcao/socio" ON public.client_gov_credentials
  FOR INSERT TO authenticated
  WITH CHECK (public.is_recepcao_or_socio());

DROP POLICY IF EXISTS "gov_cred update recepcao/socio" ON public.client_gov_credentials;
CREATE POLICY "gov_cred update recepcao/socio" ON public.client_gov_credentials
  FOR UPDATE TO authenticated
  USING (public.is_recepcao_or_socio())
  WITH CHECK (public.is_recepcao_or_socio());

DROP POLICY IF EXISTS "gov_cred delete socio" ON public.client_gov_credentials;
CREATE POLICY "gov_cred delete socio" ON public.client_gov_credentials
  FOR DELETE TO authenticated
  USING (public.is_socio());

-- ----------------------------------------------------------------------------
-- 5. Log de auditoria de acesso — APPEND-ONLY.
--    Sem UPDATE/DELETE (nem para sócio): log de acesso não se apaga.
--    RLS: SELECT só para sócio (auditoria). NÃO há policy de INSERT/UPDATE/
--    DELETE => nenhum papel da app escreve/apaga aqui; o INSERT acontece
--    exclusivamente dentro da RPC do §6 (SECURITY DEFINER, roda como owner e
--    bypassa RLS). Assim o append-only é garantido pela própria ausência de
--    policies de mutação.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gov_credential_access_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   uuid NOT NULL,
  accessed_by uuid NOT NULL,             -- auth.uid() de quem revelou
  accessed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gov_cred_log_client ON public.gov_credential_access_log (client_id, accessed_at DESC);
CREATE INDEX IF NOT EXISTS idx_gov_cred_log_actor  ON public.gov_credential_access_log (accessed_by, accessed_at DESC);

COMMENT ON TABLE public.gov_credential_access_log IS
  'Log APPEND-ONLY de revelações de credencial Gov.br. Uma linha por chamada de '
  'reveal_gov_credential, gravada ANTES de retornar a senha. Sem UPDATE/DELETE.';

ALTER TABLE public.gov_credential_access_log ENABLE ROW LEVEL SECURITY;

-- Só sócio lê o log (auditoria). Sem policies de INSERT/UPDATE/DELETE => o log
-- é imutável para toda a aplicação; só a RPC definer insere.
DROP POLICY IF EXISTS "gov_cred_log select socio" ON public.gov_credential_access_log;
CREATE POLICY "gov_cred_log select socio" ON public.gov_credential_access_log
  FOR SELECT TO authenticated
  USING (public.is_socio());

-- ----------------------------------------------------------------------------
-- 6. RPC de revelação AUDITADA — o coração do controle.
--    ÚNICO caminho para a senha em claro:
--      (a) checa o papel do chamador (is_recepcao_or_socio) — senão RAISE;
--      (b) GRAVA O LOG (quem/qual cliente/quando) ANTES de decifrar;
--      (c) só então decifra (gov_decrypt) e retorna usuário + senha.
--    SECURITY DEFINER + search_path='' => roda como owner (pode inserir no log
--    e decifrar sem grants diretos nas primitivas).
--    Observação: auth.uid() é NOT NULL no log; chamadas sem sessão (service_role
--    tem uid NULL) já são barradas em (a) e nunca chegam ao INSERT.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reveal_gov_credential(p_client_id uuid)
RETURNS TABLE (gov_usuario text, gov_senha text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- (a) papel
  IF NOT public.is_recepcao_or_socio() THEN
    RAISE EXCEPTION 'Acesso negado: apenas recepção ou sócio podem revelar credenciais Gov.br'
      USING ERRCODE = '42501';
  END IF;

  -- (b) LOG ANTES de retornar (uma linha por chamada, sempre)
  INSERT INTO public.gov_credential_access_log (client_id, accessed_by)
  VALUES (p_client_id, auth.uid());

  -- (c) só então decifra e retorna
  RETURN QUERY
    SELECT public.gov_decrypt(c.gov_usuario_enc),
           public.gov_decrypt(c.gov_senha_enc)
      FROM public.client_gov_credentials c
     WHERE c.client_id = p_client_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reveal_gov_credential(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.reveal_gov_credential(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 7. RPC de ESCRITA (cadastro/edição da credencial).
--    Necessária porque a tabela NÃO tem colunas de texto puro (nada em claro,
--    nunca) — logo a app não consegue popular os bytea `_enc` por INSERT direto
--    via PostgREST. Esta RPC cifra server-side com a chave dedicada e é o
--    equivalente, para GOV-CRED, do trigger de cifra do R-2.
--      - checa papel (is_recepcao_or_socio) — senão RAISE;
--      - EXIGE consentimento (senão RAISE); grava consentimento_em/versão;
--      - cifra usuário/senha com gov_encrypt (owner);
--      - upsert 1:1 por client_id. Em edição, campos de credencial deixados
--        NULL preservam o valor existente (não apagam a senha guardada).
--    Nunca recebe nem armazena seed TOTP.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_gov_credential(
  p_client_id            uuid,
  p_usuario              text    DEFAULT NULL,
  p_senha                text    DEFAULT NULL,
  p_tem_2fa              boolean DEFAULT false,
  p_status_acesso        text    DEFAULT 'pendente',
  p_consentimento        boolean DEFAULT false,
  p_consentimento_versao text    DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public.is_recepcao_or_socio() THEN
    RAISE EXCEPTION 'Acesso negado: apenas recepção ou sócio podem gravar credenciais Gov.br'
      USING ERRCODE = '42501';
  END IF;

  IF NOT COALESCE(p_consentimento, false) THEN
    RAISE EXCEPTION 'Consentimento é obrigatório para gravar a credencial Gov.br'
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.client_gov_credentials AS c (
    client_id, gov_usuario_enc, gov_senha_enc, tem_2fa, status_acesso,
    consentimento_registrado, consentimento_em, consentimento_versao,
    created_by, updated_by
  )
  VALUES (
    p_client_id,
    public.gov_encrypt(p_usuario),
    public.gov_encrypt(p_senha),
    COALESCE(p_tem_2fa, false),
    COALESCE(p_status_acesso, 'pendente'),
    true, now(), p_consentimento_versao,
    auth.uid(), auth.uid()
  )
  ON CONFLICT (client_id) DO UPDATE SET
    -- credencial deixada NULL na edição => preserva o valor guardado
    gov_usuario_enc          = CASE WHEN p_usuario IS NULL THEN c.gov_usuario_enc
                                    ELSE public.gov_encrypt(p_usuario) END,
    gov_senha_enc            = CASE WHEN p_senha   IS NULL THEN c.gov_senha_enc
                                    ELSE public.gov_encrypt(p_senha)   END,
    tem_2fa                  = COALESCE(p_tem_2fa, c.tem_2fa),
    status_acesso            = COALESCE(p_status_acesso, c.status_acesso),
    consentimento_registrado = true,
    consentimento_em         = now(),
    consentimento_versao     = COALESCE(p_consentimento_versao, c.consentimento_versao),
    updated_by               = auth.uid()
  RETURNING c.id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_gov_credential(uuid, text, text, boolean, text, boolean, text)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.save_gov_credential(uuid, text, text, boolean, text, boolean, text)
  TO authenticated;

COMMIT;

-- ============================================================================
-- Critério de aceite (§8):
--   [x] gov_cred_key no Vault (≠ pii_enc_key); gov_encrypt/decrypt com essa
--       chave; EXECUTE revogado de todos (decifra só na RPC auditada).
--   [x] client_gov_credentials: usuário/senha só em bytea cifrado; RLS por
--       sócio+recepção; senha nunca sai por SELECT.
--   [x] reveal_gov_credential: único caminho p/ a senha em claro; grava o log
--       ANTES de retornar; nega quem não tem papel.
--   [x] gov_credential_access_log: append-only (sem UPDATE/DELETE); registra
--       cada revelação (quem/cliente/quando); SELECT só sócio.
--   [x] tem_2fa como flag; seed TOTP NÃO armazenada; código 2FA só efêmero.
--   [x] Consentimento registrado e OBRIGATÓRIO (CHECK + RPC) p/ gravar credencial.
--   [x] R-2 intacto (chave/funções pii_* independentes, não tocadas).
--
-- Pendências sinalizadas:
--   - DPA/LGPD: incluir "credencial Gov.br" no rol de tratamento (Rodrigo).
--   - Front (aba Gov.br, §7): botão "Revelar credencial" -> reveal_gov_credential
--     (gera log; exibir mascarado, revelar sob ação, não persistir no DOM) e
--     formulário de cadastro/edição -> save_gov_credential (com aceite de
--     consentimento + versão). Deixar explícito na UI que revelar FICA
--     REGISTRADO. Fatia seguinte, após o Ryan aplicar esta migration.
-- ============================================================================
