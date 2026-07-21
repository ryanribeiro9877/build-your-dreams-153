import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CLIENT_DOC_SLOTS, type ClientDocSlot, uploadClientDocuments, uploadSignedDocument } from "@/lib/clientDocuments";
import { runCooperadoOnboarding, type CooperadoOnboardingResult } from "@/lib/cooperadoOnboarding";
import { REVISAO_ANTES_ASSINATURA } from "@/lib/cooperadoDocs";

/* ============================================================
   Fase de documentos (pós-cadastro) — §7·B
   Uploads (RG frente/verso + comprovante + opcionais) reusando o
   helper de gravação, e geração dos documentos do cooperado
   (COOP-DOCS-2) via runCooperadoOnboarding, com preview + [REVISAR].
   Não bloqueia o cadastro (regra de gating do Rodrigo).
============================================================ */
const DOC_STATE_LABEL: Record<string, string> = {
  ausente: "A enviar", pendente: "Pendente de assinatura",
  recebido: "Recebido", validado: "Validado", rejeitado: "Rejeitado",
};

async function openSignedDoc(filePath: string) {
  const { data, error } = await supabase.storage.from("client-documents").createSignedUrl(filePath, 60);
  if (error || !data?.signedUrl) { toast.error("Não foi possível abrir o documento"); return; }
  window.open(data.signedUrl, "_blank", "noopener,noreferrer");
}

export function ClientDocumentsPhase({ clientId, clientName, userId, onDone }: {
  clientId: string; clientName: string; userId: string; onDone?: () => void;
}) {
  const [files, setFiles] = useState<Partial<Record<ClientDocSlot, File>>>({});
  const [uploading, setUploading] = useState(false);
  const [sentSlots, setSentSlots] = useState<Set<ClientDocSlot>>(new Set());   // ponto 5
  const [signedSent, setSignedSent] = useState<Set<string>>(new Set());        // ponto 6 (por documentType)
  const [signedBusy, setSignedBusy] = useState<string | null>(null);
  const [genLoading, setGenLoading] = useState(true);
  const [res, setRes] = useState<CooperadoOnboardingResult | null>(null);

  // Geração dos 4 documentos (COOP-DOCS-2) + checklist, assim que a fase abre.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!userId) { setGenLoading(false); return; }
      const r = await runCooperadoOnboarding(clientId, userId);
      if (!cancelled) { setRes(r); setGenLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [clientId, userId]);

  async function reloadChecklist() {
    if (!userId) return;
    const r = await runCooperadoOnboarding(clientId, userId);
    setRes(r);
  }

  async function handleUpload() {
    const anySelected = Object.values(files).some(Boolean);
    if (!anySelected) { toast.error("Selecione ao menos um documento"); return; }
    setUploading(true);
    const results = await uploadClientDocuments(clientId, clientName, userId, files);
    setUploading(false);
    const failed = results.filter(r => !r.ok);
    const ok = results.filter(r => r.ok);
    if (ok.length) {
      toast.success(`${ok.length} documento(s) enviado(s)`);
      setSentSlots(prev => { const n = new Set(prev); ok.forEach(r => n.add(r.slot)); return n; });
    }
    if (failed.length) toast.error(`Falha em ${failed.length} documento(s)`);
    setFiles({});
    await reloadChecklist();
  }

  // Ponto 6: anexar o documento GERADO já assinado (mesmo document_type do gerado,
  // status 'recebido') — move o item do checklist de "pendente de assinatura" p/ "recebido".
  async function handleSigned(documentType: string, label: string, file: File) {
    setSignedBusy(documentType);
    const r = await uploadSignedDocument(clientId, clientName, userId, documentType, label, file);
    setSignedBusy(null);
    if (r.ok) {
      setSignedSent(prev => new Set(prev).add(documentType));
      toast.success(`${label}: assinado recebido`);
      await reloadChecklist();
    } else {
      toast.error(`Falha ao anexar ${label}: ${r.error ?? ""}`);
    }
  }

  const okGenerated = (res?.generated ?? []).filter(g => g.ok);
  const failedGenerated = (res?.generated ?? []).filter(g => !g.ok);
  const anyMissing = (res?.generated ?? []).some(g => (g.missing?.length ?? 0) > 0);

  return (
    <div className="cli-form-card cli-wizard">
      <div className="cli-formsec">✓ Cadastro concluído</div>
      {clientName && (
        <div style={{ marginTop: 8, fontSize: 13, fontWeight: 700, color: "var(--cli-ink)" }}>
          Cliente: {clientName}
        </div>
      )}

      {/* Uploads dos documentos do cliente (não bloqueiam — geram pendência) */}
      <div className="cli-doc-panel">
        <div className="cli-doc-title">Documentos do cliente</div>
        <div className="cli-doc-grid">
          {CLIENT_DOC_SLOTS.map(({ slot, label, required }) => {
            const sent = sentSlots.has(slot);
            return (
              <div key={slot}>
                <label className="cli-label">{label}{required ? " *" : ""}</label>
                <input type="file" accept="image/*,.pdf,.xls,.xlsx" className="cli-input file" disabled={sent}
                  onChange={e => setFiles(prev => ({ ...prev, [slot]: e.target.files?.[0] || undefined }))} />
                {sent ? <span className="cli-doc-hint">✓ enviado</span>
                  : files[slot] && <span className="cli-filename">{files[slot]?.name}</span>}
              </div>
            );
          })}
        </div>
        <div className="cli-form-actions">
          {(() => {
            const pending = CLIENT_DOC_SLOTS.some(({ slot }) => files[slot] && !sentSlots.has(slot));
            const allSent = sentSlots.size >= CLIENT_DOC_SLOTS.filter(s => s.required).length && !pending;
            return (
              <button type="button" className="cli-btn" disabled={uploading || !pending} onClick={() => void handleUpload()}>
                {uploading ? "Enviando…" : pending ? "Enviar documentos" : allSent ? "Enviado ✓" : "Enviado"}
              </button>
            );
          })()}
          <span className="cli-doc-hint">O envio não bloqueia o cadastro — o que faltar fica como pendência.</span>
        </div>
      </div>

      {/* Documentos gerados (COOP-DOCS-2) + checklist */}
      <div className="cli-doc-panel">
        <div className="cli-doc-title">Documentos gerados (pendentes de revisão)</div>
        {genLoading ? (
          <div className="cli-doc-hint">Gerando procuração, contrato, hipossuficiência e termo de cooperado…</div>
        ) : (
          <>
            {okGenerated.length > 0 ? (
              <div className="cli-doc-gen-list">
                {okGenerated.map(g => (
                  <div key={g.documentType} className="cli-doc-gen-item">
                    <button type="button" className="cli-doc-chip"
                      title="Baixar para revisão" onClick={() => g.filePath && void openSignedDoc(g.filePath)}>
                      ⬇ {g.label}{(g.missing?.length ?? 0) > 0 ? " ⚠" : ""}
                    </button>
                    {signedSent.has(g.documentType) ? (
                      <span className="cli-doc-hint">✓ assinado recebido</span>
                    ) : (
                      <label className="cli-doc-signed">
                        <span>Anexar assinado</span>
                        <input type="file" accept="image/*,.pdf" disabled={signedBusy === g.documentType}
                          onChange={e => { const f = e.target.files?.[0]; if (f) void handleSigned(g.documentType, g.label, f); }} />
                      </label>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="cli-doc-hint">Nenhum documento gerado automaticamente.</div>
            )}
            {failedGenerated.length > 0 && (
              <div className="cli-doc-hint">Não gerado: {failedGenerated.map(g => g.label).join(", ")} — complete manualmente.</div>
            )}
            {(okGenerated.length > 0 || anyMissing) && (
              <div className="cli-review-note">
                <strong>[REVISAR]</strong> {REVISAO_ANTES_ASSINATURA}
                {anyMissing ? " Campos sem dado saíram como [A PREENCHER] — complete antes de enviar." : ""}
              </div>
            )}
          </>
        )}
      </div>

      {/* Checklist do conjunto obrigatório */}
      {res && res.checklist.length > 0 && (
        <div className="cli-doc-panel">
          <div className="cli-doc-title">Conjunto obrigatório</div>
          <div className="cli-doc-check">
            {res.checklist.map(row => (
              <div className="cli-doc-check-row" key={row.document_type}>
                <span className={`dot s-${row.status}`} />
                <span className="lbl">{row.document_type}</span>
                <span className="st">{DOC_STATE_LABEL[row.status] ?? row.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {onDone && (
        <div className="cli-form-actions">
          <button type="button" className="cli-btn" onClick={() => onDone()}>Concluir</button>
        </div>
      )}
    </div>
  );
}
