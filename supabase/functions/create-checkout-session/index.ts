// create-checkout-session
// ─────────────────────────────────────────────────────────────────────────────
// Called from the frontend when a user clicks a pricing tier CTA.
//
// Request:  POST  { plan: "starter"|"pro"|"unlimited", billing: "monthly"|"annual",
//                   returnUrl?: string }
// Response: 200   { url: <Stripe Checkout URL> }   → frontend redirects.
//
// Flow:
//   1. Verify the caller's Supabase JWT and extract the user.
//   2. Look up their profile. If they don't have a stripe_customer_id yet,
//      create a Stripe Customer and persist the ID.
//   3. Create a Stripe Checkout Session in `subscription` mode with the
//      matching price ID. Pass `client_reference_id = user.id` so the
//      webhook can correlate (in addition to the customer ID).
//   4. Return the Checkout URL.
//
// PHASE 3 STATUS: Functional code. Won't work end-to-end until you (a) set
// STRIPE_SECRET_KEY and (b) populate real price IDs. See PHASE_3_SETUP.md.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { stripe, priceIdFor, type Plan, type Cycle } from "../_shared/stripe.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import {
  corsHeaders,
  errorResponse,
  handlePreflight,
  jsonResponse,
  safeReturnUrl,
} from "../_shared/cors.ts";

const VALID_PLANS: Plan[] = ["starter", "pro", "unlimited"];
const VALID_CYCLES: Cycle[] = ["monthly", "annual"];

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  // ── 1. Auth: extract user from the Supabase JWT in the Authorization header
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return errorResponse("Missing bearer token", 401);
  }
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) return errorResponse("Invalid auth", 401);

  // ── 2. Parse + validate body
  let body: { plan?: string; billing?: string; returnUrl?: string };
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON body");
  }
  const plan = body.plan as Plan | undefined;
  const billing = body.billing as Cycle | undefined;
  if (!plan || !VALID_PLANS.includes(plan)) {
    return errorResponse(`Invalid plan. Expected one of: ${VALID_PLANS.join(", ")}`);
  }
  if (!billing || !VALID_CYCLES.includes(billing)) {
    return errorResponse(`Invalid billing. Expected one of: ${VALID_CYCLES.join(", ")}`);
  }
  const priceId = priceIdFor(plan, billing);
  if (priceId.startsWith("price_PLACEHOLDER_")) {
    return errorResponse(
      `Price ID for ${plan}/${billing} is still a placeholder. ` +
        "See PHASE_3_SETUP.md step 3.",
      503,
    );
  }

  // ── 3. Find-or-create the Stripe Customer for this user
  let stripeCustomerId: string | null = null;
  try {
    const { data: profile, error: pErr } = await supabaseAdmin
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .maybeSingle();
    if (pErr) throw pErr;
    stripeCustomerId = profile?.stripe_customer_id ?? null;
  } catch (err) {
    console.error("[checkout] profile lookup failed", err);
    return errorResponse("Profile lookup failed", 500);
  }

  if (!stripeCustomerId) {
    try {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: { supabase_user_id: user.id },
      });
      stripeCustomerId = customer.id;
      // Persist so the next checkout / portal call reuses the same customer.
      const { error: upErr } = await supabaseAdmin
        .from("profiles")
        .update({ stripe_customer_id: stripeCustomerId })
        .eq("id", user.id);
      if (upErr) {
        // Don't fatal — checkout can still proceed; webhook will reconcile.
        console.warn("[checkout] couldn't persist stripe_customer_id", upErr);
      }
    } catch (err) {
      console.error("[checkout] stripe customer create failed", err);
      return errorResponse("Could not create Stripe customer", 500);
    }
  }

  // ── 4. Create the Checkout Session
  // returnUrl is the page to send the user back to. We append ?checkout=success
  // or ?checkout=canceled so the frontend can show a toast + refresh.
  // Allowlisted: a client-supplied value may not redirect off our origins.
  const returnUrl = safeReturnUrl(body.returnUrl ?? req.headers.get("origin"));
  const successUrl = `${returnUrl}?checkout=success&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl  = `${returnUrl}?checkout=canceled`;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: stripeCustomerId,
      client_reference_id: user.id,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      // Let Stripe collect address/tax automatically (good for US compliance).
      automatic_tax: { enabled: false }, // flip to true once you've configured tax in Stripe
      allow_promotion_codes: true,
      subscription_data: {
        metadata: { supabase_user_id: user.id, plan, billing },
      },
    });
    return jsonResponse({ url: session.url });
  } catch (err) {
    console.error("[checkout] session create failed", err);
    return errorResponse("Could not start checkout", 500);
  }
});
