# Anchor — Pre-Launch QA & Security Review

_Reviewed: 2026-06-07 · Supabase project `fzitkcvmbvyeilwzclme` · deployed via Netlify from `main`._

**Bottom line:** No critical (data-leak / secret-exposure) issues. The app is in
good launch shape. Remaining items are a few **you-only** account toggles, a
legal/business step, and performance optimizations for scale.

---

## ✅ Verified solid

- **Row-Level Security:** all 18 public tables have RLS enabled with policies.
  No open/unprotected tables. `jobs`, `profiles`, `shared_quotes`, `quote_events`
  are owner-scoped.
- **Secrets:** the client (`index.html`) contains only the **public** anon key +
  project URL. No service-role key, Stripe secret, or xAI key is exposed
  client-side — they live in Supabase edge-function env (server-only). ✔
- **Edge functions** auth is correct:
  - `create-checkout-session`, `create-portal-session`, `extract-plan-openings` → **require JWT**.
  - `stripe-webhook` (Stripe signature), `proxy-fbc-pdf` (domain-whitelisted), `sign-quote` (uuid-token-gated) → **public by design**.
- **E-sign:** signing table is owner-only; the public signer path goes through a
  service-role edge function (token = unguessable uuid). Signature image/IP/UA
  never returned to the public. Voided/expired/signed states all handled.
- **Job photos:** now in a **private** Storage bucket, owner-folder RLS, signed-URL reads.

## ✅ Fixed during this review

- Revoked public/anon/authenticated **EXECUTE** on internal `SECURITY DEFINER`
  functions `profiles_block_stripe_customer_id_update` (trigger) and
  `rls_auto_enable` (one-shot helper).
- `fl-approvals` public bucket: dropped the broad **listing** policy (object
  reads via the public CDN endpoint are unaffected).
- `fl_missing`: replaced `WITH CHECK (true)` anonymous insert with a
  length-bounded check (keeps the public "report missing approval" feature,
  removes the oversized-payload abuse vector).
- Supabase security advisors went from **10 → 4** warnings.

---

## 🔴 Do before onboarding real customers (you-only)

1. **Enable leaked-password protection** — Supabase → Authentication → Policies →
   turn on "Leaked password protection" (HaveIBeenPwned). 1 click.
2. **Auth URL configuration** — Supabase → Authentication → URL Configuration:
   set your Netlify domain as **Site URL** and add it under **Redirect URLs**
   (covers magic-link, password-reset, OAuth redirects). Verify a password reset
   actually lands back on the live site.
3. **Legal** — the Terms/Privacy/Disclaimer/Cookies are solid templates but still
   carry `[REVIEW WITH COUNSEL]` flags. File the LLC, set the real effective date,
   and have an attorney review before you take paying customers. (See item under
   "Heads-up" about crew GPS tracking — it changes the privacy policy if launched.)

## 🟡 Heads-up — shared crew/GPS schema (separate job-tracker app)

The project contains a full **crew / organization / GPS-tracking / time-tracking**
schema that the deployed calculator does **not** use:
`organizations, org_members, org_settings, crews, crew_members,
job_crew_assignments, job_sites, member_profiles, member_field_settings,
member_locations, location_pings, trips, time_sessions`.

**Confirmed intentional:** this backs a separate **job-tracker app** (crew GPS +
time tracking) that will be bundled with — and eventually import jobs + material
lists from — the calculator, sharing this same Supabase project.

- It is **RLS-protected** (membership-based), so it is not a data-leak risk.
- The 3 remaining "SECURITY DEFINER callable" advisor warnings
  (`is_org_admin`, `user_org_role`, `user_org_ids`) are this app's RLS helpers —
  **leave them**.
- **When the tracker app launches:** `member_locations` / `location_pings` /
  `trips` store **employee GPS data**, which requires explicit employee consent
  and specific privacy-policy / employee-handbook language. Florida is a
  one-party state but employee location tracking still warrants written consent —
  flag this for the attorney review.
- **For the eventual calculator → tracker import:** the calculator's `jobs.data`
  (jsonb) already carries the material `rows`, scope, and totals, so importing a
  job + its material list into `job_sites` / `job_crew_assignments` is a clean
  mapping when you build that bridge.

## 🟢 Performance — address as you grow (not blockers)

- **`auth_rls_initplan`** (most worthwhile eventually): several RLS policies call
  `auth.uid()` directly; wrapping as `(select auth.uid())` stops per-row
  re-evaluation. Negligible at current volume; matters at thousands of rows.
- **Unindexed foreign keys** on org/crew tables + `quote_events.user_id` — add
  covering indexes if/when those tables get traffic.
- **Multiple permissive policies** on org/crew tables — consolidate the
  `*_manage` + `*_select` SELECT policies for a minor speedup.
- A few **unused indexes** (e.g. `shared_quotes_job_id_idx`) — harmless; revisit
  later.

## ✅ Frontend / mobile

- Full 375px sweep done: no page-level horizontal scroll on any screen or modal.
  Pricing comparison matrix scrolls within its own container (intended).
- Theme toggle is a consistent 40px tap target on mobile across all headers.

---

## Suggested order
1. Flip the 2 Supabase toggles (leaked-password + auth URLs). _~5 min, you._
2. Decide on the crew/GPS schema (keep dormant vs. plan to launch).
3. Attorney review + LLC filing + effective date. _business track._
4. (Later, at scale) the `(select auth.uid())` RLS optimization + FK indexes — I can do these in one migration whenever you want.
