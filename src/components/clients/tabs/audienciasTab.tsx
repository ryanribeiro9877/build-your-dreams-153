import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { fetchAudienciasByClient, type AudienciaRow } from "@/hooks/useAudiencias";
import { useMeetingLawyers } from "@/hooks/useMeetingLawyers";
import {
  AUDIENCIA_STATUS_COLOR, audienciaStatusLabel, formatAudienciaDateTime,
} from "@/lib/audiencias";
import { AudienciaFormModal } from "@/components/audiencias/AudienciaFormModal";
import { type ClientFull, EmptyState, TabLoading } from "../shared";

/**
 * [8.3] Aba "Audiências" do cadastro do cliente. Lê `public.audiencias` do
 * cliente (por client_id), lista cronologicamente e permite registrar uma nova
 * (form pré-vinculado ao cliente). Escrita via RPC create/update_audiencia.
 */
export function AudienciasTab({ client }: { client: ClientFull }) {
  const [rows, setRows] = useState<AudienciaRow[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<AudienciaRow | null>(null);
  const { lawyers } = useMeetingLawyers();

  const load = useCallback(async () => {
    try {
      const data = await fetchAudienciasByClient(client.id);
      setRows(data);
    } catch (e) {
      toast.error(`Erro ao carregar audiências: ${(e as Error).message}`);
      setRows([]);
    }
  }, [client.id]);

  useEffect(() => { void load(); }, [load]);

  const advLabel = (a: AudienciaRow) => {
    if (a.advogado_user_id) {
      const found = lawyers.find((l) => l.user_id === a.advogado_user_id);
      if (found) return found.name;
    }
    return a.advogado_nome ?? null;
  };

  if (rows === null) return <TabLoading />;

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className="cli-card lift" style={{ padding: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "2px 4px 10px" }}>
          <div className="cli-sec-title" style={{ flex: 1, padding: 0 }}>Audiências · {rows.length}</div>
          <button className="cli-btn sm" onClick={() => { setSelected(null); setCreating(true); }}>+ Nova audiência</button>
        </div>

        {rows.length === 0 ? (
          <EmptyState icon="⚖" title="Nenhuma audiência registrada" hint="Registre a próxima audiência deste cliente com o botão acima." />
        ) : (
          rows.map((a) => {
            const adv = advLabel(a);
            return (
              <div key={a.id} className="cli-row">
                <div className="dot" style={{ color: AUDIENCIA_STATUS_COLOR[a.status] }}>⚖</div>
                <div className="body">
                  <div className="t">{formatAudienciaDateTime(a.data_hora)}</div>
                  <div className="s">
                    {a.tipo_acao ? a.tipo_acao : "Audiência"}
                    {a.parte_contraria ? ` · contra ${a.parte_contraria}` : ""}
                    {a.process_number ? ` · Proc. ${a.process_number}` : ""}
                    {adv ? ` · ${adv}` : ""}
                    {a.link_local ? ` · ${a.link_local}` : ""}
                  </div>
                </div>
                <span style={{ display: "flex", gap: 8, alignItems: "center", marginLeft: "auto", flexShrink: 0 }}>
                  <span className="cli-chip n" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: AUDIENCIA_STATUS_COLOR[a.status] }} />
                    {audienciaStatusLabel(a.status)}
                  </span>
                  <button className="go" onClick={() => { setCreating(false); setSelected(a); }} title="Editar audiência">→</button>
                </span>
              </div>
            );
          })
        )}
      </div>

      {(creating || selected) && (
        <AudienciaFormModal
          audiencia={selected}
          fixedClient={{ id: client.id, name: client.full_name }}
          onClose={() => { setCreating(false); setSelected(null); }}
          onSaved={() => { setCreating(false); setSelected(null); void load(); }}
        />
      )}
    </div>
  );
}
