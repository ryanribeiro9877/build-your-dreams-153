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

  const isAdmin = primaryRole === "admin";
  const isDirector = primaryRole === "director";
  const isManager = primaryRole === "manager";
  const canEdit = ["admin", "director", "manager", "lawyer", "receptionist", "financial", "marketing", "protocol", "calculator", "compliance"].includes(primaryRole);
  const canDelete = ["admin", "director"].includes(primaryRole);
  const canAccessAdmin = primaryRole === "admin";
  const canAccessFinancial = ["admin", "director", "manager", "financial"].includes(primaryRole);
  const canAccessClients = ["admin", "director", "manager", "lawyer", "receptionist", "intern"].includes(primaryRole);
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
    isReadOnly,
    isAdmin,
    isDirector,
    isManager,
  };
}
