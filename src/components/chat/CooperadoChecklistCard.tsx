import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  runCooperadoOnboarding, type CooperadoOnboardingResult,
} from "@/lib/cooperadoOnboarding";
import { REVISAO_ANTES_ASSINATURA } from "@/lib/cooperadoDocs";
import { DOCUMENT_TYPE_LABELS } from "@/components/clients/shared";

// COOP-DOCS-3 — cartão exibido no chat logo após o cadastro ser confirmado:
// dispara a geração dos documentos do cooperado (Fatia 2) e mostra o checklist
// do conjunto obrigatório (COOP-DOCS-1). Nada aqui marca nada como validado.

// Rótulo do estado no checklist. Um documento gerado pelo sistema nasce
// 'pendente' = aguardando assinatura; 'ausente' = ainda precisa ser enviado.
const STATE_LABEL: Record<string, string> = {
  ausente: "A enviar",
  pendente: "Pendente de assinatura",
  recebido: "Recebido",
  validado: "Validado",
  rejeitado: "Rejeitado",
};
const STATE_COLOR: Record<string, string> = {
  ausente: "#94A3B8",
  pendente: "#EAB308",
  recebido: "#60A5FA",
  validado: "#34D399",
  rejeitado: "#F87171",
};

async function openGenerated(filePath: string) {
  const { data, error } = await supabase.storage
    .from("client-documents")
    .createSignedUrl(filePath, 60);
  if (error || !data?.signedUrl) return;
  window.open(data.signedUrl, "_blank", "noopener,noreferrer");
}

export function CooperadoChecklistCard({ clientId, clientName }: { clientId: string; clientName?: string }) {
  const { user } = useAuth();
  const userId = user?.id;
  const [loading, setLoading] = useState(true);
  const [res, setRes] = useState<CooperadoOnboardingResult | null>(null);

  // Depende de userId (string estável), não do objeto `user` — uma nova
  // referência de `user` entre renders re-disparava a geração (bug 2026-07-22).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!userId) return;
      const r = await runCooperadoOnboarding(clientId, userId);
      if (!cancelled) { setRes(r); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [clientId, userId]);

  const okGenerated = (res?.generated ?? []).filter((g) => g.ok);
  const failedGenerated = (res?.generated ?? []).filter((g) => !g.ok);
  const anyMissing = (res?.generated ?? []).some((g) => (g.missing?.length ?? 0) > 0);

  return (
    <div className="action-card" style={{ border: "1px solid rgba(234,179,8,0.35)", borderRadius: 10, padding: 12, margin: "8px 0", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontWeight: 700, fontSize: 13 }}>
        Cliente cadastrado{clientName ? `: ${clientName}` : ""}
      </div>

      {loading && (
        <div style={{ fontSize: 12, color: "#94A3B8" }}>Gerando documentos do cooperado…</div>
      )}

      {!loading && res && (
        <>
          {/* Documentos gerados agora (pendentes de assinatura) */}
          {okGenerated.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Documentos gerados (pendentes de assinatura)</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {okGenerated.map((g) => (
                  <button
                    key={g.documentType}
                    type="button"
                    onClick={() => g.filePath && openGenerated(g.filePath)}
                    title="Baixar para revisão"
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 8, fontSize: 11, cursor: "pointer", background: "rgba(234,179,8,0.12)", border: "1px solid rgba(234,179,8,0.3)", color: "#EAB308", fontWeight: 600 }}
                  >
                    ⬇ {g.label}{(g.missing?.length ?? 0) > 0 ? " ⚠" : ""}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Falhas de geração (ex.: template ausente — contrato ainda em PDF) */}
          {failedGenerated.length > 0 && (
            <div style={{ fontSize: 11, color: "#94A3B8" }}>
              Não gerado: {failedGenerated.map((g) => g.label).join(", ")} — revise/complete manualmente.
            </div>
          )}

          {/* Checklist do conjunto obrigatório do cooperado */}
          {res.checklist.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Conjunto obrigatório do cooperado</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {res.checklist.map((row) => (
                  <div key={row.document_type} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: STATE_COLOR[row.status] ?? "#94A3B8", flexShrink: 0 }} />
                    <span style={{ flex: 1 }}>{DOCUMENT_TYPE_LABELS[row.document_type] ?? row.document_type}</span>
                    <span style={{ color: STATE_COLOR[row.status] ?? "#94A3B8", fontWeight: 600 }}>
                      {STATE_LABEL[row.status] ?? row.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(okGenerated.length > 0 || anyMissing) && (
            <div style={{ fontSize: 11, color: "#94A3B8", lineHeight: 1.4 }}>
              {REVISAO_ANTES_ASSINATURA}
              {anyMissing ? " Campos sem dado saíram como [A PREENCHER] — complete antes de enviar." : ""}
            </div>
          )}
        </>
      )}
    </div>
  );
}
