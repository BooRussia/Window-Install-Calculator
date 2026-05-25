// create-portal-session
// ─────────────────────────────────────────────────────────────────────────────
// Opens a Stripe Customer Portal session — the hosted page where users can
// upgrade/downgrade, update payment method, cancel, and download invoices.
//
// Request:  POST  { returnUrl?: string }
// Response: 200   { url: <Stripe Portal URL> }
//
// PHASE 3 STATUS: Functional. Requires STRIPE_SECRET_KEY + the user to have
// completed checkout at least once (so they have a stripe_customer_id).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { stripe } from "../_shared/stripe.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import {
  errorResponse,
  handlePreflight,
  jsonResponse,
} from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  // ── Auth
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

  // ── Look up stripe_customer_id
  const { data: profile, error: pErr } = await supabaseAdmin
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .maybeSingle();
  if (pErr) {
    console.error("[portal] profile lookup failed", pErr);
    return errorResponse("Profile lookup failed", 500);
  }
  if (!profile?.stripe_customer_id) {
    return errorResponse(
      "No Stripe customer for this user. Subscribe first.",
      400,
    );
  }

  // ── Parse body for returnUrl
  let body: { returnUrl?: string } = {};
  try { body = await req.json(); } catch { /* empty body is fine */ }
  const returnUrl = body.returnUrl ?? req.headers.get("origin") ?? "";

  try {
    // If you've created a custom Portal configuration in Stripe (recommended
    // for branding + which actions you allow), set STRIPE_PORTAL_CONFIG_ID
    // and we'll use it; otherwise Stripe falls back to the default config.
    const portalConfigId = Deno.env.get("STRIPE_PORTAL_CONFIG_ID");
    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: returnUrl,
      ...(portalConfigId ? { configuration: portalConfigId } : {}),
    });
    return jsonResponse({ url: session.url });
  } catch (err) {
    console.error("[portal] session create failed", err);
    return errorResponse("Could not open billing portal", 500);
  }
});
