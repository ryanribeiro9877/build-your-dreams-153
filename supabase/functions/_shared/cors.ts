const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') || 'https://app.jurisai.com.br';

export const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-integration-key",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
