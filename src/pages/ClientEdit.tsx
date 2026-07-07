import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useMyWorkspace } from "@/hooks/useMyWorkspace";
import { toast } from "sonner";
import { HexagonLoader } from "@/components/HexagonLoader";
import ClientForm from "@/components/clients/ClientForm";
import {
  type ClientFull, type ClientFormValues, CLIENT_FULL_COLUMNS, formValuesFromClient,
  ALLOWED_ROLES, RestrictedAccess,
} from "@/components/clients/shared";

export default function ClientEdit() {
  const { id } = useParams<{ id: string }>();
  const { workspace } = useMyWorkspace();
  const navigate = useNavigate();
  const hasAccess = ALLOWED_ROLES.includes(workspace?.role_template?.code ?? "");

  const [values, setValues] = useState<ClientFormValues | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (clientId: string) => {
    setLoading(true);
    // R-2: leitura pela view decifrada, projeção explícita (nunca select("*")).
    const { data, error } = await (supabase as unknown as {
      from: (t: string) => {
        select: (c: string) => { eq: (k: string, v: string) => { single: () => Promise<{ data: ClientFull | null; error: unknown }> } };
      };
    }).from("clients_decrypted").select(CLIENT_FULL_COLUMNS).eq("id", clientId).single();
    if (error || !data) { toast.error("Cliente não encontrado"); navigate("/clientes"); return; }
    setValues(formValuesFromClient(data));
    setLoading(false);
  }, [navigate]);

  useEffect(() => { if (id) void load(id); }, [id, load]);

  if (workspace && !hasAccess) return <RestrictedAccess />;
  if (loading || !values) return <HexagonLoader variant="fullscreen" label="Carregando cliente..." />;

  return (
    <div className="cli-root">
      <div className="cli-wrap">
        <div className="cli-top">
          <button className="cli-back" onClick={() => navigate(`/clientes/${id}`)}>← Detalhe</button>
          <span className="cli-title">Editar Cliente</span>
        </div>
        <ClientForm mode="edit" clientId={id} initialValues={values} />
      </div>
    </div>
  );
}
