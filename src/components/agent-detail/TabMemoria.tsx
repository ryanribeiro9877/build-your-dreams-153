import { type AgentLLMConfig } from "@/types/jurisai";

export function TabMemoria({
  editConfig,
  updateField,
}: {
  editConfig: AgentLLMConfig;
  updateField: <K extends keyof AgentLLMConfig>(k: K, v: AgentLLMConfig[K]) => void;
}) {
  return (
    <div className="lf-panel">
      <h2 className="lf-panel__title">Memória e contexto</h2>
      <p className="lf-panel__hint">
        Quanto histórico o agente carrega a cada turno, e se mantém memória de longo prazo.
      </p>

      <div className="lf-field">
        <label className="lf-field__label">History limit (mensagens recentes)</label>
        <input
          className="lf-input"
          type="number"
          min={1}
          max={50}
          value={editConfig.history_limit ?? ""}
          onChange={(e) =>
            updateField("history_limit", e.target.value === "" ? null : parseInt(e.target.value))
          }
          placeholder="10"
        />
        <span className="lf-field__hint">
          Quantas mensagens anteriores enviar no contexto. Maior = mais coerência mas mais caro.
        </span>
      </div>

      <div
        className="lf-panel lf-panel--ghost"
        style={{
          border: "1px solid hsl(var(--border))",
          padding: 14,
          margin: 0,
        }}
      >
        <label
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
            cursor: "pointer",
            margin: 0,
          }}
        >
          <input
            type="checkbox"
            checked={!!editConfig.memory_enabled}
            onChange={(e) => updateField("memory_enabled", e.target.checked)}
            style={{ accentColor: "var(--lf-gold)", width: 16, height: 16, marginTop: 2 }}
          />
          <div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Memória eterna (long-term)</div>
            <div className="lf-field__hint" style={{ marginTop: 4 }}>
              Persiste fatos relevantes entre conversas. Disponível quando a Onda 4 (RAG/KB) for
              liberada. Hoje a flag é armazenada mas não ativa nenhum comportamento.
            </div>
          </div>
        </label>
      </div>
    </div>
  );
}
