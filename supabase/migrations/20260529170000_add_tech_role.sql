-- ============================================================================
-- V16 (1/2) — Adiciona o valor 'tech' ao enum app_role.
-- Postgres não permite usar um valor de enum recém-criado na mesma transação,
-- por isso esta migration roda separada da parte 2/2.
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = 'public.app_role'::regtype AND enumlabel = 'tech') THEN
    ALTER TYPE public.app_role ADD VALUE 'tech';
  END IF;
END$$;
