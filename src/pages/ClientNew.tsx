import { useNavigate } from "react-router-dom";
import { useMyWorkspace } from "@/hooks/useMyWorkspace";
import { useMenuAccess } from "@/hooks/useMenuAccess";
import ClienteFormWizard from "@/components/clients/ClienteFormWizard";
import { RestrictedAccess } from "@/components/clients/shared";

export default function ClientNew() {
  const { workspace } = useMyWorkspace();
  const { canSeeMenu, loading: menuLoading } = useMenuAccess();
  const navigate = useNavigate();

  // DEF-2: exclusivo da recepção (mesma fonte do menu). Ver Clients.tsx.
  // B10: mesma fonte do menu/lista/ficha (ver ClientDetails).
  if (!menuLoading && workspace && !canSeeMenu("clientes")) return <RestrictedAccess />;

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
