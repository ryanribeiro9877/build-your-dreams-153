import { useNavigate } from "react-router-dom";
import { useMyWorkspace } from "@/hooks/useMyWorkspace";
import ClienteFormWizard from "@/components/clients/ClienteFormWizard";
import { ALLOWED_ROLES, RestrictedAccess } from "@/components/clients/shared";

export default function ClientNew() {
  const { workspace } = useMyWorkspace();
  const navigate = useNavigate();
  const hasAccess = ALLOWED_ROLES.includes(workspace?.role_template?.code ?? "");

  if (workspace && !hasAccess) return <RestrictedAccess />;

  return (
    <div className="cli-root">
      <div className="cli-wrap">
        <div className="cli-top">
          <button className="cli-back" onClick={() => navigate("/clientes")}>← Clientes</button>
          <span className="cli-title">Novo Cliente</span>
        </div>
        {/* Fonte única (CADASTRO-MODELO-A): o mesmo wizard usado no chat.
            Após confirmar, o wizard abre a fase de documentos; "Concluir" volta à lista. */}
        <ClienteFormWizard mode="create" variant="page" onCancel={() => navigate("/clientes")} />
      </div>
    </div>
  );
}
