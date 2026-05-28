import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { useRef } from "react";

interface TurnstileCaptchaProps {
  onTokenChange: (token: string | null) => void;
}

const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;

export function TurnstileCaptcha({ onTokenChange }: TurnstileCaptchaProps) {
  const ref = useRef<TurnstileInstance>(null);

  if (!siteKey?.trim()) {
    return (
      <p className="text-xs text-amber-400/90 m-0">
        Captcha não configurado. Defina <code className="text-[#eab308]">VITE_TURNSTILE_SITE_KEY</code> no{" "}
        <code className="text-[#eab308]">.env</code>.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <label className="block text-[11px] text-[#9898b0] uppercase tracking-wider">
        Verificação de segurança
      </label>
      <Turnstile
        ref={ref}
        siteKey={siteKey.trim()}
        options={{ theme: "dark", size: "flexible" }}
        onSuccess={(token) => onTokenChange(token)}
        onExpire={() => {
          onTokenChange(null);
          ref.current?.reset();
        }}
        onError={() => onTokenChange(null)}
      />
    </div>
  );
}
