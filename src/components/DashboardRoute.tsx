import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useMyWorkspace } from "@/hooks/useMyWorkspace";
import { HexagonLoader } from "@/components/HexagonLoader";
import { PlatformPresenceSync } from "@/components/PlatformPresenceSync";
import { RequireActivation } from "@/components/RequireActivation";

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
 * Papéis (role_templates.code) autorizados a ver o Dashboard IA: exclusivo
 * do tech. Antes era tech+socio (isDashboardRole); sócio saiu de escopo aqui
 * (dado operacional de custo/uso de LLM, não é do sócio).
 */
export const TECH_ROLE_CODES = ["tech"];

export function isTechRole(code: string | null | undefined): boolean {
  return TECH_ROLE_CODES.includes(code ?? "");
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
    <RequireActivation>
      <PlatformPresenceSync />
      {children}
    </RequireActivation>
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
    <RequireActivation>
      <PlatformPresenceSync />
      {children}
    </RequireActivation>
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
    <RequireActivation>
      <PlatformPresenceSync />
      {children}
    </RequireActivation>
  );
}

/**
 * Papéis que a função `is_socio_or_advogado()` do banco cobre: sócio + qualquer
 * template cujo code começa com `adv_` (adv_previdenciario, adv_confeccao_geral,
 * adv_protocolo, adv_audiencia_execucao). `audiencia_externa` NÃO entra — o code
 * não é adv_*, e o banco também o deixa de fora.
 */
export function isSocioOuAdvogadoRole(code: string | null | undefined): boolean {
  const c = code ?? "";
  return c === "socio" || c.startsWith("adv_");
}

/**
 * Route guard da tela de Execuções (Motor 3 · Card 8).
 *
 * Espelha o gate REAL das tabelas e RPCs que a tela consome — a RLS de
 * `execucoes`/`execucao_eventos` e as RPCs iniciar_execucao/atualizar_fase_execucao/
 * consultar_execucoes/registrar_evento_processual exigem:
 *     is_socio_or_advogado() OR has_role(auth.uid(),'admin')
 * A RECEPÇÃO é deliberadamente barrada (o banco devolve 42501 — provado em
 * dry-run), então o link também fica escondido para ela: rota e menu 1:1.
 */
export function JuridicoRoute({ children }: { children: ReactNode }) {
  const { user, userRoles, loading: authLoading } = useAuth();
  const { workspace, loading: wsLoading } = useMyWorkspace();

  if (authLoading) return <HexagonLoader variant="fullscreen" />;
  if (!user) return <Navigate to="/auth" replace />;
  if (wsLoading) return <HexagonLoader variant="fullscreen" />;

  const liberado = isSocioOuAdvogadoRole(workspace?.role_template?.code)
    || userRoles.includes("admin");
  if (!liberado) return <Navigate to="/sistema" replace />;

  return (
    <RequireActivation>
      <PlatformPresenceSync />
      {children}
    </RequireActivation>
  );
}

/**
 * Route guard das telas do Motor 1 (Campanhas de ligação).
 *
 * Espelha EXATAMENTE o gate das RPCs que a tela consome (criar_campanha,
 * registrar_ligacao, kpi_ligacoes):
 *     is_recepcao_or_socio() OR has_role(auth.uid(),'admin')
 * e `is_recepcao_or_socio` no banco cobre socio + os três papéis de recepção.
 *
 * Deliberadamente NÃO é o RecepcaoRoute: aquele exclui sócio e admin, e um front
 * mais restrito que o backend foi exatamente o bug B10 (o admin via o menu, abria
 * a tela e batia em bloqueio, contradizendo a chave-mestra).
 */
export function RecepcaoOuSocioRoute({ children }: { children: ReactNode }) {
  const { user, userRoles, loading: authLoading } = useAuth();
  const { workspace, loading: wsLoading } = useMyWorkspace();

  if (authLoading) return <HexagonLoader variant="fullscreen" />;
  if (!user) return <Navigate to="/auth" replace />;
  if (wsLoading) return <HexagonLoader variant="fullscreen" />;

  const code = workspace?.role_template?.code;
  const liberado = isRecepcaoRole(code) || isSocioRole(code) || userRoles.includes("admin");
  if (!liberado) return <Navigate to="/sistema" replace />;

  return (
    <RequireActivation>
      <PlatformPresenceSync />
      {children}
    </RequireActivation>
  );
}

/**
 * Route guard que restringe o Dashboard IA ao tech (role_templates.code =
 * 'tech'). Fora disso (inclusive sócio/master) => /sistema. Link e rota
 * andam 1:1 com o item de menu.
 */
export function TechOnlyRoute({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const { workspace, loading: wsLoading } = useMyWorkspace();

  if (authLoading) return <HexagonLoader variant="fullscreen" />;
  if (!user) return <Navigate to="/auth" replace />;
  if (wsLoading) return <HexagonLoader variant="fullscreen" />;
  if (!isTechRole(workspace?.role_template?.code)) {
    return <Navigate to="/sistema" replace />;
  }

  return (
    <RequireActivation>
      <PlatformPresenceSync />
      {children}
    </RequireActivation>
  );
}
