export interface PasswordValidationResult {
  valid: boolean;
  errors: string[];
}

/** Regras LGPD / segurança para senha de acesso */
export function validatePassword(password: string): PasswordValidationResult {
  const errors: string[] = [];

  if (password.length < 8) {
    errors.push("Mínimo de 8 caracteres");
  }
  if (!/[A-Z]/.test(password)) {
    errors.push("Pelo menos uma letra maiúscula");
  }
  if (!/[0-9]/.test(password)) {
    errors.push("Pelo menos um número");
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    errors.push("Pelo menos um caractere especial (!@#$%&* etc.)");
  }

  return { valid: errors.length === 0, errors };
}

export const PASSWORD_RULES_HINT =
  "Mínimo 8 caracteres, uma maiúscula, um número e um caractere especial.";
