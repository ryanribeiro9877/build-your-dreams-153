export function TabIdentidade({
  agent,
}: {
  agent: {
    name: string;
    role: string;
    level: number;
    departmentName: string;
    description: string | null;
    permissions: string[];
    status: string;
  };
}) {
  return (
    <div className="lf-panel">
      <h2 className="lf-panel__title">Identidade</h2>
      <p className="lf-panel__hint">
        Informações estruturais do agente (somente leitura). Edição via SQL/migração.
      </p>

      <div className="lf-field">
        <label className="lf-field__label">Nome</label>
        <input className="lf-input" value={agent.name} readOnly style={{ opacity: 0.75 }} />
      </div>

      <div className="lf-fields-grid">
        <div className="lf-field">
          <label className="lf-field__label">Papel (role)</label>
          <input className="lf-input" value={agent.role} readOnly style={{ opacity: 0.75 }} />
        </div>
        <div className="lf-field">
          <label className="lf-field__label">Nível</label>
          <input className="lf-input" value={`N${agent.level}`} readOnly style={{ opacity: 0.75 }} />
        </div>
        <div className="lf-field">
          <label className="lf-field__label">Status</label>
          <input className="lf-input" value={agent.status} readOnly style={{ opacity: 0.75 }} />
        </div>
      </div>

      <div className="lf-field">
        <label className="lf-field__label">Departamento</label>
        <input
          className="lf-input"
          value={agent.departmentName || "—"}
          readOnly
          style={{ opacity: 0.75 }}
        />
      </div>

      <div className="lf-field">
        <label className="lf-field__label">Descrição</label>
        <textarea
          className="lf-textarea"
          value={agent.description || ""}
          readOnly
          rows={3}
          style={{ opacity: 0.75, resize: "none" }}
        />
      </div>

      {agent.permissions.length > 0 && (
        <div className="lf-field" style={{ marginBottom: 0 }}>
          <label className="lf-field__label">Permissões ({agent.permissions.length})</label>
          <div className="lf-row">
            {agent.permissions.map((p) => (
              <span key={p} className="lf-badge lf-badge--gold lf-badge--mono">
                {p}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
