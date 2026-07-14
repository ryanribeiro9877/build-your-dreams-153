import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useMyWorkspace } from "@/hooks/useMyWorkspace";
import { HexagonLoader } from "@/components/HexagonLoader";
import { PlatformPresenceSync } from "@/components/PlatformPresenceSync";

/**
 * Papéis (role_templates.code) autorizados a ver o Dashboard.
 * Mesmo critério aplicado ao item de menu no JurisCloudOS, para manter
 * link e rota 1:1 — esconder o link sem guardar a rota não é controle de acesso.
 */
export const DASHBOARD_ROLE_CODES = ["tech", "socio"];

export function isDashboardRole(code: string | null | undefined): boolean {
  return DASHBOARD_ROLE_CODES.includes(code ?? "");
}

/**
 * Papéis (role_templates.code) autorizados a ver os dashboards operacional/prazos:
 * apenas sócio. Antes eram tech+socio (isDashboardRole); tech saiu de escopo aqui.
 */
export const SOCIO_ROLE_CODES = ["socio"];

export function isSocioRole(code: string | null | undefined): boolean {
  return SOCIO_ROLE_CODES.includes(code ?? "");
}

/**
 * Papéis (role_templates.code) autorizados a ver "Importar dados": apenas recepção.
 * Antes era tech (TechRoute); agora restrito à recepção (nenhum outro papel).
 */
export const RECEPCAO_ROLE_CODES = ["lider_recepcao", "recepcionista", "estagiaria_recepcao"];

export function isRecepcaoRole(code: string | null | undefined): boolean {
  return RECEPCAO_ROLE_CODES.includes(code ?? "");
}

/**
 * Route guard que restringe o Dashboard a tech + sócio.
 * O papel vem de profiles.role_template_id -> role_templates.code
 * (via useMyWorkspace), o mesmo mecanismo que decide acesso por papel no front.
 * Usuários fora de ('tech','socio') são redirecionados para a home (/sistema).
 */
export function DashboardRoute({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const { workspace, loading: wsLoading } = useMyWorkspace();

  if (authLoading) return <HexagonLoader variant="fullscreen" />;
  if (!user) return <Navigate to="/auth" replace />;
  // Aguarda o workspace (role_template) carregar antes de decidir o acesso.
  if (wsLoading) return <HexagonLoader variant="fullscreen" />;
  // Sem role_template resolvido (erro/ausente) => nega, por segurança.
  if (!isDashboardRole(workspace?.role_template?.code)) {
    return <Navigate to="/sistema" replace />;
  }

  return (
    <>
      <PlatformPresenceSync />
      {children}
    </>
  );
}

/**
 * Route guard que restringe rotas a sócio (Recepção & Jurídico, Prazos & Audiências).
 * Mesma estrutura do DashboardRoute: papel via useMyWorkspace (role_template.code);
 * fora de ('socio') redireciona para /sistema. Link e rota andam 1:1.
 */
export function SocioRoute({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const { workspace, loading: wsLoading } = useMyWorkspace();

  if (authLoading) return <HexagonLoader variant="fullscreen" />;
  if (!user) return <Navigate to="/auth" replace />;
  if (wsLoading) return <HexagonLoader variant="fullscreen" />;
  if (!isSocioRole(workspace?.role_template?.code)) {
    return <Navigate to="/sistema" replace />;
  }

  return (
    <>
      <PlatformPresenceSync />
      {children}
    </>
  );
}

/**
 * Route guard que restringe "Importar dados" à recepção.
 * Mesma estrutura do DashboardRoute: papel via useMyWorkspace (role_template.code);
 * fora dos papéis de recepção redireciona para /sistema. Link e rota andam 1:1.
 */
export function RecepcaoRoute({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const { workspace, loading: wsLoading } = useMyWorkspace();

  if (authLoading) return <HexagonLoader variant="fullscreen" />;
  if (!user) return <Navigate to="/auth" replace />;
  if (wsLoading) return <HexagonLoader variant="fullscreen" />;
  if (!isRecepcaoRole(workspace?.role_template?.code)) {
    return <Navigate to="/sistema" replace />;
  }

  return (
    <>
      <PlatformPresenceSync />
      {children}
    </>
  );
}
