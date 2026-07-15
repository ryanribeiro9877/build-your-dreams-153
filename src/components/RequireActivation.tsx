import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useProfileActivation } from "@/hooks/useProfileActivation";
import { HexagonLoader } from "@/components/HexagonLoader";

/**
 * Gate de ativação, usado DENTRO de cada route guard (depois de já validado
 * que há usuário autenticado). Um convidado que abriu o link de recovery tem
 * sessão, mas ainda está 'pendente' até salvar a senha — nesse estado o app
 * inteiro fica bloqueado e ele é levado para /definir-senha, independente da
 * URL que tentar acessar.
 *
 * - active === false  -> pendente: redireciona para /definir-senha.
 * - active === true   -> ativo: renderiza normalmente.
 * - active === null / loading -> ainda decidindo (ou erro de RPC): mostra loader
 *   enquanto carrega e NÃO bloqueia em null (fail-open p/ não trancar a equipe
 *   num soluço da RPC). Só o `false` explícito bloqueia.
 *
 * Cuidado com corrida: só decide depois de loading=false (evita piscar o app
 * antes do bloqueio).
 */
export function RequireActivation({ children }: { children: ReactNode }) {
  const { active, loading } = useProfileActivation();

  if (loading) return <HexagonLoader variant="fullscreen" />;
  if (active === false) return <Navigate to="/definir-senha" replace />;

  return <>{children}</>;
}
