import { useEffect, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { HexagonLoader } from "@/components/HexagonLoader";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { useMasterAdmin } from "@/hooks/useMasterAdmin";
import { useMyWorkspace } from "@/hooks/useMyWorkspace";
import { isTechRole } from "@/components/DashboardRoute";

const pageBg = "#09090f";
const cardBg = "#11111a";
const border = "#25253a";
const text2 = "#c4c4d4";
const gold = "#c9a84c";

export default function Admin() {
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const { canAccessAdmin } = usePermissions();
  const { isMaster, checking } = useMasterAdmin();
  const { workspace, loading: wsLoading } = useMyWorkspace();
  const isTech = isTechRole(workspace?.role_template?.code) || hasRole("tech");
  const canOpen = canAccessAdmin || isMaster || isTech;

  useEffect(() => {
    if (checking || wsLoading) return;
    if (!canOpen) {
      navigate("/sistema", { replace: true });
    }
  }, [checking, wsLoading, canOpen, navigate]);

  if (checking || wsLoading) {
    return <HexagonLoader variant="fullscreen" label="Carregando" />;
  }

  if (!canOpen) {
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
        <button type="button" className="btn-voltar" onClick={() => navigate("/sistema")} style={btnBase}>
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
        {isTech && !canAccessAdmin
          ? "Atalhos técnicos do sistema."
          : "Atalhos de gestão do escritório."}
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
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
          </>
        )}
        {(canAccessAdmin || isTech) && (
          <button type="button" onClick={() => navigate("/tech/agentes")} style={btnBase}>
            Agentes IA
          </button>
        )}
        {isTech && (
          <>
            <button type="button" onClick={() => navigate("/dashboard-ia")} style={btnBase}>
              Dashboard IA
            </button>
            <button type="button" onClick={() => navigate("/tech/providers")} style={btnBase}>
              Providers
            </button>
            <button type="button" onClick={() => navigate("/tech/crons")} style={btnBase}>
              Crons
            </button>
            <button type="button" onClick={() => navigate("/tech/testes")} style={btnBase}>
              Testes
            </button>
          </>
        )}
      </div>
    </div>
  );
}
