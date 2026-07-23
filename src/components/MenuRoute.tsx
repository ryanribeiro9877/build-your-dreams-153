import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useMyWorkspace } from "@/hooks/useMyWorkspace";
import { useMenuAccess, type MenuKey } from "@/hooks/useMenuAccess";
import { HexagonLoader } from "@/components/HexagonLoader";
import { PlatformPresenceSync } from "@/components/PlatformPresenceSync";
import { RequireActivation } from "@/components/RequireActivation";

/**
 * Guard de rota da "chave-mestra": libera a rota se canSeeMenu(menuKey) — admin vê
 * tudo (curto-circuito), demais seguem default do papel + override do banco.
 * Substitui DashboardRoute/SocioRoute/TechOnlyRoute para manter link, rota e menu
 * 1:1 (esconder o link sem guardar a rota não é controle de acesso). O gate de
 * DADOS de cada tela é independente (segue por papel até ser plugado no grant).
 */
export function MenuRoute({ menuKey, children }: { menuKey: MenuKey; children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const { loading: wsLoading } = useMyWorkspace();
  const { canSeeMenu, loading: menuLoading } = useMenuAccess();

  if (authLoading) return <HexagonLoader variant="fullscreen" />;
  if (!user) return <Navigate to="/auth" replace />;
  if (wsLoading || menuLoading) return <HexagonLoader variant="fullscreen" />;
  if (!canSeeMenu(menuKey)) return <Navigate to="/sistema" replace />;

  return (
    <RequireActivation>
      <PlatformPresenceSync />
      {children}
    </RequireActivation>
  );
}
