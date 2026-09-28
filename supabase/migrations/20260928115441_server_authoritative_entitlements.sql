-- Server-authoritative entitlements (audit 2026-09-28)
--
-- The plan, subscription status, billing cycle and usage counters live in
-- profiles.data.config.entitlements. Until now the browser could write that
-- subtree like any other setting: one line in devtools
-- (DATA.config.entitlements.plan = 'unlimited'; saveData(DATA)) granted a paid
-- plan for free, and the edge functions trusted it (unlimited AI reads).
--
-- After this migration only trusted writers can change entitlements:
--   * the service role (Stripe webhook, admin-users, AI edge functions),
--   * direct SQL with no JWT (migrations, the dashboard),
--   * the SECURITY DEFINER RPCs below, which flag themselves for the
--     current transaction only.
-- A client write keeps every other setting but silently keeps the server's
-- entitlements, so old clients that still push the whole blob keep working.
--
-- Also moves the two client-side entitlement writes onto the server:
--   start_trial()   – the only way to start the 14-day / 8-quote trial
--   consume_quote() – atomic check-and-count for each new quote
-- and makes usage quotas monthly for annual plans (roll_quota_cycle), which
-- previously only reset once a year on the annual invoice.

-- ── 1. Guard the entitlements subtree ─────────────────────────────────────────
create or replace function public.profiles_protect_entitlements()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb;
begin
  if coalesce(auth.role(), 'service_role') = 'service_role'
     or current_setting('anchor.trusted_entitlements_write', true) = 'on' then
    return NEW;
  end if;

  if TG_OP = 'UPDATE' then
    v_old := OLD.data #> '{config,entitlements}';
  end if;

  if v_old is null then
    -- A client can never introduce entitlements of its own.
    NEW.data := coalesce(NEW.data, '{}'::jsonb) #- '{config,entitlements}';
  else
    NEW.data := jsonb_set(
      jsonb_set(coalesce(NEW.data, '{}'::jsonb), '{config}',
                coalesce(NEW.data->'config', '{}'::jsonb), true),
      '{config,entitlements}', v_old, true);
  end if;
  return NEW;
end;
$$;

revoke all on function public.profiles_protect_entitlements() from public, anon, authenticated;

drop trigger if exists profiles_protect_entitlements on public.profiles;
create trigger profiles_protect_entitlements
  before insert or update on public.profiles
  for each row
  execute function public.profiles_protect_entitlements();

-- The one trusted write path for the RPCs below. The flag is switched on for
-- exactly one UPDATE and off again, so nothing else in the transaction can
-- ride it. Not callable by clients.
create or replace function public.write_entitlements_trusted(p_uid uuid, p_ent jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('anchor.trusted_entitlements_write', 'on', true);
  update public.profiles
     set data = jsonb_set(
           jsonb_set(coalesce(data, '{}'::jsonb), '{config}',
                     coalesce(data->'config', '{}'::jsonb), true),
           '{config,entitlements}', p_ent, true)
   where id = p_uid;
  perform set_config('anchor.trusted_entitlements_write', 'off', true);
end;
$$;

revoke all on function public.write_entitlements_trusted(uuid, jsonb) from public, anon, authenticated;

-- ── 2. Monthly quota rollover ─────────────────────────────────────────────────
-- A paid plan in good standing whose quota window has ended gets fresh counters
-- and a window one calendar month later (repeated until it is in the future).
-- Monthly plans also reset on invoice.paid; annual plans rely on this so their
-- "per month" limits are actually per month. Trials, canceled and past-due
-- plans never roll.
create or replace function public.roll_quota_cycle(p_ent jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_now_ms bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_reset  bigint;
  v_ts     timestamptz;
  v_guard  int := 0;
begin
  if p_ent is null then return p_ent; end if;
  if coalesce(p_ent->>'plan', '') not in ('starter', 'pro', 'unlimited') then return p_ent; end if;
  if coalesce(p_ent->>'subscriptionStatus', 'active') not in ('active', 'trialing') then return p_ent; end if;
  v_reset := nullif(p_ent->>'cycleResetAt', '')::numeric::bigint;
  if v_reset is null or v_now_ms < v_reset then return p_ent; end if;

  v_ts := to_timestamp(v_reset / 1000.0);
  while (extract(epoch from v_ts) * 1000)::bigint <= v_now_ms and v_guard < 240 loop
    v_ts := v_ts + interval '1 month';
    v_guard := v_guard + 1;
  end loop;

  return p_ent || jsonb_build_object(
    'quotesUsedThisCycle', 0,
    'aiExtractionsUsedThisCycle', 0,
    'aiThumbnailsUsedThisCycle', 0,
    'cycleResetAt', (extract(epoch from v_ts) * 1000)::bigint
  );
end;
$$;

revoke all on function public.roll_quota_cycle(jsonb) from public, anon, authenticated;

-- ── 3. start_trial() ──────────────────────────────────────────────────────────
-- One trial per account: only an account that has never had a plan can start
-- one. Returns the account's entitlements either way. Keep TRIAL in index.html
-- (14 days, 8 quotes) in lockstep.
create or replace function public.start_trial()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_now_ms bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_ent    jsonb;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;

  insert into public.profiles (id, data) values (v_uid, '{}'::jsonb)
  on conflict (id) do nothing;

  select data #> '{config,entitlements}' into v_ent
    from public.profiles where id = v_uid for update;

  if v_ent is not null and coalesce(v_ent->>'plan', 'none') <> 'none' then
    return v_ent;
  end if;

  v_ent := jsonb_build_object(
    'plan', 'trial',
    'subscriptionStatus', 'trialing',
    'trialStartedAt', v_now_ms,
    'quotesUsedThisCycle', 0,
    'cycleResetAt', v_now_ms + 14::bigint * 86400000,
    'planSetAt', v_now_ms,
    'lastQuoteAt', null
  );

  perform public.write_entitlements_trusted(v_uid, v_ent);
  return v_ent;
end;
$$;

revoke all on function public.start_trial() from public, anon;
grant execute on function public.start_trial() to authenticated;

-- ── 4. consume_quote() ────────────────────────────────────────────────────────
-- Atomic check-and-count for one new quote (a fresh save, a new version, or a
-- draft promoted to final). Returns { allowed, reason, entitlements } so the
-- client can mirror the server's numbers. Limits mirror PLANS/TRIAL in
-- index.html: trial 8, starter 25, pro 200, unlimited no cap.
create or replace function public.consume_quote()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_now_ms bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_ent    jsonb;
  v_rolled jsonb;
  v_plan   text;
  v_status text;
  v_used   int;
  v_limit  int;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  -- The owner account is exempt everywhere (matches isAdmin() in index.html).
  if v_uid = '62ffcd5f-fb8c-4574-8942-0c273b399a17'::uuid then
    select data #> '{config,entitlements}' into v_ent from public.profiles where id = v_uid;
    return jsonb_build_object('allowed', true, 'reason', null, 'entitlements', v_ent);
  end if;

  select data #> '{config,entitlements}' into v_ent
    from public.profiles where id = v_uid for update;

  if v_ent is null or coalesce(v_ent->>'plan', 'none') in ('none', 'crew') then
    return jsonb_build_object('allowed', false, 'reason', 'no_plan', 'entitlements', v_ent);
  end if;

  v_rolled := public.roll_quota_cycle(v_ent);
  v_plan   := v_rolled->>'plan';
  v_status := coalesce(v_rolled->>'subscriptionStatus', 'active');
  v_used   := coalesce(nullif(v_rolled->>'quotesUsedThisCycle', '')::numeric, 0)::int;

  if v_plan = 'trial' then
    if v_now_ms >= coalesce(nullif(v_rolled->>'cycleResetAt', '')::numeric::bigint, 0) then
      return jsonb_build_object('allowed', false, 'reason', 'trial_expired', 'entitlements', v_rolled);
    end if;
    v_limit := 8;
  else
    if v_status not in ('active', 'trialing') then
      return jsonb_build_object('allowed', false, 'reason', 'subscription_inactive', 'entitlements', v_rolled);
    end if;
    v_limit := case v_plan when 'starter' then 25 when 'pro' then 200 else null end;
  end if;

  if v_limit is not null and v_used >= v_limit then
    if v_rolled is distinct from v_ent then
      perform public.write_entitlements_trusted(v_uid, v_rolled);
    end if;
    return jsonb_build_object('allowed', false, 'reason', 'limit_reached', 'entitlements', v_rolled);
  end if;

  v_rolled := v_rolled || jsonb_build_object('quotesUsedThisCycle', v_used + 1, 'lastQuoteAt', v_now_ms);
  perform public.write_entitlements_trusted(v_uid, v_rolled);

  return jsonb_build_object('allowed', true, 'reason', null, 'entitlements', v_rolled);
end;
$$;

revoke all on function public.consume_quote() from public, anon;
grant execute on function public.consume_quote() to authenticated;

-- ── 5. AI credits roll monthly too ────────────────────────────────────────────
-- Same contract as before (service role only, atomic, cap in the WHERE), but
-- an expired quota window is rolled first so annual plans get monthly AI reads.
create or replace function public.consume_ai_credit(p_user uuid, p_key text, p_cap int)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows   int;
  v_ent    jsonb;
  v_rolled jsonb;
begin
  select data #> '{config,entitlements}' into v_ent
    from public.profiles where id = p_user for update;
  if v_ent is not null then
    v_rolled := public.roll_quota_cycle(v_ent);
    if v_rolled is distinct from v_ent then
      update public.profiles
         set data = jsonb_set(data, '{config,entitlements}', v_rolled, true)
       where id = p_user;
    end if;
  end if;

  update public.profiles
     set data = jsonb_set(
           jsonb_set(
             jsonb_set(coalesce(data, '{}'::jsonb),
               '{config}', coalesce(data->'config', '{}'::jsonb), true),
             '{config,entitlements}',
             coalesce(data->'config'->'entitlements', '{}'::jsonb), true),
           array['config','entitlements', p_key],
           to_jsonb(coalesce((data#>>array['config','entitlements', p_key])::numeric, 0) + 1),
           true)
   where id = p_user
     and coalesce((data#>>array['config','entitlements', p_key])::numeric, 0) < p_cap;
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

revoke execute on function public.consume_ai_credit(uuid, text, int) from public, anon, authenticated;
grant execute on function public.consume_ai_credit(uuid, text, int) to service_role;

-- ── 6. Atomic entitlement patch (Stripe webhook, admin tools) ─────────────────
-- Merges p_patch into the entitlements subtree in ONE statement. The webhook used
-- to read the whole data blob and write it back, which could (a) revert a settings
-- edit that landed in between and (b) lose one of two closely-spaced Stripe
-- events. Returns the resulting entitlements (null if the profile doesn't exist).
create or replace function public.patch_entitlements(p_user uuid, p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ent jsonb;
begin
  update public.profiles
     set data = jsonb_set(
           jsonb_set(coalesce(data, '{}'::jsonb), '{config}',
                     coalesce(data->'config', '{}'::jsonb), true),
           '{config,entitlements}',
           coalesce(data #> '{config,entitlements}', '{}'::jsonb) || coalesce(p_patch, '{}'::jsonb),
           true)
   where id = p_user
  returning data #> '{config,entitlements}' into v_ent;
  return v_ent;
end;
$$;

revoke all on function public.patch_entitlements(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.patch_entitlements(uuid, jsonb) to service_role;
