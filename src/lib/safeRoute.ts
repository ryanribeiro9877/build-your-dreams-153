/**
 * Saneamento de destino de navegação interna.
 *
 * POR QUE ISTO EXISTE: dois pontos do app navegam para uma string que não é
 * literal no código — o deep-link do sino (`notifications.route`, vem do BANCO)
 * e a restauração de rota após reload de chunk (`sessionStorage`, semeado a
 * partir de `window.location.pathname`). Uma string que comece com `//` é
 * reinterpretada como URL protocol-relative (`//evil.com` → `https://evil.com`)
 * e tira o usuário do domínio — é exatamente o open redirect descrito em
 * GHSA-2j2x-hqr9-3h42 / GHSA-wrjc-x8rr-h8h6 do react-router.
 *
 * A defesa fica AQUI, e não na versão da lib, de propósito: vale para qualquer
 * versão do react-router e continua valendo depois de um upgrade.
 */

/** Rota de fallback quando a entrada não é um caminho interno confiável. */
export const ROTA_INVALIDA = null;

/**
 * Caracteres de controle (NUL, tab, newline, DEL) quebram o parser de URL.
 * Feito por código de caractere e não por regex de propósito: um escape mal
 * escrito no literal vira um byte de controle de verdade e a checagem some.
 */
function temControle(s: string): boolean {
  for (let i = 0; i < s.length; i += 1) {
    const c = s.charCodeAt(i);
    if (c < 32 || c === 127) return true;
  }
  return false;
}

/**
 * Devolve o caminho apenas se ele for interno e inequívoco; caso contrário `null`.
 *
 * Aceita: `/sistema/tarefas`, `/clientes?x=1#y`.
 * Rejeita: `//evil.com`, `/\evil.com`, `https://evil.com`, `javascript:...`,
 * `mailto:...` e qualquer coisa que não comece por uma única `/`.
 */
export function safeInternalPath(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return ROTA_INVALIDA;
  const s = raw.trim();
  if (!s) return ROTA_INVALIDA;
  if (temControle(s)) return ROTA_INVALIDA;

  // Barras invertidas são normalizadas para `/` por vários navegadores, então
  // `/\evil.com` vira `//evil.com`. Normalizamos antes de julgar, nunca depois.
  const normalizado = s.replace(/\\/g, "/");

  // Tem que ser caminho absoluto do próprio app...
  if (!normalizado.startsWith("/")) return ROTA_INVALIDA;
  // ...e NÃO pode ser protocol-relative (`//host`), que sai do domínio.
  if (normalizado.startsWith("//")) return ROTA_INVALIDA;

  return normalizado;
}
