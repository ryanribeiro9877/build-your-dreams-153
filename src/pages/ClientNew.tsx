import { useNavigate } from "react-router-dom";
import { useMyWorkspace } from "@/hooks/useMyWorkspace";
import ClientForm from "@/components/clients/ClientForm";
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
        <ClientForm mode="create" />
      </div>
    </div>
  );
}
