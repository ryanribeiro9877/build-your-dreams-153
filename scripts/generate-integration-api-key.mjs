#!/usr/bin/env node
/**
 * Gera uma chave segura para INTEGRATION_API_KEY.
 * Uso: node scripts/generate-integration-api-key.mjs
 */
import { randomBytes } from "node:crypto";

const key = `jurisai_${randomBytes(32).toString("hex")}`;

console.log("\n=== JurisAI — Chave de integração ===\n");
console.log(key);
console.log("\nConfigure nos secrets do Supabase (edge function integration-api):\n");
console.log(`  INTEGRATION_API_KEY=${key}\n`);
console.log("Ou em supabase/.env.local para testes locais.\n");
console.log("NUNCA commite esta chave no Git.\n");
