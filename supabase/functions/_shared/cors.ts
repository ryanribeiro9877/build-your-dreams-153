const ALLOWED_ORIGINS = [
  Deno.env.get('ALLOWED_ORIGIN') || 'https://app.jurisai.com.br',
  'http://localhost:8080',
  'http://localhost:5173',
];

export function getCorsHeaders(req?: Request): Record<string, string> {
  const origin = req?.headers?.get("origin") || "";
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-integration-key",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  };
}

export const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGINS[0],
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-integration-key",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
