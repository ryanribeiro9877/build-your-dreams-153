import { type AgentLLMConfig } from "@/types/jurisai";

export function TabPrompt({
  editConfig,
  updateField,
  agentName,
}: {
  editConfig: AgentLLMConfig;
  updateField: <K extends keyof AgentLLMConfig>(k: K, v: AgentLLMConfig[K]) => void;
  agentName: string;
}) {
  const charCount = (editConfig.system_prompt ?? "").length;
  return (
    <div className="lf-panel">
      <h2 className="lf-panel__title">
        System prompt
        <span className="lf-badge lf-badge--neutral lf-badge--mono">{charCount} caracteres</span>
      </h2>
      <p className="lf-panel__hint">
        Instrução base que define a persona, tom e regras deste agente. Se ficar vazio, a edge
        function gera um prompt automático baseado em nome e descrição.
      </p>

      <div className="lf-field" style={{ marginBottom: 0 }}>
        <label className="lf-field__label">Prompt do sistema</label>
        <textarea
          className="lf-textarea lf-mono"
          value={editConfig.system_prompt ?? ""}
          onChange={(e) => updateField("system_prompt", e.target.value || null)}
          placeholder={`Você é ${agentName}.\n\nEx: "Sou especialista em direito do trabalho. Sempre cito Súmulas do TST. Tom: formal mas acessível. Nunca prometo resultado."`}
          rows={14}
          style={{ minHeight: 280, fontSize: 12 }}
        />
      </div>
    </div>
  );
}
