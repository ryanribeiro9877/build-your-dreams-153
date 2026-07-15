-- ============================================================================
-- FIX-GATE-ATIVACAO-CONVITE — espelho (repo <-> banco)
-- ----------------------------------------------------------------------------
-- Contexto: ao abrir o link de convite (type=recovery) o convidado GANHA uma
-- sessao autenticada antes de definir a senha. Ele so deve "existir" na area de
-- usuarios e usar o sistema DEPOIS de definir a senha. A solucao e um gate de
-- ativacao no profile (nao mexe no fluxo de auth createUser+recovery, que matou
-- o otp_expired).
--
-- O gate (coluna + funcoes + backfill) foi aplicado direto no banco via MCP
-- (migracao add_profile_activation_gate) ANTES deste espelho. Este arquivo
-- apenas RE-DECLARA os objetos de forma IDEMPOTENTE para o repo bater com o
-- banco. IMPORTANTE: NAO ha backfill aqui de proposito — re-rodar um
-- "UPDATE ... SET activation_status='ativo'" agora marcaria como ativo um
-- convidado que ainda esta pendente. O backfill dos 8 usuarios pre-existentes
-- ja rodou uma unica vez na migracao original.
-- ============================================================================

-- Coluna do gate (ja existe; IF NOT EXISTS = no-op no banco atual).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS activation_status text NOT NULL DEFAULT 'pendente';
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS activated_at timestamptz;

-- Marca o proprio profile como ativo (chamada pela tela /definir-senha apos
-- salvar a senha). SECURITY DEFINER; so mexe na propria linha (auth.uid()).
CREATE OR REPLACE FUNCTION public.activate_own_profile()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.profiles
  set activation_status = 'ativo',
      activated_at = now(),
      updated_at = now()
  where user_id = auth.uid()
    and activation_status <> 'ativo';
end;
$function$;

-- Booleano: o usuario logado esta ativo? Usado pelo guard (RequireActivation).
-- Sem profile => false (bloqueia).
CREATE OR REPLACE FUNCTION public.is_own_profile_active()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(
    (select activation_status = 'ativo' from public.profiles where user_id = auth.uid()),
    false
  );
$function$;

-- AJUSTE 1: o profile do convidado nasce 'pendente' EXPLICITAMENTE no ramo
-- INSERT (convidado novo). Identico ao default da coluna — nao muda
-- comportamento. O ramo UPDATE (profile ja existente) NAO toca
-- activation_status, para nao reverter quem ja e 'ativo' num reconvite.
CREATE OR REPLACE FUNCTION public.apply_employee_profile(p_user_id uuid, p_full_name text, p_role_template_id uuid, p_is_estagiario boolean, p_app_role app_role)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_provisioned_count INTEGER;
BEGIN
  UPDATE public.profiles SET display_name = p_full_name, full_name = p_full_name, role_template_id = p_role_template_id,
    is_estagiario = COALESCE(p_is_estagiario, false), updated_at = now() WHERE user_id = p_user_id;
  IF NOT FOUND THEN
    INSERT INTO public.profiles (user_id, display_name, full_name, role_template_id, is_estagiario, activation_status)
    VALUES (p_user_id, p_full_name, p_full_name, p_role_template_id, COALESCE(p_is_estagiario, false), 'pendente');
  END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (p_user_id, p_app_role) ON CONFLICT (user_id, role) DO NOTHING;
  SELECT COUNT(*) INTO v_provisioned_count FROM public.provision_user_agents(p_user_id);
END; $function$;
