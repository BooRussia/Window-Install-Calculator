-- Phase 3 — Stripe scaffold
-- ────────────────────────────────────────────────────────────────────────────
-- Run via: supabase db push  (or paste into the SQL Editor in the dashboard)
--
-- What this does:
--   1. Adds `stripe_customer_id` to profiles so we can correlate Supabase
--      users with Stripe customers.
--   2. Indexes that column so the webhook's userIdFromSubscription() lookup
--      stays O(1) as the user table grows.
--   3. Tightens RLS so a user can read their own stripe_customer_id but
--      CAN'T set it (only the service role / edge functions can).
--
-- Idempotent — safe to re-run.

-- ── 1. Column ────────────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists stripe_customer_id text;

-- ── 2. Index ─────────────────────────────────────────────────────────────────
create index if not exists profiles_stripe_customer_id_idx
  on public.profiles (stripe_customer_id)
  where stripe_customer_id is not null;

-- ── 3. RLS — readable by owner, writable only by service role ────────────────
-- The existing profiles SELECT/UPDATE policies likely already cover the
-- column (users can read their own row, update their own row's `data`).
-- But UPDATE on stripe_customer_id from a normal user would be a vector
-- for fraud — block it with a column-level check.
--
-- Approach: a row-level trigger that blocks any non-service-role attempt to
-- change stripe_customer_id. Service-role connections bypass triggers that
-- check `auth.role()` so the edge functions still work.

create or replace function public.profiles_block_stripe_customer_id_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.stripe_customer_id is distinct from OLD.stripe_customer_id
     and auth.role() <> 'service_role' then
    raise exception 'stripe_customer_id is read-only for normal users';
  end if;
  return NEW;
end;
$$;

drop trigger if exists profiles_protect_stripe_customer_id on public.profiles;
create trigger profiles_protect_stripe_customer_id
  before update on public.profiles
  for each row
  execute function public.profiles_block_stripe_customer_id_update();

-- ── 4. Helper view (optional but handy in the SQL editor) ───────────────────
-- Flat view of every user's current plan + usage, pulled out of the
-- entitlements JSON. Useful for ops: "who's about to hit their limit?"
create or replace view public.v_user_entitlements as
select
  p.id                                                 as user_id,
  p.stripe_customer_id,
  p.data->'config'->'entitlements'->>'plan'            as plan,
  p.data->'config'->'entitlements'->>'subscriptionStatus' as subscription_status,
  (p.data->'config'->'entitlements'->>'quotesUsedThisCycle')::int as quotes_used,
  to_timestamp(((p.data->'config'->'entitlements'->>'cycleResetAt')::bigint) / 1000)
                                                       as cycle_reset_at,
  to_timestamp(((p.data->'config'->'entitlements'->>'planSetAt')::bigint) / 1000)
                                                       as plan_set_at
from public.profiles p;

-- Lock the view down to the owner of each row (and service role).
alter view public.v_user_entitlements set (security_invoker = true);
