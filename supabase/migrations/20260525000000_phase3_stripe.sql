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

-- ── 3. Billing fields — readable by owner, writable only by service role ─────
-- The existing profiles SELECT/UPDATE policies likely already cover the
-- column (users can read their own row, update their own row's `data`).
-- But UPDATE on stripe_customer_id from a normal user would be a vector
-- for fraud. The same applies to Stripe-managed entitlement fields inside
-- profiles.data: normal profile sync must not be able to self-grant a paid
-- plan or overwrite a paid plan that the webhook just wrote.
--
-- Approach: a row-level trigger that blocks any non-service-role attempt to
-- change billing-owned fields. Service-role connections bypass the checks so
-- the edge functions still work.

create or replace function public.profiles_block_stripe_customer_id_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_plan text;
  new_plan text;
  protects_paid_plan boolean;
begin
  new_plan := NEW.data #>> '{config,entitlements,plan}';

  if auth.role() <> 'service_role' then
    if TG_OP = 'INSERT' and NEW.stripe_customer_id is not null then
      raise exception 'stripe_customer_id is read-only for normal users';
    end if;

    if TG_OP = 'UPDATE'
       and NEW.stripe_customer_id is distinct from OLD.stripe_customer_id then
      raise exception 'stripe_customer_id is read-only for normal users';
    end if;

    if TG_OP = 'INSERT' then
      if coalesce(new_plan, 'trial') <> 'trial' then
        raise exception 'Stripe-managed entitlement plan is read-only for normal users';
      end if;
      return NEW;
    end if;

    old_plan := OLD.data #>> '{config,entitlements,plan}';
    protects_paid_plan :=
      coalesce(old_plan, 'trial') <> 'trial' or coalesce(new_plan, 'trial') <> 'trial';

    if old_plan is distinct from new_plan and protects_paid_plan then
      raise exception 'Stripe-managed entitlement plan is read-only for normal users';
    end if;

    if protects_paid_plan and (
      (NEW.data #>> '{config,entitlements,subscriptionStatus}') is distinct from (OLD.data #>> '{config,entitlements,subscriptionStatus}')
      or (NEW.data #>> '{config,entitlements,trialStartedAt}') is distinct from (OLD.data #>> '{config,entitlements,trialStartedAt}')
      or (NEW.data #>> '{config,entitlements,quotesUsedThisCycle}') is distinct from (OLD.data #>> '{config,entitlements,quotesUsedThisCycle}')
      or (NEW.data #>> '{config,entitlements,cycleResetAt}') is distinct from (OLD.data #>> '{config,entitlements,cycleResetAt}')
      or (NEW.data #>> '{config,entitlements,planSetAt}') is distinct from (OLD.data #>> '{config,entitlements,planSetAt}')
      or (NEW.data #>> '{config,entitlements,lastQuoteAt}') is distinct from (OLD.data #>> '{config,entitlements,lastQuoteAt}')
    ) then
      raise exception 'Stripe-managed entitlements are read-only for normal users';
    end if;
  end if;

  return NEW;
end;
$$;

drop trigger if exists profiles_protect_stripe_customer_id on public.profiles;
create trigger profiles_protect_stripe_customer_id
  before insert or update on public.profiles
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
