import { useNavigate } from "react-router-dom";
import { useMyWorkspace } from "@/hooks/useMyWorkspace";
import ClientForm from "@/components/clients/ClientForm";
import { ALLOWED_ROLES, RestrictedAccess, ghostButtonStyle, pageStyle } from "@/components/clients/shared";

export default function ClientNew() {
  const { workspace } = useMyWorkspace();
  const navigate = useNavigate();
  const hasAccess = ALLOWED_ROLES.includes(workspace?.role_template?.code ?? "");

  if (workspace && !hasAccess) return <RestrictedAccess />;

  return (
    <div style={{ ...pageStyle, maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <button className="btn-voltar" onClick={() => navigate("/clientes")} style={ghostButtonStyle}>← Clientes</button>
        <h1 style={{ fontFamily: "'Roboto', sans-serif", fontSize: 24, fontWeight: 600, color: "var(--gold, #c9a84c)", margin: 0 }}>
          Novo Cliente
        </h1>
      </div>
      <ClientForm mode="create" />
    </div>
  );
}
