import { useState, lazy, Suspense } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft } from "lucide-react";
import { HexagonLoader } from "@/components/HexagonLoader";

const AgentScene3D = lazy(() => import("@/components/AgentScene3D"));


export default function Auth() {
  const { user, loading, signUp, signIn } = useAuth();
  const [mode, setMode] = useState<"login" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (loading) return <HexagonLoader variant="fullscreen" />;
  if (user) return <Navigate to="/sistema" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (mode === "login") {
        const { error } = await signIn(email, password);
        if (error) { toast.error(error.message); return; }
        toast.success("Login realizado com sucesso!");
      } else if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) { toast.error(error.message); return; }
        toast.success("Email de recuperação enviado! Verifique sua caixa de entrada.");
        setMode("login");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const inputCss: React.CSSProperties = {
    width: "100%", padding: "10px 14px", borderRadius: 8,
    background: "rgba(22,22,31,0.8)", border: "1px solid rgba(37,37,52,0.8)", color: "#eeeef5",
    fontSize: 14, fontFamily: "'DM Sans', sans-serif", outline: "none", boxSizing: "border-box",
    backdropFilter: "blur(8px)",
  };

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "#09090f", fontFamily: "'DM Sans', sans-serif",
      position: "relative", overflow: "hidden",
    }}>
      <Suspense fallback={null}>
        <AgentScene3D />
      </Suspense>

      <div style={{
        position: "absolute", inset: 0, zIndex: 1,
        background: "radial-gradient(ellipse at center, transparent 30%, #09090f 75%)",
        pointerEvents: "none",
      }} />

      <div style={{
        position: "relative", zIndex: 10,
        width: "100%", maxWidth: 420, padding: 32, borderRadius: 20,
        background: "rgba(17,17,24,0.85)", border: "1px solid rgba(201,168,76,0.15)",
        boxShadow: "0 30px 80px rgba(0,0,0,0.6), 0 0 60px rgba(201,168,76,0.08)",
        backdropFilter: "blur(20px)",
      }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14, margin: "0 auto 12px",
            background: "linear-gradient(145deg, #eab308 0%, #facc15 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 28, fontWeight: 800, color: "#0a0a12",
            fontFamily: "'League Spartan', 'Plus Jakarta Sans', system-ui, sans-serif",
            lineHeight: 1, letterSpacing: "-0.03em", paddingTop: 2,
            boxShadow: "0 2px 12px rgba(234, 179, 8, 0.22)",
          }}>J</div>
          <div style={{ fontFamily: "'Roboto', system-ui, sans-serif", fontSize: 24, fontWeight: 700, color: "#eeeef5", letterSpacing: "0.02em" }}>
            JurisAI
          </div>
          <div style={{ fontSize: 10, color: "#5a5a72", letterSpacing: "0.14em", textTransform: "uppercase", marginTop: 4 }}>
            Orquestração Inteligente Jurídica
          </div>
        </div>


        {mode === "forgot" && (
          <div style={{ marginBottom: 20 }}>
            <button onClick={() => setMode("login")} style={{
              background: "none", border: "none", color: "#5a5a72", cursor: "pointer",
              fontSize: 12, fontFamily: "'DM Sans', sans-serif", padding: 0,
              display: "flex", alignItems: "center", gap: 4,
            }}>
              <ArrowLeft size={12} /> Voltar ao login
            </button>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#eeeef5", marginTop: 12 }}>
              Recuperar senha
            </div>
            <div style={{ fontSize: 12, color: "#5a5a72", marginTop: 4 }}>
              Enviaremos um link de recuperação para seu email.
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 11, color: "#9898b0", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>Email</label>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="usuario@escritorio.com" style={inputCss} />
          </div>

          {mode !== "forgot" && (
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 11, color: "#9898b0", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>Senha</label>
              <input type="password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" minLength={6} style={inputCss} />
            </div>
          )}

          <button type="submit" disabled={submitting} style={{
            width: "100%", padding: "12px 0", borderRadius: 10, border: "none", cursor: "pointer",
            background: "linear-gradient(135deg, #c9a84c, #e8c96a)",
            color: "#0a0a12", fontSize: 14, fontWeight: 600,
            fontFamily: "'DM Sans', sans-serif",
            opacity: submitting ? 0.7 : 1,
            boxShadow: "0 4px 24px rgba(201,168,76,0.35)",
            transition: "all 0.3s",
          }}>
            {submitting ? "Aguarde..." : mode === "login" ? "Entrar no Sistema" : "Enviar Link de Recuperação"}
          </button>
        </form>

        <div style={{ textAlign: "center", marginTop: 14, fontSize: 11, color: "#5a5a72" }}>
          O cadastro e somente por convite. Solicite acesso ao administrador.
        </div>

        {mode === "login" && (
          <div style={{ textAlign: "center", marginTop: 16 }}>
            <button onClick={() => setMode("forgot")} style={{
              background: "none", border: "none", color: "#5a5a72", cursor: "pointer",
              fontSize: 12, fontFamily: "'DM Sans', sans-serif",
              transition: "color 0.2s",
            }}
              onMouseEnter={e => (e.currentTarget.style.color = "#c9a84c")}
              onMouseLeave={e => (e.currentTarget.style.color = "#5a5a72")}
            >
              Esqueceu sua senha?
            </button>
          </div>
        )}

        <div style={{
          marginTop: 20, height: 2, borderRadius: 1, overflow: "hidden",
          background: "rgba(37,37,52,0.4)",
        }}>
          <div style={{
            height: "100%", width: "30%", borderRadius: 1,
            background: "linear-gradient(90deg, transparent, #c9a84c, transparent)",
            animation: "shimmer 2s ease-in-out infinite",
          }} />
        </div>
        <style>{`@keyframes shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(400%); } }`}</style>
      </div>
    </div>
  );
}
