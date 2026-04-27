import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Check for recovery token in URL hash
    const hash = window.location.hash;
    if (hash.includes("type=recovery")) {
      setReady(true);
    } else {
      // Listen for auth state change with recovery event
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
        if (event === "PASSWORD_RECOVERY") setReady(true);
      });
      return () => subscription.unsubscribe();
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { toast.error("As senhas não coincidem"); return; }
    if (password.length < 6) { toast.error("A senha deve ter pelo menos 6 caracteres"); return; }
    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Senha atualizada com sucesso!");
    navigate("/sistema");
  };

  const inputCss: React.CSSProperties = {
    width: "100%", padding: "10px 14px", borderRadius: 8,
    background: "#16161f", border: "1px solid #252534", color: "#eeeef5",
    fontSize: 14, fontFamily: "'DM Sans', sans-serif", outline: "none", boxSizing: "border-box",
  };

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "#09090f", fontFamily: "'DM Sans', sans-serif",
    }}>
      <div style={{
        width: "100%", maxWidth: 400, padding: 32, borderRadius: 16,
        background: "#111118", border: "1px solid #252534",
        boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
      }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 20, fontWeight: 600, color: "#eeeef5" }}> Nova Senha</div>
          <div style={{ fontSize: 12, color: "#5a5a72", marginTop: 8 }}>
            {ready ? "Digite sua nova senha abaixo." : "Verificando link de recuperação..."}
          </div>
        </div>

        {ready ? (
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 11, color: "#9898b0", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>Nova senha</label>
              <input type="password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" minLength={6} style={inputCss} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", fontSize: 11, color: "#9898b0", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>Confirmar senha</label>
              <input type="password" required value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Repita a senha" minLength={6} style={inputCss} />
            </div>
            <button type="submit" disabled={submitting} style={{
              width: "100%", padding: "12px 0", borderRadius: 8, border: "none", cursor: "pointer",
              background: "linear-gradient(135deg, #c9a84c, #e8c96a)", color: "#0a0a12",
              fontSize: 14, fontWeight: 600, fontFamily: "'DM Sans', sans-serif",
              opacity: submitting ? 0.7 : 1,
            }}>
              {submitting ? "Aguarde..." : "Atualizar Senha"}
            </button>
          </form>
        ) : (
          <div style={{ textAlign: "center", color: "#c9a84c", fontSize: 13, padding: "20px 0" }}>
            Aguardando verificação...
          </div>
        )}
      </div>
    </div>
  );
}
