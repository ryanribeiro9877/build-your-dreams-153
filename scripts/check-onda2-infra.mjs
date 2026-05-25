import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const name of [".env.local", ".env"]) {
  const p = join(root, name);
  if (!existsSync(p)) continue;
  let text = readFileSync(p, "utf8");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

const tables = ["model_pricing", "chat_sessions", "chat_messages", "llm_provider_configs"];
for (const t of tables) {
  const { error } = await admin.from(t).select("id").limit(1);
  console.log(t, error ? `MISSING (${error.message})` : "OK");
}

const { error: rpcErr } = await admin.rpc("start_chat_session", {
  p_entry_agent_id: "00000000-0000-0000-0000-000000000000",
  p_client_id: null,
  p_title: null,
});
console.log("rpc start_chat_session", rpcErr?.message ?? "callable");
