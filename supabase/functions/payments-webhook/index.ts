import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { type StripeEnv, createStripeClient, getConnectionApiKey } from "../_shared/stripe.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const env = (url.searchParams.get("env") || "sandbox") as StripeEnv;

  const webhookSecret = env === "sandbox"
    ? Deno.env.get("PAYMENTS_SANDBOX_WEBHOOK_SECRET")
    : Deno.env.get("PAYMENTS_LIVE_WEBHOOK_SECRET");

  if (!webhookSecret) {
    return new Response(JSON.stringify({ error: "Webhook secret not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return new Response(JSON.stringify({ error: "No signature" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let event: Stripe.Event;
  try {
    const stripe = createStripeClient(env);
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Webhook signature verification failed:", msg);
    return new Response(JSON.stringify({ error: "Invalid signature" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.userId;
    const tokenAmount = session.metadata?.tokenAmount;

    if (userId && tokenAmount) {
      const amount = parseInt(tokenAmount, 10);
      if (amount > 0) {
        // Idempotency guard: check if this webhook was already processed
        const { data: existing } = await supabase
          .from('token_transactions')
          .select('id')
          .eq('reference_id', session.id)
          .eq('transaction_type', 'purchase')
          .maybeSingle();

        if (existing) {
          console.log('Duplicate webhook delivery, skipping:', session.id);
          return new Response(JSON.stringify({ received: true, duplicate: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const { error: addErr } = await supabase.rpc("add_tokens", {
          p_user_id: userId,
          p_amount: amount,
          p_type: "purchase",
          p_description: `Recarga de ${amount} tokens via Stripe`,
          p_reference_id: session.id,
        });
        if (addErr) {
          // 23505 = unique_violation na constraint uq_token_transactions_reference:
          // entrega duplicada do mesmo evento (corrida com o SELECT acima) → idempotente.
          const isDuplicate = addErr.code === "23505" ||
            /uq_token_transactions_reference|duplicate key/i.test(addErr.message ?? "");
          if (isDuplicate) {
            console.log("Duplicate token grant blocked by DB constraint:", session.id);
            return new Response(JSON.stringify({ received: true, duplicate: true }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          // Falha real: NÃO confirmar ao Stripe (responder 5xx) para ele reenviar o
          // evento — evita que o cliente pague e fique sem os tokens, silenciosamente.
          console.error("add_tokens failed for session", session.id, addErr.message);
          return new Response(JSON.stringify({ error: "processing_failed" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        console.log(`Added ${amount} tokens to user ${userId}`);
      }
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
