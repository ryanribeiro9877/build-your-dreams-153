import { useAuth } from "@/hooks/useAuth";
import { getRoleVisibility, type RoleVisibility } from "@/config/roleVisibility";

export function usePermissions() {
  const { userRoles } = useAuth();

  const primaryRole = userRoles[0] || "intern";
  const visibility = getRoleVisibility(primaryRole);

  const canAccessDepartment = (deptId: string) => {
    if (visibility.departments === "*") return true;
    return visibility.departments.includes(deptId);
  };

  const canSeeCommand = (cmd: string) => {
    return visibility.commands.includes(cmd);
  };

  const canSeeMenuItem = (item: string) => {
    return visibility.menuItems.includes(item);
  };

  const canSeeAgentRole = (role: string) => {
    if (visibility.agentRolesVisible === "*") return true;
    return (visibility.agentRolesVisible as string[]).includes(role);
  };

  // "É admin" = POSSUI o papel admin — não depende da ordem em que os papéis
  // são retornados. Um usuário admin+director (ex.: o sócio) tem primaryRole
  // potencialmente "director" (userRoles[0]), então checar posse do papel é o
  // correto para liberar as ações exclusivas do admin.
  const isAdmin = userRoles.includes("admin");
  const isTech = userRoles.includes("tech");
  const isDirector = primaryRole === "director";
  const isManager = primaryRole === "manager";
  const canEdit = ["admin", "director", "manager", "lawyer", "receptionist", "financial", "marketing", "protocol", "calculator", "compliance"].includes(primaryRole);
  const canDelete = ["admin", "director"].includes(primaryRole);
  const canAccessAdmin = userRoles.includes("admin");
  const canAccessFinancial = ["admin", "director", "manager", "financial"].includes(primaryRole);
  const canAccessClients = ["admin", "receptionist"].includes(primaryRole);
  const canEditAgents = isTech;
  const canManageCrons = isTech;
  const isReadOnly = !canEdit;
  const roleLabel = visibility.label;

  return {
    primaryRole,
    roleLabel,
    visibility,
    canAccessDepartment,
    canSeeCommand,
    canSeeMenuItem,
    canSeeAgentRole,
    canEdit,
    canDelete,
    canAccessAdmin,
    canAccessFinancial,
    canAccessClients,
    canEditAgents,
    canManageCrons,
    isReadOnly,
    isAdmin,
    isTech,
    isDirector,
    isManager,
  };
}
