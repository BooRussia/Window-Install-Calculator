# Phase 3 — Stripe Activation Checklist

Phase 3 ships **scaffold-only**: the code is wired and deployable, but the live
payment path stays dormant until you complete the steps below. Until then,
clicking a pricing CTA hits the edge function, gets a `503` with a clear
"placeholder" message, and the user sees the toast *"Stripe isn't wired up
yet — see PHASE_3_SETUP.md."*

**Estimated time:** 45–60 min from a fresh Stripe signup.

---

## 1. Create your Stripe account

1. Go to <https://dashboard.stripe.com/register>, sign up, verify email.
2. You'll land in **test mode** (banner at top). Keep it that way for now —
   we test the full loop before flipping the live switch.
3. **(Optional but recommended)** Activate your account — fill out business
   details under *Settings → Business settings → Public details*. Required
   before you can leave test mode, but not required to test.

## 2. Create the products + prices

You need **3 products** (Starter, Pro, Unlimited) with **2 prices each**
(monthly, annual) — 6 prices total.

In the Stripe dashboard → **Product catalog → Add product**:

| Product   | Monthly | Annual  |
|-----------|---------|---------|
| Starter   | $19     | $190    |
| Pro       | $49     | $490    |
| Unlimited | $99     | $990    |

For each product:
- **Name:** Anchor Starter / Anchor Pro / Anchor Unlimited
- **Billing:** Recurring, with two prices — one *Monthly* + one *Yearly*
- **Description:** copy from `index.html` PLANS[] tagline

After creating, each price has a `price_xxxxxxxxxxxxxx` ID — copy all 6.

> 💡 **Faster path with Stripe CLI** (optional)
> ```bash
> brew install stripe/stripe-cli/stripe
> stripe login
> stripe products create --name "Anchor Starter"   # repeat for Pro, Unlimited
> stripe prices create --product prod_xxx --unit-amount 1900 --currency usd \
>   --recurring[interval]=month
> # repeat for annual + the other two tiers
> ```

## 3. Wire price IDs into Supabase

The edge function reads price IDs from env vars (with hard-coded placeholders
as a fallback). Set them as Supabase secrets so a rotation doesn't need a
redeploy:

```bash
# in the project root
supabase secrets set \
  STRIPE_PRICE_STARTER_MONTHLY=price_xxx \
  STRIPE_PRICE_STARTER_ANNUAL=price_xxx \
  STRIPE_PRICE_PRO_MONTHLY=price_xxx \
  STRIPE_PRICE_PRO_ANNUAL=price_xxx \
  STRIPE_PRICE_UNLIMITED_MONTHLY=price_xxx \
  STRIPE_PRICE_UNLIMITED_ANNUAL=price_xxx
```

If you'd rather hard-code them, edit `PRICE_FALLBACKS` in
`supabase/functions/_shared/stripe.ts` — but the env-var route lets you
rotate IDs without touching code.

## 4. Set the Stripe API key

In Stripe dashboard → **Developers → API keys**, copy the **Secret key**
(starts `sk_test_...` in test mode). Then:

```bash
supabase secrets set STRIPE_SECRET_KEY=sk_test_xxxxxxxxxxxx
```

> 🔒 **Never commit this.** It's a root credential that can move real money
> in live mode.

## 5. Run the database migration

Adds `stripe_customer_id` to `profiles`, an index, RLS protection, and a
`v_user_entitlements` view for ops:

```bash
supabase db push
# or paste supabase/migrations/20260525000000_phase3_stripe.sql into the SQL
# Editor in the dashboard if you don't have the CLI linked yet.
```

## 6. Deploy the edge functions

```bash
supabase functions deploy create-checkout-session
supabase functions deploy create-portal-session
supabase functions deploy stripe-webhook
```

Each command prints the public URL — note the **stripe-webhook URL**, you
need it in the next step. It looks like:
`https://fzitkcvmbvyeilwzclme.functions.supabase.co/stripe-webhook`

## 7. Configure the webhook in Stripe

Stripe dashboard → **Developers → Webhooks → Add endpoint**:

- **Endpoint URL:** your stripe-webhook URL from step 6
- **Events to listen to** (click *Select events*):
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.paid`
  - `invoice.payment_failed`

After creating, click **Reveal signing secret** (`whsec_xxxxxxxxxxxx`):

```bash
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxx
```

Without this secret the webhook will 400 every event — Stripe shows them as
failed in the dashboard, which is the fastest way to spot the misconfig.

## 8. (Optional) Brand the Customer Portal

Stripe dashboard → **Settings → Billing → Customer portal**. Configure:
- Allowed actions (update payment method, cancel, switch plans)
- Show the products/prices users can switch between
- Branding (logo, colors)

Click **Save**. Copy the configuration ID (`bpc_xxxxxxxx`) and:

```bash
supabase secrets set STRIPE_PORTAL_CONFIG_ID=bpc_xxxxxxxx
```

If you skip this step, Stripe falls back to the default portal config —
still functional, just unbranded.

## 9. End-to-end smoke test (test mode)

1. Sign up a fresh user in the app.
2. Open the pricing page → click **Get Started** on Pro.
3. You should land on Stripe Checkout. Use card `4242 4242 4242 4242`,
   any future expiry, any CVC, any ZIP.
4. Complete payment. You're redirected to `/?checkout=success&...`.
5. The app should toast *"Subscription activated — welcome!"* and the
   usage badge should flip to **0 / 50 this month**.
6. Open the PFP dropdown — **Manage subscription** should now be visible.
   Clicking it opens the Stripe Customer Portal.
7. In Stripe dashboard → **Webhooks → [your endpoint] → Logs**, every
   recent event should show **200**.

**Smoke-test cycle reset:** in the Stripe dashboard, use *Test clock*
(*Workbench → Test clocks → Advance*) to skip 30 days. `invoice.paid` fires,
the webhook resets `quotesUsedThisCycle` to 0. Verify in the app.

## 10. Go live

When you're ready:
1. Stripe dashboard → toggle off **Test mode**
2. Re-create your 6 prices in live mode (test prices don't carry over)
3. Update all 6 `STRIPE_PRICE_*_*` secrets to the live `price_` IDs
4. Update `STRIPE_SECRET_KEY` to your live `sk_live_xxx` key
5. Create a fresh webhook endpoint in live mode → update
   `STRIPE_WEBHOOK_SECRET`
6. Smoke-test once with a real card you own (refund yourself afterwards)

---

## What Phase 3 left for Phase 4

Phase 3 makes payment **work**. Phase 4 will make running out of quota
actually **block** quote generation. Specifically:

- `attemptGenerateQuote()` in `index.html` (~line 8935) returns `true`
  unconditionally today — Phase 4 returns `false` when the user is out of
  quota / trial expired, with an upsell modal in between.
- The two `// PHASE 2` markers in the file flag exactly where to flip the
  switch.

That's a deliberate Phase 3 / Phase 4 split: ship payment, watch a few
real subscriptions land cleanly, *then* turn on enforcement.

---

## Troubleshooting

| Symptom                                                | Likely cause / fix                                                              |
|--------------------------------------------------------|---------------------------------------------------------------------------------|
| Toast: "Stripe isn't wired up yet"                     | Step 3 not done — price IDs still `price_PLACEHOLDER_*`                          |
| Stripe webhook page shows 400s on every event          | `STRIPE_WEBHOOK_SECRET` mismatch — re-copy from dashboard                       |
| Subscription completes but `plan` stays `trial`        | Webhook isn't firing or 5xx-ing. Check `supabase functions logs stripe-webhook` |
| "No Stripe customer for this user"                     | User hit Manage Subscription before ever checking out. Expected. Wait until they sub. |
| Checkout button does nothing                           | Open devtools → Network. The edge function call should be visible. Check the JSON `error` field. |
| Edge function logs: `STRIPE_SECRET_KEY is not set`     | Step 4 not done.                                                                |
