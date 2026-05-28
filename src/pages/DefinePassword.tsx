import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { TurnstileCaptcha } from "@/components/TurnstileCaptcha";
import { HexagonLoader } from "@/components/HexagonLoader";
import { PASSWORD_RULES_HINT, validatePassword } from "@/lib/passwordPolicy";

export default function DefinePassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [ready, setReady] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes("type=invite") || hash.includes("type=recovery") || hash.includes("access_token")) {
      setReady(true);
      return;
    }
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setReady(true);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!captchaToken) {
      toast.error("Complete a verificação de segurança (captcha).");
      return;
    }

    if (password !== confirm) {
      toast.error("As senhas não coincidem.");
      return;
    }

    const check = validatePassword(password);
    if (!check.valid) {
      toast.error(check.errors.join(" · "));
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSubmitting(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Senha definida com sucesso! Bem-vindo(a) ao JurisAI.");
    navigate("/sistema");
  };

  const inputCss: React.CSSProperties = {
    width: "100%",
    padding: "10px 14px",
    borderRadius: 8,
    background: "#16161f",
    border: "1px solid #25253a",
    color: "#eeeef5",
    fontSize: 14,
    fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
    outline: "none",
    boxSizing: "border-box",
  };

  const validation = validatePassword(password);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#09090f",
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
        padding: 16,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          padding: 32,
          borderRadius: 16,
          background: "#11111a",
          border: "1px solid #25253a",
          boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div
            style={{
              fontFamily: "'Roboto', sans-serif",
              fontSize: 22,
              fontWeight: 700,
              color: "#eab308",
              marginBottom: 8,
            }}
          >
            JurisAI
          </div>
          <div style={{ fontSize: 18, fontWeight: 600, color: "#eeeef5" }}>Defina sua senha</div>
          <div style={{ fontSize: 12, color: "#7a7a92", marginTop: 8 }}>{PASSWORD_RULES_HINT}</div>
        </div>

        {!ready ? (
          <HexagonLoader variant="inline" label="Validando convite..." />
        ) : (
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 16 }}>
              <label
                style={{
                  display: "block",
                  fontSize: 11,
                  color: "#9898b0",
                  marginBottom: 6,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                Nova senha
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={inputCss}
                autoComplete="new-password"
              />
              {password.length > 0 && !validation.valid && (
                <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 11, color: "#f87171" }}>
                  {validation.errors.map((err) => (
                    <li key={err}>{err}</li>
                  ))}
                </ul>
              )}
            </div>

            <div style={{ marginBottom: 16 }}>
              <label
                style={{
                  display: "block",
                  fontSize: 11,
                  color: "#9898b0",
                  marginBottom: 6,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                Confirmar senha
              </label>
              <input
                type="password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                style={inputCss}
                autoComplete="new-password"
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <TurnstileCaptcha onTokenChange={setCaptchaToken} />
            </div>

            <button
              type="submit"
              disabled={submitting || !captchaToken}
              style={{
                width: "100%",
                padding: "12px 0",
                borderRadius: 8,
                border: "none",
                cursor: captchaToken && !submitting ? "pointer" : "not-allowed",
                background: "linear-gradient(145deg, #eab308, #facc15)",
                color: "#0a0a12",
                fontSize: 14,
                fontWeight: 700,
                opacity: submitting || !captchaToken ? 0.6 : 1,
              }}
            >
              {submitting ? "Salvando..." : "Salvar senha e entrar"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
