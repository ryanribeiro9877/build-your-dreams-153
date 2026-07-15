import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSupabaseQuery } from "@/hooks/useSupabaseQuery";

/**
 * useProfileActivation — gate de ativação de convite.
 *
 * Um convidado abre o link de recovery e GANHA uma sessão autenticada antes de
 * definir a senha. Ele só deve "existir"/usar o sistema depois de ativar
 * (profiles.activation_status = 'ativo', marcado por activate_own_profile()).
 *
 * Este hook lê is_own_profile_active() (RPC SECURITY DEFINER) do usuário logado:
 *   - active === true   -> ativo, libera o app
 *   - active === false  -> pendente, bloqueia (guard redireciona p/ /definir-senha)
 *   - active === null   -> ainda carregando OU erro de RPC. Por segurança de
 *     disponibilidade (não trancar a equipe inteira num soluço da RPC), o guard
 *     só bloqueia no `=== false` explícito; null nunca bloqueia.
 *
 * Sem Realtime de propósito: é uma checagem pontual por rota; evita canal
 * duplicado quando várias guards montam. Após ativar, a navegação p/ /sistema
 * remonta a guard e refaz o fetch (retorna true).
 */
export function useProfileActivation() {
  const { user, loading: authLoading } = useAuth();

  const enabled = !authLoading && !!user;

  const { data, loading } = useSupabaseQuery<boolean>({
    queryKey: user ? `profile-activation-${user.id}` : "profile-activation-anon",
    fetcher: async () => {
      const { data, error } = await supabase.rpc("is_own_profile_active");
      if (error) throw new Error(error.message);
      return data === true;
    },
    enabled,
  });

  return {
    // null enquanto (auth) carrega, quando desabilitado ou em erro de RPC.
    active: enabled ? data : null,
    loading: enabled ? loading : false,
  };
}
