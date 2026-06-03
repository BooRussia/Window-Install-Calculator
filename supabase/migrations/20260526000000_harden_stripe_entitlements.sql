-- Harden Stripe-managed entitlements.
-- Browser profile saves update the whole profiles.data JSON blob. Stripe state
-- must not be forgeable or clobbered by those client writes.

create or replace function public.profiles_safe_trial_entitlements()
returns jsonb
language sql
volatile
as $$
  select jsonb_build_object(
    'plan', 'trial',
    'subscriptionStatus', 'trialing',
    'trialStartedAt', floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
    'quotesUsedThisCycle', 0,
    'cycleResetAt', floor(extract(epoch from (clock_timestamp() + interval '14 days')) * 1000)::bigint,
    'planSetAt', floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
    'lastQuoteAt', null
  );
$$;

create or replace function public.profiles_with_entitlements(
  profile_data jsonb,
  entitlements jsonb
)
returns jsonb
language sql
immutable
as $$
  select jsonb_set(
    jsonb_set(
      coalesce(profile_data, '{}'::jsonb),
      '{config}',
      coalesce(profile_data->'config', '{}'::jsonb),
      true
    ),
    '{config,entitlements}',
    coalesce(entitlements, '{}'::jsonb),
    true
  );
$$;

create or replace function public.profiles_preserve_server_entitlements()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_role text := coalesce(auth.role(), '');
  old_entitlements jsonb;
  new_entitlements jsonb;
  merged_entitlements jsonb;
  protected_key text;
  protected_keys text[] := array[
    'plan',
    'subscriptionStatus',
    'trialStartedAt',
    'cycleResetAt',
    'planSetAt'
  ];
begin
  if current_role = 'service_role' then
    return NEW;
  end if;

  -- First client-created profile gets a safe trial record regardless of any
  -- localStorage tampering before signup, and cannot pre-seed a Stripe
  -- customer id that belongs to someone else.
  if TG_OP = 'INSERT' then
    NEW.stripe_customer_id = null;
    NEW.data = public.profiles_with_entitlements(
      NEW.data,
      public.profiles_safe_trial_entitlements()
    );
    return NEW;
  end if;

  if NEW.stripe_customer_id is distinct from OLD.stripe_customer_id then
    raise exception 'stripe_customer_id is read-only for normal users';
  end if;

  old_entitlements := OLD.data->'config'->'entitlements';
  if old_entitlements is null then
    old_entitlements := public.profiles_safe_trial_entitlements();
  end if;

  -- Settings actions like "restore defaults" may omit entitlements entirely.
  -- Treat omission as "leave subscription state alone", not deletion.
  if NEW.data->'config'->'entitlements' is null then
    NEW.data = public.profiles_with_entitlements(NEW.data, old_entitlements);
    return NEW;
  end if;

  new_entitlements := NEW.data->'config'->'entitlements';

  merged_entitlements := new_entitlements;
  foreach protected_key in array protected_keys loop
    if old_entitlements ? protected_key then
      merged_entitlements := jsonb_set(
        merged_entitlements,
        array[protected_key],
        old_entitlements->protected_key,
        true
      );
    else
      merged_entitlements := merged_entitlements - protected_key;
    end if;
  end loop;

  NEW.data = public.profiles_with_entitlements(NEW.data, merged_entitlements);
  return NEW;
end;
$$;

drop trigger if exists profiles_preserve_server_entitlements on public.profiles;
create trigger profiles_preserve_server_entitlements
  before insert or update on public.profiles
  for each row
  execute function public.profiles_preserve_server_entitlements();

-- Service-role-only helper for webhooks. It patches just
-- data.config.entitlements, so concurrent settings/profile edits are not lost.
create or replace function public.profiles_patch_entitlements(
  p_user_id uuid,
  p_patch jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  affected_rows integer;
begin
  update public.profiles
  set
    data = public.profiles_with_entitlements(
      data,
      coalesce(data->'config'->'entitlements', '{}'::jsonb) ||
        coalesce(p_patch, '{}'::jsonb)
    ),
    updated_at = now()
  where id = p_user_id;

  get diagnostics affected_rows = row_count;
  if affected_rows = 0 then
    raise exception 'profile % not found while patching entitlements', p_user_id;
  end if;
end;
$$;

revoke all on function public.profiles_safe_trial_entitlements() from public;
revoke all on function public.profiles_with_entitlements(jsonb, jsonb) from public;
revoke all on function public.profiles_preserve_server_entitlements() from public, anon, authenticated;
revoke all on function public.profiles_patch_entitlements(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.profiles_safe_trial_entitlements() to anon, authenticated, service_role;
grant execute on function public.profiles_with_entitlements(jsonb, jsonb) to anon, authenticated, service_role;
grant execute on function public.profiles_patch_entitlements(uuid, jsonb) to service_role;
