import { useEffect, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { HexagonLoader } from "@/components/HexagonLoader";
import { usePermissions } from "@/hooks/usePermissions";
import { useMasterAdmin } from "@/hooks/useMasterAdmin";

const pageBg = "#09090f";
const cardBg = "#11111a";
const border = "#25253a";
const text2 = "#c4c4d4";
const gold = "#c9a84c";

export default function Admin() {
  const navigate = useNavigate();
  const { canAccessAdmin } = usePermissions();
  const { isMaster, checking } = useMasterAdmin();

  useEffect(() => {
    if (checking) return;
    if (!canAccessAdmin && !isMaster) {
      navigate("/sistema", { replace: true });
    }
  }, [checking, canAccessAdmin, isMaster, navigate]);

  if (checking) {
    return <HexagonLoader variant="fullscreen" label="Carregando" />;
  }

  if (!canAccessAdmin && !isMaster) {
    return null;
  }

  const btnBase: CSSProperties = {
    padding: "10px 18px",
    borderRadius: 8,
    cursor: "pointer",
    fontSize: 13,
    fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
    border: `1px solid ${border}`,
    background: cardBg,
    color: text2,
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: pageBg,
        color: "#eeeef5",
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
        padding: 20,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
        <button type="button" onClick={() => navigate("/sistema")} style={btnBase}>
          ← Voltar
        </button>
        <h1
          style={{
            fontFamily: "'Roboto', system-ui, sans-serif",
            fontSize: 24,
            fontWeight: 600,
            color: gold,
            margin: 0,
          }}
        >
          Painel de Administração
        </h1>
      </div>

      <p style={{ fontSize: 13, color: "#7a7a92", marginBottom: 20 }}>
        Atalhos de gestão do escritório.
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        {isMaster && (
          <>
            <button
              type="button"
              onClick={() => navigate("/sistema?criar=funcionario")}
              style={{
                ...btnBase,
                borderColor: "#eab308",
                color: "#facc15",
                fontWeight: 700,
              }}
            >
              Criar Funcionário
            </button>
            <button
              type="button"
              onClick={() => navigate("/admin/funcionarios")}
              style={{
                ...btnBase,
                borderColor: "#eab308",
                color: "#facc15",
                fontWeight: 600,
              }}
            >
              Ver Lista
            </button>
          </>
        )}
        {canAccessAdmin && (
          <>
            <button type="button" onClick={() => navigate("/admin/tokens")} style={{ ...btnBase, borderColor: gold, color: gold }}>
              Dashboard de Tokens
            </button>
            <button type="button" onClick={() => navigate("/admin/notificacoes")} style={btnBase}>
              Histórico de avisos
            </button>
            <button type="button" onClick={() => navigate("/admin/ui")} style={btnBase}>
              Eventos de UI
            </button>
            <button type="button" onClick={() => navigate("/admin/agentes")} style={btnBase}>
              Agentes IA
            </button>
          </>
        )}
      </div>
    </div>
  );
}
