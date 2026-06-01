import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, User, Save, Bell } from "lucide-react";
import { getLowBalanceThreshold, setLowBalanceThreshold } from "@/hooks/useTokenBalance";
import { LfPage, LfCard, LfInput, LfLabel, LfHeaderBackBtn, LfPrimaryBtn } from "@/lib/jurisaiShellTheme";
import { HexagonLoader } from "@/components/HexagonLoader";

export default function Profile() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { roleLabel, primaryRole } = usePermissions();
  const [displayName, setDisplayName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [department, setDepartment] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lowThreshold, setLowThresholdState] = useState<number>(10);

  const exit = () => navigate("/sistema");

  useEffect(() => { setLowThresholdState(getLowBalanceThreshold()); }, []);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle().then(({ data }) => {
      if (data) {
        setDisplayName(data.display_name || "");
        setJobTitle(data.job_title || "");
        setDepartment(data.department || "");
        setAvatarUrl(data.avatar_url || "");
      }
      setLoading(false);
    });
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({
      display_name: displayName,
      job_title: jobTitle,
      department,
      avatar_url: avatarUrl,
    }).eq("user_id", user.id);
    setSaving(false);
    if (error) toast.error("Erro ao salvar: " + error.message);
    else toast.success("Perfil atualizado!");
  };

  if (loading) {
    return (
      <div style={{ ...LfPage, minHeight: "100vh" }}>
        <HexagonLoader variant="fullscreen" />
      </div>
    );
  }

  return (
    <div style={{ ...LfPage, padding: "40px 20px" }}>
      <div style={{ maxWidth: 520, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 24 }}>
          <button type="button" className="lf-header-back-btn" onClick={exit} style={LfHeaderBackBtn} aria-label="Voltar">
            <ArrowLeft size={16} aria-hidden />
            Voltar
          </button>
        </div>

        <div style={{
          ...LfCard,
          padding: 32,
          borderRadius: 16,
          boxShadow: "0 12px 40px rgba(0,0,0,0.12)",
        }}
        >
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <div style={{
              width: 80, height: 80, borderRadius: "50%", margin: "0 auto 12px",
              background: "linear-gradient(135deg, #c9a84c, #e8c96a)",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 0 24px rgba(201,168,76,0.35)",
            }}>
              {avatarUrl ? (
                <img src={avatarUrl} alt="Avatar" style={{ width: 80, height: 80, borderRadius: "50%", objectFit: "cover" }} />
              ) : (
                <User size={36} color="#0a0a12" />
              )}
            </div>
            <div style={{ fontSize: 10, color: "#c9a84c", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em" }}>
              {roleLabel} ({primaryRole})
            </div>
            <div style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", marginTop: 4 }}>{user?.email}</div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={LfLabel}>Nome completo</label>
            <input value={displayName} onChange={e => setDisplayName(e.target.value)} style={LfInput} placeholder="Dr. João Silva" />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={LfLabel}>Cargo / Função</label>
            <input value={jobTitle} onChange={e => setJobTitle(e.target.value)} style={LfInput} placeholder="Advogado Sênior" />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={LfLabel}>Departamento</label>
            <input value={department} onChange={e => setDepartment(e.target.value)} style={LfInput} placeholder="Contencioso Cível" />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={LfLabel}>URL do Avatar (opcional)</label>
            <input value={avatarUrl} onChange={e => setAvatarUrl(e.target.value)} style={LfInput} placeholder="https://..." />
          </div>

          <div style={{
            marginBottom: 24, padding: 16, borderRadius: 10,
            background: "hsl(var(--muted))", border: "1px solid hsl(var(--border))",
          }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, color: "#c9a84c" }}>
              <Bell size={14} />
              <span style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Alertas de saldo
              </span>
            </div>
            <label style={LfLabel}>Avisar quando saldo ficar abaixo de</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="number"
                min={0}
                value={lowThreshold}
                onChange={(e) => setLowThresholdState(parseInt(e.target.value || "0", 10))}
                style={{ ...LfInput, flex: 1 }}
                placeholder="10"
              />
              <button
                type="button"
                onClick={() => { setLowBalanceThreshold(lowThreshold); toast.success(`Alerta configurado para ${lowThreshold} tokens`); }}
                style={{
                  padding: "0 16px", borderRadius: 8, border: "1px solid rgba(201,168,76,0.45)",
                  background: "transparent", color: "#c9a84c", cursor: "pointer", fontSize: 12, fontWeight: 600,
                }}
              >
                Aplicar
              </button>
            </div>
            <div style={{ fontSize: 10, color: "hsl(var(--muted-foreground))", marginTop: 6 }}>
              O aviso é exibido apenas uma vez por sessão. Reaparece se o saldo subir e cair novamente.
            </div>
          </div>

          <button type="button" onClick={handleSave} disabled={saving} style={{
            ...LfPrimaryBtn,
            width: "100%",
            padding: "12px 0",
            fontSize: 14,
            fontFamily: "'Roboto', sans-serif",
            opacity: saving ? 0.7 : 1,
            boxShadow: "0 4px 20px rgba(201,168,76,0.3)",
            justifyContent: "center",
          }}
          >
            <Save size={16} />
            {saving ? "Salvando..." : "Salvar Perfil"}
          </button>
        </div>
      </div>
    </div>
  );
}
