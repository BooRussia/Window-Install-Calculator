// Stripe webhook handler — signature-verified, keeps profiles.entitlements in sync.
//
// SELF-CONTAINED ON PURPOSE: the Supabase MCP deploy tool flattens files into a
// single source dir and can't resolve `../_shared/*.ts` imports that escape it,
// so the Stripe client + plan map + admin client are inlined here rather than
// imported. The repo's _shared/*.ts files are still used by the other functions
// (create-checkout-session / create-portal-session). Keep this file and the
// deployed function in lockstep — edit here, then redeploy via MCP.
//
// API-version-tolerant: handles both 2024-06-20 and newer (≥2024-09-30) event
// shapes — see the accessor helpers below.
//
// Events we handle (configure these in the Stripe webhook endpoint):
//   • checkout.session.completed    → user just paid → grant the plan
//   • customer.subscription.created → (same as above, fires second)
//   • customer.subscription.updated → plan change, status change
//   • customer.subscription.deleted → cancellation took effect
//   • invoice.paid                  → cycle renewed → reset usage counters
//   • charge.refunded               → full refund → end service immediately
//
// SECURITY: verify the Stripe-Signature header against STRIPE_WEBHOOK_SECRET.
// (config.toml sets verify_jwt = false for this function — Stripe authenticates
// by signature, not a Supabase JWT.)

import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

if (!STRIPE_SECRET_KEY) console.error("[stripe] STRIPE_SECRET_KEY is not set.");
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("[supabase-admin] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env.");
}

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20",
  httpClient: Stripe.createFetchHttpClient(),
});

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ─────────────────────────────────────────────────────────────
// API-version-tolerant field accessors
//
// Webhook event payloads arrive in the *account's* API version, which can be
// newer than the SDK's pinned apiVersion. Stripe moved `current_period_end`
// from the Subscription root onto `items.data[i].current_period_end` (so a
// subscription can theoretically bill items on different cycles), and promoted
// `invoice.subscription` to `invoice.parent.subscription_details.subscription`.
// These helpers try the new shape first, then fall back to the legacy one, and
// return undefined when neither is present (e.g., one-off invoices).
// ─────────────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
function subCurrentPeriodEnd(sub: any): number | undefined {
  return sub?.items?.data?.[0]?.current_period_end ?? sub?.current_period_end;
}

// deno-lint-ignore no-explicit-any
function subCurrentPeriodStart(sub: any): number | undefined {
  return sub?.items?.data?.[0]?.current_period_start ?? sub?.current_period_start;
}

// Usage quotas are MONTHLY on every plan ("25 quotes per month"), but an annual
// subscription's billing period is a year — resetting only on invoice.paid gave
// annual customers one month's quota for the whole year. The quota window ends
// at the next monthly anniversary of the period start (never after the period
// end); the database's roll_quota_cycle() rolls it forward month by month.
// deno-lint-ignore no-explicit-any
function quotaWindowEndMs(sub: any): number | undefined {
  const endSec = subCurrentPeriodEnd(sub);
  if (!endSec) return undefined;
  const endMs = endSec * 1000;
  const startSec = subCurrentPeriodStart(sub);
  if (!startSec) return endMs;
  const start = new Date(startSec * 1000);
  const day = start.getUTCDate();
  const now = Date.now();
  for (let i = 1; i <= 24; i++) {
    const y = start.getUTCFullYear();
    const m = start.getUTCMonth() + i;
    const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const t = Date.UTC(y, m, Math.min(day, lastDay),
      start.getUTCHours(), start.getUTCMinutes(), start.getUTCSeconds());
    if (t > now) return Math.min(t, endMs);
  }
  return endMs;
}

// deno-lint-ignore no-explicit-any
function invoiceSubscriptionId(invoice: any): string | undefined {
  const sub = invoice?.parent?.subscription_details?.subscription
    ?? invoice?.subscription;
  if (!sub) return undefined;
  return typeof sub === "string" ? sub : sub.id;
}

// ─────────────────────────────────────────────────────────────
// Price-ID → plan reverse map. Reads STRIPE_PRICE_* env vars first so price IDs
// can rotate without a code redeploy; the PLACEHOLDER fallbacks just let the
// function compile before setup.
// ─────────────────────────────────────────────────────────────
type Plan = "starter" | "pro" | "unlimited";
type Cycle = "monthly" | "annual";

const PRICE_FALLBACKS: Record<Plan, Record<Cycle, string>> = {
  starter:   { monthly: "price_PLACEHOLDER_STARTER_MONTHLY", annual: "price_PLACEHOLDER_STARTER_ANNUAL" },
  pro:       { monthly: "price_PLACEHOLDER_PRO_MONTHLY",     annual: "price_PLACEHOLDER_PRO_ANNUAL" },
  unlimited: { monthly: "price_PLACEHOLDER_UNLIMITED_MONTHLY", annual: "price_PLACEHOLDER_UNLIMITED_ANNUAL" },
};

function priceIdFor(plan: Plan, cycle: Cycle): string {
  const envKey = `STRIPE_PRICE_${plan.toUpperCase()}_${cycle.toUpperCase()}`;
  return Deno.env.get(envKey) ?? PRICE_FALLBACKS[plan][cycle];
}

function planFromPriceId(priceId: string): Plan | null {
  for (const plan of ["starter", "pro", "unlimited"] as Plan[]) {
    for (const cycle of ["monthly", "annual"] as Cycle[]) {
      if (priceIdFor(plan, cycle) === priceId) return plan;
    }
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

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
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, STRIPE_WEBHOOK_SECRET);
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
      case "charge.refunded":
        await handleChargeRefunded(event.data.object as Stripe.Charge);
        break;
      case "invoice.payment_failed":
        console.log("[webhook] payment_failed for", event.data.object);
        break;
      default:
        console.log("[webhook] ignoring event type:", event.type);
    }
  } catch (err) {
    console.error("[webhook] handler error", err);
    // Return 500 so Stripe retries.
    return new Response("Handler error", { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const userId = session.client_reference_id;
  const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
  if (!userId) {
    console.warn("[webhook] checkout.completed missing client_reference_id");
    return;
  }
  if (customerId) {
    await supabaseAdmin.from("profiles").update({ stripe_customer_id: customerId }).eq("id", userId);
  }
  if (session.subscription) {
    const subId = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
    const sub = await stripe.subscriptions.retrieve(subId);
    await applySubscriptionToEntitlements(userId, sub);
  }
}

async function handleSubscriptionChanged(sub: Stripe.Subscription) {
  const userId = await userIdFromSubscription(sub);
  if (!userId) return;
  await applySubscriptionToEntitlements(userId, sub);
}

async function handleSubscriptionDeleted(sub: Stripe.Subscription) {
  const userId = await userIdFromSubscription(sub);
  if (!userId) return;
  // KEEP the real plan id — only flip the status to "canceled". If we downgrade
  // plan→"trial" here the frontend reads isTrialExpired() and shows the wrong
  // "your free trial ended" wall to someone who was a paying customer. With the
  // real plan retained, canGenerate() takes the subscription-inactive branch and
  // shows the correct "reactivate your subscription" messaging instead.
  // Don't bump cycleResetAt — there's no active cycle anymore.
  await patchEntitlements(userId, {
    subscriptionStatus: "canceled",
    cancelAtPeriodEnd: false,   // fully canceled now — clear the pending flag
  });
}

async function handleInvoicePaid(invoice: Stripe.Invoice) {
  // invoice.paid fires every billing cycle. Use it to reset the usage counters.
  const subId = invoiceSubscriptionId(invoice);
  if (!subId) return; // one-off invoice, no subscription — nothing to do
  const sub = await stripe.subscriptions.retrieve(subId);
  const userId = await userIdFromSubscription(sub);
  if (!userId) return;
  // Stripe retries and can replay events: never reset the counters twice for
  // the same invoice (a replayed invoice.paid would hand out a free fresh quota).
  const current = await getEntitlements(userId);
  if (current && current.lastInvoicePaidId === invoice.id) return;
  const periodEnd = subCurrentPeriodEnd(sub);
  const windowEnd = quotaWindowEndMs(sub);
  await patchEntitlements(userId, {
    // Reset ALL per-cycle usage counters on renewal — not just quotes. The AI
    // plan-read and thumbnail counters live in the same entitlements JSON and
    // are enforced server-side (consume_ai_credit). If we don't zero them here
    // they accumulate forever and the user is permanently capped on AI after
    // their first cycle, even though they keep paying.
    quotesUsedThisCycle: 0,
    aiExtractionsUsedThisCycle: 0,
    aiThumbnailsUsedThisCycle: 0,
    ...(windowEnd ? { cycleResetAt: windowEnd } : {}),
    ...(periodEnd ? { billingPeriodEnd: periodEnd * 1000 } : {}),
    subscriptionStatus: sub.status,
    lastInvoicePaidId: invoice.id,
  });
}

// The event payload arrives in the ACCOUNT's API version, and newer versions
// (2025-03-31.basil+) dropped `charge.invoice`. The SDK here is pinned to
// 2024-06-20, where Charge still carries `invoice` — so when the payload lacks
// it, re-read the charge through the SDK to get the legacy shape.
async function chargeInvoiceId(charge: Stripe.Charge): Promise<string | undefined> {
  // deno-lint-ignore no-explicit-any
  let invoice: any = (charge as any).invoice;
  if (!invoice) {
    const full = await stripe.charges.retrieve(charge.id);
    // deno-lint-ignore no-explicit-any
    invoice = (full as any).invoice;
  }
  if (!invoice) return undefined;
  return typeof invoice === "string" ? invoice : invoice.id;
}

// A FULL refund ends service immediately (per policy: cancel = end of period,
// cancel + refund = end now). Scope the cancellation to the subscription on the
// refunded charge's invoice; do not cancel every active subscription on the
// customer. Partial refunds are ignored — service continues. Cancelling also
// fires customer.subscription.deleted, which re-runs handleSubscriptionDeleted
// (idempotent with the patch here).
async function handleChargeRefunded(charge: Stripe.Charge) {
  if (!charge.refunded) return;   // only a FULL refund ends service early

  const invoiceId = await chargeInvoiceId(charge);
  if (!invoiceId) {
    console.warn("[webhook] refund charge has no invoice; not canceling subscription", charge.id);
    return;
  }

  const invoice = await stripe.invoices.retrieve(invoiceId);
  const subId = invoiceSubscriptionId(invoice);
  if (!subId) {
    console.warn("[webhook] refund invoice has no subscription; not canceling subscription", invoiceId);
    return;
  }

  const sub = await stripe.subscriptions.retrieve(subId);
  const userId = await userIdFromSubscription(sub);
  if (sub.status !== "canceled") {
    // Let errors escape so Stripe retries instead of acknowledging a refund
    // whose subscription was never actually canceled.
    await stripe.subscriptions.cancel(subId);
  }
  if (userId) await patchEntitlements(userId, { subscriptionStatus: "canceled", cancelAtPeriodEnd: false });
}

async function userIdFromSubscription(sub: Stripe.Subscription): Promise<string | null> {
  // Preferred: metadata we set at checkout time.
  const metaId = sub.metadata?.supabase_user_id;
  if (metaId) return metaId;
  // Fallback: look up by customer id on profiles.
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
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

async function applySubscriptionToEntitlements(userId: string, sub: Stripe.Subscription) {
  const item = sub.items.data[0];
  if (!item) {
    console.warn("[webhook] subscription has no items", sub.id);
    return;
  }
  const plan = planFromPriceId(item.price.id);
  if (!plan) {
    console.warn("[webhook] unknown price id", item.price.id, "(check plan registry)");
    return;
  }
  const periodEnd = subCurrentPeriodEnd(sub);
  const windowEnd = quotaWindowEndMs(sub);
  // A new plan (first purchase, trial conversion, upgrade) starts a fresh quota
  // window. Otherwise leave the window to invoice.paid and the monthly DB roll, so
  // an unrelated subscription update (card change, cancel toggle) can't stretch
  // or skip it.
  const current = (await getEntitlements(userId)) ?? {};
  const currentReset = Number(current.cycleResetAt) || 0;
  const newWindow = current.plan !== plan || !currentReset ||
    (periodEnd ? currentReset > periodEnd * 1000 : false);
  await patchEntitlements(userId, {
    plan,
    subscriptionStatus: sub.status,
    // Pending cancellation (Stripe portal "cancel" defaults to end-of-period).
    // The sub stays "active" until period end; we surface this so the app can
    // show "Canceling on <date>" while access continues. Resuming flips it back.
    cancelAtPeriodEnd: !!sub.cancel_at_period_end,
    ...(newWindow && windowEnd ? { cycleResetAt: windowEnd } : {}),
    ...(periodEnd ? { billingPeriodEnd: periodEnd * 1000 } : {}),
    planSetAt: Date.now(),
    // Don't zero quotesUsedThisCycle here — invoice.paid handles renewals. For a
    // brand-new subscription (first checkout) the user hasn't used anything yet,
    // so leaving the counters as-is is correct.
  });
}

// deno-lint-ignore no-explicit-any
async function getEntitlements(userId: string): Promise<Record<string, any> | null> {
  const { data: profile, error } = await supabaseAdmin
    .from("profiles")
    .select("data")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return profile?.data?.config?.entitlements ?? null;
}

// Atomic merge into profiles.data.config.entitlements (patch_entitlements RPC):
// one UPDATE, so it can't revert a settings edit that lands in between, and two
// closely-spaced events can't overwrite each other's fields.
async function patchEntitlements(userId: string, patch: Record<string, unknown>) {
  const { error } = await supabaseAdmin.rpc("patch_entitlements", { p_user: userId, p_patch: patch });
  if (error) throw error;
}
