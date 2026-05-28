import { useEffect, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { HexagonLoader } from "@/components/HexagonLoader";
import { useMasterAdmin } from "@/hooks/useMasterAdmin";
import { usePermissions } from "@/hooks/usePermissions";
import { useTeamPresence } from "@/hooks/useTeamPresence";
import { useEmployeeRoster } from "@/hooks/useEmployeeRoster";

const pageBg = "#09090f";
const cardBg = "#11111a";
const border = "#25253a";
const text1 = "#eeeef5";
const text2 = "#c4c4d4";
const text3 = "#7a7a92";
const gold = "#eab308";

export default function AdminEmployees() {
  const navigate = useNavigate();
  const { isMaster, checking } = useMasterAdmin();
  const { canAccessAdmin } = usePermissions();
  const { isOnline } = useTeamPresence();
  const { members, loading, error } = useEmployeeRoster();

  const canView = isMaster || canAccessAdmin;

  useEffect(() => {
    if (checking) return;
    if (!canView) {
      navigate("/sistema", { replace: true });
    }
  }, [checking, canView, navigate]);

  if (checking || !canView) {
    return <HexagonLoader variant="fullscreen" label="Carregando" />;
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: pageBg,
        color: text1,
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
        padding: 20,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => navigate(isMaster ? "/sistema" : "/admin")}
          style={{
            padding: "8px 16px",
            borderRadius: 8,
            border: `1px solid ${border}`,
            background: cardBg,
            color: text2,
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          ← Voltar
        </button>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: gold, margin: 0 }}>Funcionários</h1>
        {isMaster && (
          <button
            type="button"
            onClick={() => navigate("/sistema?criar=funcionario")}
            style={{
              marginLeft: "auto",
              padding: "8px 16px",
              borderRadius: 8,
              border: `1px solid ${gold}`,
              background: "linear-gradient(145deg, rgba(234,179,8,0.2), rgba(250,204,21,0.1))",
              color: "#facc15",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            Criar Funcionário
          </button>
        )}
      </div>

      <p style={{ fontSize: 12, color: text3, marginBottom: 16, marginTop: 0 }}>
        Equipe com acesso ao sistema. Status de conexão em tempo real (usuários com a aba aberta na
        plataforma).
      </p>

      {loading ? (
        <HexagonLoader variant="inline" label="Carregando equipe..." />
      ) : error ? (
        <div
          style={{
            padding: 16,
            borderRadius: 12,
            border: "1px solid rgba(248,113,113,0.4)",
            background: "rgba(127,29,29,0.2)",
            color: "#fca5a5",
            fontSize: 14,
          }}
        >
          Não foi possível carregar a lista: {error}
        </div>
      ) : members.length === 0 ? (
        <div
          style={{
            padding: 24,
            borderRadius: 12,
            border: `1px solid ${border}`,
            background: cardBg,
            color: text3,
            fontSize: 14,
          }}
        >
          Nenhum funcionário cadastrado ainda.
        </div>
      ) : (
        <div style={{ borderRadius: 12, border: `1px solid ${border}`, overflow: "hidden", background: cardBg }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "#16161f", borderBottom: `1px solid ${border}` }}>
                <th style={thStyle}>Nome</th>
                <th style={thStyle}>Função</th>
                <th style={{ ...thStyle, width: 160 }}>Conexão</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m, i) => {
                const online = isOnline(m.user_id);
                return (
                  <tr
                    key={m.user_id}
                    style={{
                      borderBottom: i < members.length - 1 ? `1px solid ${border}` : undefined,
                    }}
                  >
                    <td style={{ padding: "14px 16px", color: text1, fontWeight: 500 }}>{m.name}</td>
                    <td style={{ padding: "14px 16px", color: text2 }}>{m.roleLabel}</td>
                    <td style={{ padding: "14px 16px" }}>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 8,
                          fontSize: 13,
                          fontWeight: 500,
                          color: online ? "#4ade80" : text3,
                        }}
                      >
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            background: online ? "#22c55e" : "#52525b",
                            boxShadow: online ? "0 0 8px rgba(34,197,94,0.6)" : "none",
                          }}
                          aria-hidden
                        />
                        {online ? "Online" : "Offline"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const thStyle: CSSProperties = {
  textAlign: "left",
  padding: "12px 16px",
  fontSize: 11,
  fontWeight: 600,
  color: "#9898b0",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
};
