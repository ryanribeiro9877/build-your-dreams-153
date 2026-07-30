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
  // DOIS estados de falha, deliberadamente separados: `expired` é o convite que
  // REALMENTE venceu (invite_expires_at no metadata) e `sessaoInvalida` é "não
  // consegui validar a sessão". Antes os dois caíam no mesmo texto de "prazo de
  // 24 horas ultrapassado", o que mandou a investigação caçar uma expiração que
  // não existia.
  const [expired, setExpired] = useState(false);
  const [sessaoInvalida, setSessaoInvalida] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let subscription: { unsubscribe: () => void } | undefined;

    const checkInviteExpiration = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled || !user) return;
      const expiresAt = user.user_metadata?.invite_expires_at;
      if (expiresAt && new Date(expiresAt).getTime() < Date.now()) {
        setExpired(true);
        setReady(false);
      }
    };

    const liberar = () => {
      if (cancelled) return;
      // Sessão encontrada: o relógio de 15s não tem mais o que vigiar. Antes ele
      // seguia correndo e marcava falha com o formulário já na tela (invisível
      // por causa do `!ready &&`, mas era estado mentindo sobre a realidade).
      if (timeout) { clearTimeout(timeout); timeout = undefined; }
      setSessaoInvalida(false);
      setReady(true);
      void checkInviteExpiration();
    };

    // CAMINHO 1 — link de convite/recuperação: o token vem no hash e o supabase-js
    // estabelece a sessão em seguida. Libera na hora (é o que já funcionava).
    const hash = window.location.hash;
    if (hash.includes("type=invite") || hash.includes("type=recovery") || hash.includes("access_token")) {
      liberar();
      return () => { cancelled = true; };
    }

    // CAMINHO 2 — SESSÃO JÁ EXISTENTE. Era o caso que travava: quem entra com
    // senha temporária criada pelo admin chega aqui pelo guard RequireActivation,
    // sem hash nenhum. Para uma sessão restaurada do storage o supabase-js emite
    // INITIAL_SESSION — não SIGNED_IN —, e como o código só ouvia
    // SIGNED_IN/PASSWORD_RECOVERY, `ready` nunca virava true: 15s depois a tela
    // acusava "convite expirado". getSession() resolve na hora e não depende de
    // evento algum.
    void (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;
      if (session) liberar();
    })();

    // CAMINHO 3 — sessão que chega DEPOIS (token do link ainda sendo processado,
    // refresh de token). Qualquer evento QUE TRAGA sessão serve: o que a tela
    // precisa é de sessão válida para o updateUser({password}), não de um evento
    // específico. Cobre INITIAL_SESSION, SIGNED_IN, PASSWORD_RECOVERY e
    // TOKEN_REFRESHED sem precisar listar nomes de evento.
    const sub = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) liberar();
    });
    subscription = sub.data.subscription;

    // Sem sessão em 15s: isso NÃO é convite expirado. É falha de validação, e a
    // mensagem tem de dizer isso.
    timeout = setTimeout(() => {
      if (!cancelled) setSessaoInvalida(true);
    }, 15000);

    return () => {
      cancelled = true;
      subscription?.unsubscribe();
      if (timeout) clearTimeout(timeout);
    };
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

    const { data: turnstileResult, error: turnstileError } = await supabase.functions.invoke('verify-turnstile', {
      body: { token: captchaToken }
    });
    if (turnstileError || !turnstileResult?.ok) {
      toast.error("Verificação de segurança falhou. Tente novamente.");
      setSubmitting(false);
      return;
    }

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setSubmitting(false);
      toast.error(error.message);
      return;
    }

    // Senha salva: só agora o convite é "concluído". Ativa o profile
    // (activation_status -> 'ativo') e SÓ libera o sistema se a ativação der
    // certo. Sem isso, a sessão de recovery continua 'pendente' e o guard
    // (RequireActivation) prende o usuário aqui — comportamento desejado.
    const { error: activateError } = await supabase.rpc("activate_own_profile");
    setSubmitting(false);

    if (activateError) {
      toast.error(
        "Sua senha foi salva, mas não conseguimos concluir a ativação. Tente novamente ou contate o administrador.",
      );
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

        {!ready && (expired || sessaoInvalida) ? (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            {/* Duas causas diferentes, dois textos diferentes: um aponta para o
                administrador reenviar o convite, o outro para reabrir o link ou
                entrar pelo login. Texto único aqui foi o que desviou a
                investigação para uma expiração que não existia. */}
            <div style={{ fontSize: 32, marginBottom: 12 }}>{expired ? "⏰" : "⚠"}</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#f87171", marginBottom: 8 }}>
              {expired ? "Convite expirado" : "Não foi possível validar a sessão"}
            </div>
            <div style={{ fontSize: 12, color: "#7a7a92", lineHeight: 1.6, marginBottom: 16 }}>
              {expired
                ? "O prazo de 24 horas para definir sua senha foi ultrapassado. Peça ao administrador para reenviar o convite."
                : "Não recebemos uma sessão válida nesta tela. Se você chegou por um link de convite, abra o link novamente; se já tem uma senha, entre pelo login e tente de novo. O convite NÃO expirou."}
            </div>
            <button
              type="button"
              onClick={() => navigate("/auth")}
              style={{
                padding: "10px 20px",
                borderRadius: 8,
                background: "#eab308",
                color: "#09090f",
                fontWeight: 600,
                fontSize: 13,
                border: "none",
                cursor: "pointer",
              }}
            >
              Ir para login
            </button>
          </div>
        ) : !ready ? (
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
