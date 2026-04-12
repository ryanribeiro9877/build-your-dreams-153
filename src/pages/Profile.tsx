import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "10px 14px", borderRadius: 8,
    background: "#16161f", border: "1px solid #252534", color: "#eeeef5",
    fontSize: 14, fontFamily: "'DM Sans', sans-serif", outline: "none", boxSizing: "border-box",
  };
  const labelStyle: React.CSSProperties = {
    display: "block", fontSize: 11, color: "#9898b0", marginBottom: 6,
    textTransform: "uppercase", letterSpacing: "0.08em",
  };

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#09090f", color: "#c9a84c" }}>
      Carregando...
    </div>
  );

  return (
    <div style={{
      minHeight: "100vh", background: "linear-gradient(135deg, #09090f 0%, #111118 50%, #09090f 100%)",
      fontFamily: "'DM Sans', sans-serif", padding: "40px 20px",
    }}>
      <div style={{ maxWidth: 520, margin: "0 auto" }}>
        <button onClick={() => navigate("/")} style={{
          background: "none", border: "1px solid #252534", color: "#9898b0",
          padding: "8px 16px", borderRadius: 8, cursor: "pointer", fontSize: 12, marginBottom: 24,
          fontFamily: "'DM Sans', sans-serif",
        }}>← Voltar</button>

        <div style={{
          padding: 32, borderRadius: 16, background: "#111118",
          border: "1px solid #252534", boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
        }}>
          {/* Avatar */}
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <div style={{
              width: 80, height: 80, borderRadius: "50%", margin: "0 auto 12px",
              background: "linear-gradient(135deg, #c9a84c, #e8c96a)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 32, fontWeight: 700, color: "#0a0a12",
              fontFamily: "'Cormorant Garamond', serif",
              boxShadow: "0 0 24px rgba(201,168,76,0.35)",
            }}>
              {displayName ? displayName[0].toUpperCase() : user?.email?.[0]?.toUpperCase() || "U"}
            </div>
            <div style={{ fontSize: 10, color: "#c9a84c", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em" }}>
              {roleLabel} ({primaryRole})
            </div>
            <div style={{ fontSize: 11, color: "#5a5a72", marginTop: 4 }}>{user?.email}</div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Nome completo</label>
            <input value={displayName} onChange={e => setDisplayName(e.target.value)} style={inputStyle} placeholder="Dr. João Silva" />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Cargo / Função</label>
            <input value={jobTitle} onChange={e => setJobTitle(e.target.value)} style={inputStyle} placeholder="Advogado Sênior" />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Departamento</label>
            <input value={department} onChange={e => setDepartment(e.target.value)} style={inputStyle} placeholder="Contencioso Cível" />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={labelStyle}>URL do Avatar (opcional)</label>
            <input value={avatarUrl} onChange={e => setAvatarUrl(e.target.value)} style={inputStyle} placeholder="https://..." />
          </div>

          <button onClick={handleSave} disabled={saving} style={{
            width: "100%", padding: "12px 0", borderRadius: 8, border: "none", cursor: "pointer",
            background: "linear-gradient(135deg, #c9a84c, #e8c96a)",
            color: "#0a0a12", fontSize: 14, fontWeight: 600,
            fontFamily: "'DM Sans', sans-serif",
            opacity: saving ? 0.7 : 1,
            boxShadow: "0 4px 20px rgba(201,168,76,0.3)",
          }}>
            {saving ? "Salvando..." : "Salvar Perfil"}
          </button>
        </div>
      </div>
    </div>
  );
}
