// stripe-webhook
// ─────────────────────────────────────────────────────────────────────────────
// Receives Stripe's webhook events and keeps our `profiles.data.entitlements`
// in sync with the subscription's real state.
//
// Events we care about (configure these in your Stripe webhook endpoint):
//   • checkout.session.completed          → user just paid → grant the plan
//   • customer.subscription.created       → (same as above, fires second)
//   • customer.subscription.updated       → plan change, status change
//   • customer.subscription.deleted       → cancellation took effect
//   • invoice.paid                        → cycle renewed → reset usage counter
//
// SECURITY: verify the Stripe-Signature header against STRIPE_WEBHOOK_SECRET.
// Without verification, anyone could POST to this endpoint and grant
// themselves the Unlimited plan.
//
// PHASE 3 STATUS: Functional. Requires STRIPE_SECRET_KEY +
// STRIPE_WEBHOOK_SECRET set, plus the webhook configured in Stripe pointing
// at this function's public URL. See PHASE_3_SETUP.md.

import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { stripe, planFromPriceId } from "../_shared/stripe.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";

const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });
  if (!STRIPE_WEBHOOK_SECRET) {
    console.error("[webhook] STRIPE_WEBHOOK_SECRET is not set");
    return new Response("Webhook secret not configured", { status: 500 });
  }

  // Stripe needs the raw body to verify the signature — DON'T await req.json().
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    // constructEventAsync (vs constructEvent) is required on Deno because the
    // Web Crypto API used for HMAC is async-only.
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      STRIPE_WEBHOOK_SECRET,
    );
  } catch (err) {
    console.error("[webhook] signature verification failed", err);
    return new Response("Invalid signature", { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;

      case "customer.subscription.created":
      case "customer.subscription.updated":
        await handleSubscriptionChanged(event.data.object as Stripe.Subscription);
        break;

      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      case "invoice.paid":
        await handleInvoicePaid(event.data.object as Stripe.Invoice);
        break;

      // Useful to log but no action needed:
      case "invoice.payment_failed":
        console.log("[webhook] payment_failed for", event.data.object);
        break;

      default:
        // Unhandled events are fine — Stripe sends a lot.
        console.log("[webhook] ignoring event type:", event.type);
    }
  } catch (err) {
    console.error("[webhook] handler error", err);
    // Return 500 so Stripe retries. (For poison events, return 200 to stop
    // retries — but log loudly so you can investigate.)
    return new Response("Handler error", { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Event handlers
// ─────────────────────────────────────────────────────────────────────────────

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const userId = session.client_reference_id;
  const customerId = typeof session.customer === "string"
    ? session.customer
    : session.customer?.id;
  if (!userId) {
    throw new Error("checkout.completed missing client_reference_id");
  }

  // Make sure stripe_customer_id is persisted (it should already be — the
  // checkout function writes it — but be defensive in case of race).
  if (customerId) {
    await supabaseAdmin
      .from("profiles")
      .update({ stripe_customer_id: customerId })
      .eq("id", userId);
  }

  // Pull the subscription so we can derive plan + cycleResetAt.
  if (session.subscription) {
    const subId = typeof session.subscription === "string"
      ? session.subscription
      : session.subscription.id;
    const sub = await stripe.subscriptions.retrieve(subId);
    await applySubscriptionToEntitlements(userId, sub);
  }
}

async function handleSubscriptionChanged(sub: Stripe.Subscription) {
  const userId = await userIdFromSubscription(sub);
  if (!userId) throw new Error(`Could not map subscription ${sub.id} to a user`);
  await applySubscriptionToEntitlements(userId, sub);
}

async function handleSubscriptionDeleted(sub: Stripe.Subscription) {
  const userId = await userIdFromSubscription(sub);
  if (!userId) throw new Error(`Could not map deleted subscription ${sub.id} to a user`);
  // Downgrade back to trial-with-zero-quotes — the frontend's Phase-4
  // lockdown can decide what to do (offer reactivation, etc.).
  await patchEntitlements(userId, {
    plan: "trial",
    subscriptionStatus: "canceled",
    quotesUsedThisCycle: 0,
    // Don't bump cycleResetAt — the trial window has already passed.
  });
}

async function handleInvoicePaid(invoice: Stripe.Invoice) {
  // invoice.paid fires every billing cycle. Use it to reset the usage counter.
  const subId = typeof invoice.subscription === "string"
    ? invoice.subscription
    : invoice.subscription?.id;
  if (!subId) return;
  const sub = await stripe.subscriptions.retrieve(subId);
  const userId = await userIdFromSubscription(sub);
  if (!userId) throw new Error(`Could not map paid invoice ${invoice.id} to a user`);
  await patchEntitlements(userId, {
    quotesUsedThisCycle: 0,
    cycleResetAt: sub.current_period_end * 1000,
    subscriptionStatus: sub.status,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function userIdFromSubscription(
  sub: Stripe.Subscription,
): Promise<string | null> {
  // Preferred: metadata we set at checkout time.
  const metaId = sub.metadata?.supabase_user_id;
  if (metaId) return metaId;
  // Fallback: look up by customer id on profiles.
  const customerId = typeof sub.customer === "string"
    ? sub.customer
    : sub.customer.id;
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  if (error) {
    console.error("[webhook] userIdFromSubscription lookup failed", error);
    return null;
  }
  return data?.id ?? null;
}

async function applySubscriptionToEntitlements(
  userId: string,
  sub: Stripe.Subscription,
) {
  const item = sub.items.data[0];
  if (!item) {
    throw new Error(`Subscription ${sub.id} has no items`);
  }
  const plan = planFromPriceId(item.price.id);
  if (!plan) {
    throw new Error(`Unknown Stripe price id ${item.price.id}; check plan registry`);
  }
  await patchEntitlements(userId, {
    plan,
    subscriptionStatus: sub.status,
    cycleResetAt: sub.current_period_end * 1000,
    planSetAt: Date.now(),
    // Don't zero quotesUsedThisCycle here — invoice.paid handles renewals.
    // For brand-new subscriptions (first checkout), the user hasn't used
    // anything yet so leaving it as-is is correct.
  });
}

async function patchEntitlements(
  userId: string,
  patch: Record<string, unknown>,
) {
  const { data: profile, error: pErr } = await supabaseAdmin
    .from("profiles")
    .select("data")
    .eq("id", userId)
    .maybeSingle();
  if (pErr) throw pErr;
  const data = profile?.data ?? {};
  data.config = data.config ?? {};
  data.config.entitlements = { ...(data.config.entitlements ?? {}), ...patch };
  const { error: upErr } = await supabaseAdmin
    .from("profiles")
    .update({ data })
    .eq("id", userId);
  if (upErr) throw upErr;
}
