-- ============================================================================
-- Correção de vulnerabilidades CRÍTICAS detectadas na auditoria 2026-07-21.
-- Reaplica cirurgicamente os Fixes 1, 2 e 3 da migração 20260601200000_security_fixes.sql
-- que nunca chegaram a produção (desync repo<->banco), PRESERVANDO o corpo atual
-- das funções em prod (evita reverter evoluções posteriores).
-- Aplicada em prod via MCP em 2026-07-21 (espelho para o repo ser fonte de verdade).
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- C1 (CRÍTICO): remover backdoor por e-mail hardcoded em is_master_admin().
-- Mantém os caminhos legítimos (director + role_template 'socio').
-- Verificado: admin@juridico.com já é director+socio, não perde acesso.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_master_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    public.has_role(_user_id, 'director')
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      JOIN public.role_templates rt ON rt.id = p.role_template_id
      WHERE p.user_id = _user_id
        AND rt.code = 'socio'
    );
$function$;

-- ----------------------------------------------------------------------------
-- C2 (CRÍTICO): ownership check em consume_tokens / consume_tokens_with_ref.
-- Sem o guard, qualquer chamador (consume_tokens_with_ref está grantada a
-- authenticated) debita tokens de outro usuário informando p_user_id alheio.
-- auth.uid() NULL (service_role) => guard é pulado (comportamento preservado
-- para chamadas server-side).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.consume_tokens(
  p_user_id uuid,
  p_amount integer,
  p_description text DEFAULT 'Mensagem enviada'::text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE current_balance integer;
BEGIN
  IF auth.uid() IS NOT NULL AND p_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'unauthorized: cannot consume tokens for another user';
  END IF;
  SELECT balance INTO current_balance FROM public.token_balances WHERE user_id = p_user_id FOR UPDATE;
  IF current_balance IS NULL OR current_balance < p_amount THEN RETURN false; END IF;
  UPDATE public.token_balances
  SET balance = balance - p_amount, total_consumed = total_consumed + p_amount, updated_at = now()
  WHERE user_id = p_user_id;
  INSERT INTO public.token_transactions (user_id, amount, transaction_type, description)
  VALUES (p_user_id, -p_amount, 'consumption', p_description);
  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.consume_tokens_with_ref(
  p_user_id uuid,
  p_amount integer,
  p_description text,
  p_reference_id text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE current_balance integer;
BEGIN
  IF auth.uid() IS NOT NULL AND p_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'unauthorized: cannot consume tokens for another user';
  END IF;
  SELECT balance INTO current_balance FROM public.token_balances WHERE user_id = p_user_id FOR UPDATE;
  IF current_balance IS NULL OR current_balance < p_amount THEN RETURN false; END IF;
  UPDATE public.token_balances
  SET balance = balance - p_amount, total_consumed = total_consumed + p_amount, updated_at = now()
  WHERE user_id = p_user_id;
  INSERT INTO public.token_transactions (user_id, amount, transaction_type, description, reference_id)
  VALUES (p_user_id, -p_amount, 'consumption', p_description, p_reference_id);
  RETURN true;
END;
$function$;

-- ----------------------------------------------------------------------------
-- C3 (CRÍTICO): idempotência real no nível do banco para o webhook de pagamento.
-- Verificado: 0 grupos duplicados de (reference_id, transaction_type) hoje.
-- NULLs em reference_id (consumos) são permitidos em duplicidade (default do PG).
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_token_transactions_reference'
  ) THEN
    ALTER TABLE public.token_transactions
      ADD CONSTRAINT uq_token_transactions_reference UNIQUE (reference_id, transaction_type);
  END IF;
END $$;

COMMIT;
