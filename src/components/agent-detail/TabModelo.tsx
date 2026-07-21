import { useProviders, PROVIDER_LABELS } from "@/hooks/useProviders";
import { type ProviderCode, type AgentLLMConfig } from "@/types/jurisai";
import { toast } from "sonner";

export function TabModelo({
  editConfig,
  updateField,
  applyProviderSelection,
  applySuggested,
  agentLevel,
  models,
  configuredProviders,
  onGoToProvider,
}: {
  editConfig: AgentLLMConfig;
  updateField: <K extends keyof AgentLLMConfig>(k: K, v: AgentLLMConfig[K]) => void;
  applyProviderSelection: (provider: ProviderCode | null) => void;
  applySuggested: (lvl: number) => void;
  agentLevel: number;
  models: ReturnType<typeof useProviders>["models"];
  configuredProviders: Set<ProviderCode>;
  onGoToProvider: () => void;
}) {
  const modelsForProvider = models.filter((m) => m.provider === editConfig.provider);

  return (
    <div className="lf-panel">
      <h2 className="lf-panel__title">
        Modelo de IA
        <button
          type="button"
          className="lf-btn lf-btn--ghost"
          onClick={() => applySuggested(agentLevel)}
        >
          ✨ Preset N{agentLevel}
        </button>
      </h2>
      <p className="lf-panel__hint">
        Provedor e modelo que este agente vai usar nas conversas.
      </p>

      <div className="lf-field">
        <label className="lf-field__label">Provedor</label>
        <select
          className="lf-select"
          value={editConfig.provider || ""}
          onChange={(e) => {
            const newProvider = (e.target.value || null) as ProviderCode | null;
            if (!newProvider) {
              applyProviderSelection(null);
              return;
            }
            if (!configuredProviders.has(newProvider)) {
              toast.warning("Chave de API não cadastrada", {
                description:
                  `Configure a chave de ${PROVIDER_LABELS[newProvider]} na aba "Provedor" desta página. Sem a chave, o agente não consegue usar esse provedor.`,
                duration: 8000,
                action: {
                  label: "Abrir Provedor",
                  onClick: () => onGoToProvider(),
                },
              });
              return;
            }
            applyProviderSelection(newProvider);
          }}
        >
          <option value="">— Selecione —</option>
          {(Object.keys(PROVIDER_LABELS) as ProviderCode[]).map((p) => (
            <option key={p} value={p}>
              {PROVIDER_LABELS[p]}
              {!configuredProviders.has(p) && " · sem chave"}
            </option>
          ))}
        </select>
      </div>

      {/* Alerta inline quando provider escolhido não tem chave */}
      {editConfig.provider && !configuredProviders.has(editConfig.provider) && (
        <div
          className="lf-panel lf-panel--ghost"
          style={{
            border: "1px solid rgba(245, 179, 66, 0.35)",
            background: "rgba(245, 179, 66, 0.08)",
            padding: 14,
            margin: "0 0 14px",
            display: "flex",
            gap: 12,
            alignItems: "center",
          }}
        >
          <span className="lf-dot lf-dot--warn" />
          <div style={{ flex: 1, fontSize: 13 }}>
            Você ainda não cadastrou chave para{" "}
            <strong>{PROVIDER_LABELS[editConfig.provider]}</strong>. Sem chave, este agente
            não vai conseguir responder.
          </div>
          <button type="button" className="lf-btn lf-btn--primary" onClick={onGoToProvider}>
            Cadastrar agora
          </button>
        </div>
      )}

      <div className="lf-field">
        <label className="lf-field__label">Modelo</label>
        <select
          className="lf-select"
          value={editConfig.model || ""}
          onChange={(e) => updateField("model", e.target.value || null)}
          disabled={!editConfig.provider}
          style={{ opacity: editConfig.provider ? 1 : 0.55 }}
        >
          <option value="">— Selecione um modelo —</option>
          {modelsForProvider.map((m) => (
            <option key={m.id} value={m.model_id}>
              {m.display_name} · {m.tier} · ${Number(m.input_price_per_mtok).toFixed(2)}/$
              {Number(m.output_price_per_mtok).toFixed(2)}/MTok
            </option>
          ))}
        </select>
        {editConfig.provider && modelsForProvider.length === 0 && (
          <span className="lf-field__hint" style={{ color: "var(--lf-danger)" }}>
            Nenhum modelo no catálogo para este provedor.
          </span>
        )}
      </div>

      <div className="lf-fields-grid">
        <div className="lf-field" style={{ marginBottom: 0 }}>
          <label className="lf-field__label">Temperatura</label>
          <input
            className="lf-input"
            type="number"
            min={0}
            max={2}
            step={0.1}
            value={editConfig.temperature ?? ""}
            onChange={(e) =>
              updateField("temperature", e.target.value === "" ? null : parseFloat(e.target.value))
            }
            placeholder="0.3"
          />
          <span className="lf-field__hint">0 = determinístico · 1 = balanceado · 2 = criativo</span>
        </div>
        <div className="lf-field" style={{ marginBottom: 0 }}>
          <label className="lf-field__label">Max tokens</label>
          <input
            className="lf-input"
            type="number"
            min={1}
            max={100000}
            value={editConfig.max_tokens ?? ""}
            onChange={(e) =>
              updateField("max_tokens", e.target.value === "" ? null : parseInt(e.target.value))
            }
            placeholder="1500"
          />
          <span className="lf-field__hint">Limite da resposta — afeta custo e latência.</span>
        </div>
      </div>
    </div>
  );
}
