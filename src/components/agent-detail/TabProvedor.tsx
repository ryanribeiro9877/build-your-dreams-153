import { useState, useEffect } from "react";
import { useProviders, PROVIDER_LABELS, PROVIDER_HINTS } from "@/hooks/useProviders";
import { validateProviderKey, type ValidationResult } from "@/lib/validateProviderKey";
import { type ProviderCode } from "@/types/jurisai";
import { toast } from "sonner";

export function TabProvedor({
  configs,
  models,
  registerKey,
  deleteConfig,
  setDefaultConfig,
  selectedProvider,
  providerHasKey,
}: {
  configs: ReturnType<typeof useProviders>["configs"];
  models: ReturnType<typeof useProviders>["models"];
  registerKey: ReturnType<typeof useProviders>["registerKey"];
  deleteConfig: ReturnType<typeof useProviders>["deleteConfig"];
  setDefaultConfig: ReturnType<typeof useProviders>["setDefaultConfig"];
  selectedProvider: ProviderCode | null;
  providerHasKey: boolean;
}) {
  const [showForm, setShowForm] = useState(!providerHasKey && !!selectedProvider);
  const [formProvider, setFormProvider] = useState<ProviderCode>(selectedProvider || "anthropic");
  const [formApiKey, setFormApiKey] = useState("");
  const [formBudget, setFormBudget] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formSetDefault, setFormSetDefault] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Validação em tempo real da chave do provedor.
  const [validationStatus, setValidationStatus] = useState<
    "idle" | "checking" | "valid" | "invalid" | "unknown"
  >("idle");
  const [validationDetail, setValidationDetail] = useState<string>("");

  useEffect(() => {
    setValidationStatus("idle");
    setValidationDetail("");
    const trimmed = formApiKey.trim();
    if (trimmed.length < 20) return;
    setValidationStatus("checking");
    const t = setTimeout(async () => {
      const result: ValidationResult = await validateProviderKey(formProvider, trimmed);
      if (result.ok === true) setValidationStatus("valid");
      else if (result.ok === false) setValidationStatus("invalid");
      else setValidationStatus("unknown");
      setValidationDetail(result.detail);
    }, 700);
    return () => clearTimeout(t);
  }, [formApiKey, formProvider]);

  useEffect(() => {
    if (!providerHasKey && selectedProvider) {
      setShowForm(true);
      setFormProvider(selectedProvider);
    }
  }, [providerHasKey, selectedProvider]);

  const handleRegister = async () => {
    if (formApiKey.trim().length < 20) {
      toast.error("Chave muito curta.");
      return;
    }
    if (validationStatus === "invalid") {
      toast.error("Chave inválida — corrija antes de cadastrar.");
      return;
    }
    setSubmitting(true);
    const budget = formBudget.trim() ? parseFloat(formBudget.replace(",", ".")) : undefined;
    const id = await registerKey(formProvider, formApiKey.trim(), {
      setDefault: formSetDefault,
      monthlyBudgetUsd: Number.isFinite(budget) ? budget : undefined,
      notes: formNotes.trim() || undefined,
    });
    setSubmitting(false);
    if (id) {
      toast.success(`Chave do ${PROVIDER_LABELS[formProvider]} cadastrada.`);
      setFormApiKey("");
      setFormBudget("");
      setFormNotes("");
      setShowForm(false);
    } else {
      toast.error("Não foi possível cadastrar. Verifique o formato.");
    }
  };

  const handleDelete = async (configId: string, label: string) => {
    if (!confirm(`Remover a chave do ${label}? Agentes que dependem dela vão parar de funcionar.`))
      return;
    const ok = await deleteConfig(configId);
    if (ok) toast.success("Chave removida.");
  };

  const modelCount = (p: ProviderCode) => models.filter((m) => m.provider === p).length;

  return (
    <div className="lf-panel">
      <h2 className="lf-panel__title">Provedores e chaves</h2>
      <p className="lf-panel__hint">
        Suas chaves de API ficam criptografadas no Supabase Vault. São usadas por todos os agentes
        que escolherem este provedor.
      </p>

      {/* Aviso de privacidade */}
      <div
        className="lf-panel lf-panel--ghost"
        style={{
          background: "rgba(45, 212, 160, 0.06)",
          border: "1px solid rgba(45, 212, 160, 0.25)",
          padding: 12,
          margin: "0 0 14px",
          fontSize: 12,
        }}
      >
        <strong style={{ color: "var(--lf-success)" }}>Privacidade.</strong>{" "}
        Cadastramos no Vault (criptografia AES-256). A chave nunca é exibida de volta, só os últimos
        4 caracteres.
      </div>

      {/* Lista de chaves */}
      <section>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <h3 style={{ fontSize: 13, margin: 0, fontWeight: 600 }}>
            Chaves cadastradas ({configs.length})
          </h3>
          {!showForm && (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="lf-btn lf-btn--primary"
              style={{ padding: "7px 14px" }}
            >
              + Adicionar chave
            </button>
          )}
        </div>

        {configs.length === 0 && !showForm ? (
          <div className="lf-empty">Nenhuma chave cadastrada ainda.</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {configs.map((c) => (
              <div
                key={c.id}
                className="lf-panel lf-panel--ghost"
                style={{
                  border:
                    c.provider === selectedProvider
                      ? "1px solid rgba(45, 212, 160, 0.4)"
                      : "1px solid hsl(var(--border))",
                  background: "hsl(var(--card))",
                  padding: 14,
                  margin: 0,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="lf-row" style={{ gap: 8, marginBottom: 4 }}>
                    <strong style={{ fontSize: 13 }}>{PROVIDER_LABELS[c.provider]}</strong>
                    {c.is_default && (
                      <span className="lf-badge lf-badge--gold">★ Padrão</span>
                    )}
                    {c.provider === selectedProvider && (
                      <span className="lf-badge lf-badge--success">Usado neste agente</span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}>
                    Chave:{" "}
                    <span className="lf-mono" style={{ color: "var(--lf-gold)" }}>
                      ****{c.api_key_last_4 || "????"}
                    </span>{" "}
                    · {modelCount(c.provider)} modelos
                    {c.monthly_budget_usd !== null && (
                      <>
                        {" · "}${Number(c.monthly_spent_usd ?? 0).toFixed(4)}/$
                        {Number(c.monthly_budget_usd).toFixed(2)}/mês
                      </>
                    )}
                  </div>
                </div>
                <div className="lf-row" style={{ gap: 6 }}>
                  {!c.is_default && (
                    <button
                      type="button"
                      onClick={() => setDefaultConfig(c.id)}
                      title="Tornar padrão"
                      className="lf-btn lf-btn--ghost"
                      style={{ padding: "6px 12px", fontSize: 12 }}
                    >
                      ★ Padrão
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDelete(c.id, PROVIDER_LABELS[c.provider])}
                    title="Remover"
                    className="lf-btn lf-btn--danger-ghost"
                    style={{ padding: "6px 12px", fontSize: 12 }}
                  >
                    Remover
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Form inline */}
      {showForm && (
        <section
          className="lf-panel lf-panel--ghost lf-fade-in"
          style={{
            background: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            padding: 18,
            marginTop: 16,
          }}
        >
          <h3 style={{ fontSize: 13, margin: "0 0 14px", fontWeight: 600 }}>Nova chave</h3>

          <div className="lf-field">
            <label className="lf-field__label">Provedor</label>
            <select
              className="lf-select"
              value={formProvider}
              onChange={(e) => setFormProvider(e.target.value as ProviderCode)}
            >
              {(Object.keys(PROVIDER_LABELS) as ProviderCode[]).map((p) => (
                <option key={p} value={p}>
                  {PROVIDER_LABELS[p]}
                </option>
              ))}
            </select>
            <span className="lf-field__hint">{PROVIDER_HINTS[formProvider]}</span>
          </div>

          <div className="lf-field">
            <label className="lf-field__label">
              Chave de API
              {validationStatus === "checking" && (
                <span style={{ marginLeft: 8, fontSize: 10, color: "hsl(var(--muted-foreground))", fontWeight: 500 }}>
                  · validando...
                </span>
              )}
              {validationStatus === "valid" && (
                <span style={{ marginLeft: 8, fontSize: 10, color: "var(--lf-success)", fontWeight: 600 }}>
                  · válida ✓
                </span>
              )}
              {validationStatus === "invalid" && (
                <span style={{ marginLeft: 8, fontSize: 10, color: "var(--lf-danger)", fontWeight: 600 }}>
                  · inválida ✗
                </span>
              )}
              {validationStatus === "unknown" && (
                <span style={{ marginLeft: 8, fontSize: 10, color: "var(--lf-warn)", fontWeight: 600 }}>
                  · não confirmável
                </span>
              )}
            </label>
            <input
              className="lf-input"
              type="password"
              value={formApiKey}
              onChange={(e) => setFormApiKey(e.target.value)}
              placeholder={
                formProvider === "anthropic"
                  ? "sk-ant-..."
                  : formProvider === "openrouter"
                    ? "sk-or-v1-..."
                    : "sk-..."
              }
              autoComplete="off"
              spellCheck={false}
              style={{
                background:
                  validationStatus === "valid"
                    ? "rgba(45, 212, 160, 0.10)"
                    : validationStatus === "invalid"
                      ? "rgba(255, 107, 107, 0.10)"
                      : validationStatus === "checking"
                        ? "rgba(234, 179, 8, 0.06)"
                        : undefined,
                borderColor:
                  validationStatus === "valid"
                    ? "rgba(45, 212, 160, 0.55)"
                    : validationStatus === "invalid"
                      ? "rgba(255, 107, 107, 0.55)"
                      : validationStatus === "checking"
                        ? "rgba(234, 179, 8, 0.45)"
                        : undefined,
                boxShadow:
                  validationStatus === "valid"
                    ? "0 0 0 3px rgba(45, 212, 160, 0.12)"
                    : validationStatus === "invalid"
                      ? "0 0 0 3px rgba(255, 107, 107, 0.15)"
                      : undefined,
                transition: "background 200ms ease, border-color 200ms ease, box-shadow 200ms ease",
              }}
            />
            {(validationStatus === "invalid" || validationStatus === "unknown") && validationDetail && (
              <span
                className="lf-field__hint"
                style={{
                  color:
                    validationStatus === "invalid"
                      ? "var(--lf-danger)"
                      : "var(--lf-warn)",
                  fontWeight: 500,
                  marginTop: 6,
                }}
              >
                {validationDetail}
              </span>
            )}
          </div>

          <div className="lf-fields-grid">
            <div className="lf-field">
              <label className="lf-field__label">Orçamento mensal (USD)</label>
              <input
                className="lf-input"
                type="text"
                inputMode="decimal"
                value={formBudget}
                onChange={(e) => setFormBudget(e.target.value)}
                placeholder="opcional"
              />
            </div>
            <div className="lf-field">
              <label className="lf-field__label">&nbsp;</label>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 0",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={formSetDefault}
                  onChange={(e) => setFormSetDefault(e.target.checked)}
                  style={{ accentColor: "var(--lf-gold)" }}
                />
                Usar como padrão
              </label>
            </div>
          </div>

          <div className="lf-field">
            <label className="lf-field__label">Anotações (opcional)</label>
            <input
              className="lf-input"
              type="text"
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
              placeholder="ex: chave de teste"
            />
          </div>

          <div
            className="lf-row"
            style={{ justifyContent: "flex-end", marginTop: 6, gap: 8 }}
          >
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="lf-btn lf-btn--ghost"
              disabled={submitting}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleRegister}
              className="lf-btn lf-btn--primary"
              disabled={submitting || validationStatus === "invalid" || validationStatus === "checking"}
              title={
                validationStatus === "invalid"
                  ? "Corrija a chave antes de cadastrar"
                  : validationStatus === "checking"
                    ? "Aguarde a validação terminar"
                    : "Cadastrar chave"
              }
            >
              {submitting
                ? "Cadastrando..."
                : validationStatus === "checking"
                  ? "Validando..."
                  : "Cadastrar"}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

/* ==================================================================
   TAB MARKDOWN — Arquivos de referência na memória do agente
   ================================================================== */
