export interface ActionPerms { isMaster: boolean; canAssignTask: boolean; }

// Ferramentas que exigem permissão de atribuição (gate do create_user_task).
const NEEDS_ASSIGN = new Set(["criar_card_tarefa"]);

export function decideActionRoute(perms: ActionPerms, tool: string): "execute" | "pendencia" {
  if (NEEDS_ASSIGN.has(tool)) {
    return perms.isMaster || perms.canAssignTask ? "execute" : "pendencia";
  }
  return "execute"; // cadastrar_cliente, solicitar_documentos, pedir_acesso_arquivos: qualquer autenticado
}
