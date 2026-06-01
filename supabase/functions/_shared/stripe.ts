// supabase/functions/_shared/stripe.ts
import { encode } from "https://deno.land/std@0.168.0/encoding/hex.ts";

export type StripeEnv = 'sandbox' | 'live';

export function getConnectionApiKey(env: StripeEnv): string {
  const key = env === 'sandbox'
    ? Deno.env.get('STRIPE_SANDBOX_API_KEY')
    : Deno.env.get('STRIPE_LIVE_API_KEY');
  if (!key) throw new Error(`STRIPE_${env.toUpperCase()}_API_KEY is not configured`);
  return key;
}

import Stripe from "https://esm.sh/stripe@18.5.0";

export function createStripeClient(env: StripeEnv): Stripe {
  const connectionApiKey = getConnectionApiKey(env);
  return new Stripe(connectionApiKey, {
    apiVersion: '2024-06-20',
  });
}
