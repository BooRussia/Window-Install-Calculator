-- Protect server-owned entitlements from browser profile sync.
--
-- profiles.data is intentionally client-writable for rates, brand settings, and
-- other local app state, but data.config.entitlements is used by edge functions
-- as trusted billing/AI quota state. Preserve that JSON subtree on all
-- non-service updates so stale tabs or forged localStorage cannot grant paid
-- access or erase server-side AI usage debits.

create or replace function public.profiles_block_stripe_customer_id_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now_ms bigint := floor(extract(epoch from statement_timestamp()) * 1000)::bigint;
  v_default_entitlements jsonb := jsonb_build_object(
    'plan', 'trial',
    'subscriptionStatus', 'trialing',
    'trialStartedAt', v_now_ms,
    'quotesUsedThisCycle', 0,
    'cycleResetAt', v_now_ms + (14 * 86400 * 1000),
    'planSetAt', v_now_ms,
    'lastQuoteAt', null
  );
  v_preserved_entitlements jsonb;
begin
  if auth.role() = 'service_role' then
    return NEW;
  end if;

  if TG_OP = 'INSERT' then
    -- A new profile may be seeded from localStorage, but the initial trial grant
    -- must be minted by the database rather than trusted from the browser.
    NEW.stripe_customer_id := null;
    if jsonb_typeof(NEW.data) is distinct from 'object' then
      NEW.data := '{}'::jsonb;
    end if;
    if jsonb_typeof(NEW.data->'config') is distinct from 'object' then
      NEW.data := jsonb_set(NEW.data, '{config}', '{}'::jsonb, true);
    end if;
    NEW.data := jsonb_set(NEW.data, '{config,entitlements}', v_default_entitlements, true);
    return NEW;
  end if;

  if NEW.stripe_customer_id is distinct from OLD.stripe_customer_id then
    raise exception 'stripe_customer_id is read-only for normal users';
  end if;

  v_preserved_entitlements := coalesce(
    OLD.data#>'{config,entitlements}',
    v_default_entitlements
  );

  if NEW.data#>'{config,entitlements}' is distinct from v_preserved_entitlements then
    if jsonb_typeof(NEW.data) is distinct from 'object' then
      NEW.data := '{}'::jsonb;
    end if;
    if jsonb_typeof(NEW.data->'config') is distinct from 'object' then
      NEW.data := jsonb_set(NEW.data, '{config}', '{}'::jsonb, true);
    end if;
    NEW.data := jsonb_set(NEW.data, '{config,entitlements}', v_preserved_entitlements, true);
  end if;

  return NEW;
end;
$$;

drop trigger if exists profiles_protect_stripe_customer_id on public.profiles;
create trigger profiles_protect_stripe_customer_id
  before insert or update on public.profiles
  for each row
  execute function public.profiles_block_stripe_customer_id_update();

revoke execute on function public.profiles_block_stripe_customer_id_update()
  from public, anon, authenticated;
