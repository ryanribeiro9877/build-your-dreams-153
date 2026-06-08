// Cobrança de tokens.
//
// Enquanto o sistema NÃO está à venda, o consumo de tokens fica DESLIGADO:
// tokens infinitos, sem cobrança real e sem bloqueio por saldo. Toda a infra de
// tokens (RPCs, tabelas, tela de recarga) permanece intacta — basta voltar este
// flag para `true` quando for monetizar.
export const BILLING_ENABLED = false;

// Rótulo exibido no lugar do saldo numérico quando a cobrança está desligada.
export const UNLIMITED_LABEL = "∞";
