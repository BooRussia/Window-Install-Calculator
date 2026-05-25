// Shared Stripe client + plan mapping.
//
// PHASE 3 STATUS: All price IDs are placeholders. See PHASE_3_SETUP.md for
// how to swap them out once your Stripe account is created.
//
// Why a Deno-compatible Stripe import (esm.sh)? Supabase Edge Functions run
// on Deno Deploy, so we can't use the npm Stripe SDK directly. esm.sh wraps
// the official SDK as an ES module that Deno can import.

import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";

if (!STRIPE_SECRET_KEY) {
  // Don't throw at module load — let each function decide how to handle it.
  // Logging here surfaces the misconfig in `supabase functions logs`.
  console.error(
    "[stripe] STRIPE_SECRET_KEY is not set. " +
      "Run: supabase secrets set STRIPE_SECRET_KEY=sk_test_...",
  );
}

export const stripe = new Stripe(STRIPE_SECRET_KEY, {
  // Use the API version your account is pinned to. 2024-06-20 is the latest
  // GA at scaffold time — adjust if Stripe bumps you.
  apiVersion: "2024-06-20",
  // Deno-compatible HTTP client.
  httpClient: Stripe.createFetchHttpClient(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Price ID registry
// ─────────────────────────────────────────────────────────────────────────────
// Maps the (plan, billing-cycle) pair the frontend sends to a Stripe price ID.
// Replace the `price_PLACEHOLDER_*` values with real IDs from your Stripe
// dashboard — see PHASE_3_SETUP.md step 3.
//
// We read from env vars first so you can rotate price IDs without redeploying
// code (`supabase secrets set STRIPE_PRICE_STARTER_MONTHLY=price_xxx`).
// Hard-coded fallbacks are just stubs so the function compiles before setup.

type Plan = "starter" | "pro" | "unlimited";
type Cycle = "monthly" | "annual";

const PRICE_FALLBACKS: Record<Plan, Record<Cycle, string>> = {
  starter:   { monthly: "price_PLACEHOLDER_STARTER_MONTHLY",
               annual:  "price_PLACEHOLDER_STARTER_ANNUAL" },
  pro:       { monthly: "price_PLACEHOLDER_PRO_MONTHLY",
               annual:  "price_PLACEHOLDER_PRO_ANNUAL" },
  unlimited: { monthly: "price_PLACEHOLDER_UNLIMITED_MONTHLY",
               annual:  "price_PLACEHOLDER_UNLIMITED_ANNUAL" },
};

export function priceIdFor(plan: Plan, cycle: Cycle): string {
  const envKey = `STRIPE_PRICE_${plan.toUpperCase()}_${cycle.toUpperCase()}`;
  return Deno.env.get(envKey) ?? PRICE_FALLBACKS[plan][cycle];
}

// Reverse map: Stripe price ID → plan. Used by the webhook to translate
// subscription.items[0].price.id back into our plan slug.
export function planFromPriceId(priceId: string): Plan | null {
  for (const plan of ["starter", "pro", "unlimited"] as Plan[]) {
    for (const cycle of ["monthly", "annual"] as Cycle[]) {
      if (priceIdFor(plan, cycle) === priceId) return plan;
    }
  }
  return null;
}

export type { Plan, Cycle };
