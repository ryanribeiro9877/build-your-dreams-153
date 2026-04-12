import { useAuth } from "@/hooks/useAuth";

// Maps user roles to allowed departments and capabilities
const ROLE_PERMISSIONS: Record<string, {
  departments: string[] | "*";
  canEdit: boolean;
  canDelete: boolean;
  canAccessAdmin: boolean;
  canAccessFinancial: boolean;
  canAccessClients: boolean;
  label: string;
}> = {
  admin:        { departments: "*", canEdit: true, canDelete: true, canAccessAdmin: true, canAccessFinancial: true, canAccessClients: true, label: "Administrador" },
  director:     { departments: "*", canEdit: true, canDelete: true, canAccessAdmin: false, canAccessFinancial: true, canAccessClients: true, label: "Diretor" },
  manager:      { departments: ["assistente","recepcao","civel","trabalhista","tributario","protocolo","calculos","audiencias","monitoramento","cobrancas","compliance","familia"], canEdit: true, canDelete: false, canAccessAdmin: false, canAccessFinancial: true, canAccessClients: true, label: "Gerente" },
  lawyer:       { departments: ["assistente","civel","trabalhista","tributario","audiencias","monitoramento","familia"], canEdit: true, canDelete: false, canAccessAdmin: false, canAccessFinancial: false, canAccessClients: true, label: "Advogado" },
  receptionist: { departments: ["assistente","recepcao"], canEdit: true, canDelete: false, canAccessAdmin: false, canAccessFinancial: false, canAccessClients: true, label: "Recepcionista" },
  intern:       { departments: ["assistente","recepcao","civel","trabalhista"], canEdit: false, canDelete: false, canAccessAdmin: false, canAccessFinancial: false, canAccessClients: true, label: "Estagiário" },
  financial:    { departments: ["assistente","cobrancas"], canEdit: true, canDelete: false, canAccessAdmin: false, canAccessFinancial: true, canAccessClients: false, label: "Financeiro" },
  marketing:    { departments: ["assistente","marketing"], canEdit: true, canDelete: false, canAccessAdmin: false, canAccessFinancial: false, canAccessClients: false, label: "Marketing" },
  protocol:     { departments: ["assistente","protocolo"], canEdit: true, canDelete: false, canAccessAdmin: false, canAccessFinancial: false, canAccessClients: false, label: "Protocolo" },
  calculator:   { departments: ["assistente","calculos"], canEdit: true, canDelete: false, canAccessAdmin: false, canAccessFinancial: false, canAccessClients: false, label: "Calculista" },
  compliance:   { departments: ["assistente","compliance"], canEdit: true, canDelete: false, canAccessAdmin: false, canAccessFinancial: false, canAccessClients: false, label: "Compliance" },
};

export function usePermissions() {
  const { userRoles } = useAuth();

  // Get the highest-privilege role
  const primaryRole = userRoles[0] || "intern";
  const perms = ROLE_PERMISSIONS[primaryRole] || ROLE_PERMISSIONS.intern;

  const canAccessDepartment = (deptId: string) => {
    if (perms.departments === "*") return true;
    return perms.departments.includes(deptId);
  };

  const canEdit = perms.canEdit;
  const canDelete = perms.canDelete;
  const canAccessAdmin = perms.canAccessAdmin;
  const canAccessFinancial = perms.canAccessFinancial;
  const canAccessClients = perms.canAccessClients;
  const roleLabel = perms.label;
  const isReadOnly = !canEdit;

  return {
    primaryRole,
    roleLabel,
    canAccessDepartment,
    canEdit,
    canDelete,
    canAccessAdmin,
    canAccessFinancial,
    canAccessClients,
    isReadOnly,
  };
}
