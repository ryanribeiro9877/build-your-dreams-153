import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { useMyWorkspace } from "@/hooks/useMyWorkspace";
import { useSupabaseQuery } from "@/hooks/useSupabaseQuery";
import { supabase } from "@/integrations/supabase/client";
import { isDashboardRole, isSocioRole, isTechRole, isRecepcaoRole } from "@/components/DashboardRoute";

// ─── Admin chave-mestra: fonte ÚNICA de acesso a menu ────────────────────────
// Regra: papel ADMIN (app_role) → vê todos os menus, sempre (curto-circuito).
// Demais → default do papel atual + overrides de get_my_menu_overrides()
// (grant adiciona, revoke remove; o override vence o default). Cacheado por sessão.
// Este hook substitui os gates hardcoded espalhados (canAccessClients, ROLE_MAP,
// isDashboardRole no item de menu, etc.) para MENU, GUARDS de rota e o gate
// in-page de Clientes ficarem 1:1 (esconder o link sem guardar a rota não protege).

/** Chaves canônicas de menu (minúsculas, EXATAS — casam com user_menu_permissions.menu_key). */
export const MENU_KEYS = [
  "dashboard", "clientes", "recepcao_juridico", "prazos_audiencias", "agenda",
  "tarefas", "kanban", "kpis", "dashboard_ia", "administracao", "configuracoes",
] as const;
export type MenuKey = typeof MENU_KEYS[number];

/** Rótulo legível de cada chave (para a tela de permissões). */
export const MENU_KEY_LABELS: Record<MenuKey, string> = {
  dashboard: "Dashboard",
  clientes: "Clientes",
  recepcao_juridico: "Recepção & Jurídico",
  prazos_audiencias: "Prazos & Audiências",
  agenda: "Agenda",
  tarefas: "Tarefas",
  kanban: "Kanban",
  kpis: "KPIs Eficiência",
  dashboard_ia: "Dashboard IA",
  administracao: "Administração",
  configuracoes: "Configurações",
};

// Menus cujo gate de DADOS já honra has_menu_grant no banco (conceder o menu já
// libera os dados). Os demais mostram a TELA, mas os dados seguem por papel — por
// isso ganham o badge "acesso a dados pode exigir liberação adicional" (DEF-3:
// os gates de dados são plugados um a um, conforme a necessidade real).
export const DATA_GATE_READY: ReadonlySet<string> = new Set<string>(["clientes"]);

interface MenuOverrideRow { menu_key: string; granted: boolean; }

export interface MenuAccess {
  canSeeMenu: (key: MenuKey) => boolean;
  isAdmin: boolean;
  overrides: Partial<Record<MenuKey, boolean>>;
  defaults: Record<MenuKey, boolean>;
  loading: boolean;
  refresh: () => void;
}

export function useMenuAccess(): MenuAccess {
  const { user, userRoles, hasRole } = useAuth();
  const { canSeeMenuItem, canAccessClients, canAccessAdmin } = usePermissions();
  const { workspace } = useMyWorkspace();
  const code = workspace?.role_template?.code ?? null;
  const isAdmin = userRoles.includes("admin");

  const { data: overrideRows, loading, refetch } = useSupabaseQuery<MenuOverrideRow[]>({
    queryKey: `menu-overrides-${user?.id ?? "anon"}`,
    enabled: !!user,
    fetcher: async () => {
      const { data, error } = await supabase.rpc("get_my_menu_overrides");
      if (error) throw error;
      return (data as unknown as MenuOverrideRow[]) ?? [];
    },
    // Reflete em tempo real quando o admin altera as permissões deste usuário.
    realtime: [{ table: "user_menu_permissions" }],
  });

  const overrides: Partial<Record<MenuKey, boolean>> = {};
  for (const r of overrideRows ?? []) {
    if ((MENU_KEYS as readonly string[]).includes(r.menu_key)) {
      overrides[r.menu_key as MenuKey] = r.granted;
    }
  }

  const isAdv = (code ?? "").startsWith("adv_");
  // Default do PAPEL atual, por chave — reproduz fielmente os gates de hoje.
  const defaults: Record<MenuKey, boolean> = {
    dashboard: isDashboardRole(code) && !hasRole("tech"),
    clientes: canSeeMenuItem("clientes") && canAccessClients,
    recepcao_juridico: isSocioRole(code),
    prazos_audiencias: isSocioRole(code),
    agenda: canSeeMenuItem("agenda"),
    // tarefas/kanban não tinham item de sidebar; default = papéis operacionais
    // internos (recepção, sócio, advogados). Admin/override refinam.
    tarefas: isRecepcaoRole(code) || isSocioRole(code) || isAdv,
    kanban: isRecepcaoRole(code) || isSocioRole(code) || isAdv,
    kpis: canSeeMenuItem("eficiencia") && !hasRole("tech"),
    dashboard_ia: isTechRole(code),
    administracao: canSeeMenuItem("admin") && canAccessAdmin,
    configuracoes: true, // grupo sempre visível (Meus Tokens é universal)
  };

  const canSeeMenu = (key: MenuKey): boolean => {
    if (isAdmin) return true; // curto-circuito da chave-mestra
    const ov = overrides[key];
    return ov !== undefined ? ov : defaults[key];
  };

  return { canSeeMenu, isAdmin, overrides, defaults, loading, refresh: refetch };
}
