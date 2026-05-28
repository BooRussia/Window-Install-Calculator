-- Protect Stripe-managed profile fields from browser/client writes.
--
-- Stripe webhooks update profiles.data.config.entitlements with the paid plan,
-- subscription status, billing-cycle reset, and usage state. Normal app saves
-- also write the whole profiles.data JSON blob, so a stale tab or DevTools edit
-- could otherwise overwrite the webhook-owned entitlement record.

create or replace function public.profiles_protect_stripe_managed_fields()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  incoming_data jsonb := coalesce(to_jsonb(NEW.data), '{}'::jsonb);
  previous_entitlements jsonb;
begin
  -- Edge functions use the service-role key and are the only writers allowed to
  -- set Stripe customer ids or entitlement state.
  if auth.role() = 'service_role' then
    return NEW;
  end if;

  if TG_OP = 'INSERT' then
    if NEW.stripe_customer_id is not null then
      raise exception 'stripe_customer_id is read-only for normal users';
    end if;

    -- New client-created profile rows must not seed paid/trial entitlements.
    NEW.data = incoming_data #- '{config,entitlements}';
    return NEW;
  end if;

  if NEW.stripe_customer_id is distinct from OLD.stripe_customer_id then
    raise exception 'stripe_customer_id is read-only for normal users';
  end if;

  previous_entitlements := coalesce(to_jsonb(OLD.data), '{}'::jsonb) #> '{config,entitlements}';

  if previous_entitlements is null then
    incoming_data := incoming_data #- '{config,entitlements}';
  else
    if jsonb_typeof(incoming_data->'config') is distinct from 'object' then
      incoming_data := jsonb_set(incoming_data, '{config}', '{}'::jsonb, true);
    end if;

    incoming_data := jsonb_set(
      incoming_data,
      '{config,entitlements}',
      previous_entitlements,
      true
    );
  end if;

  NEW.data = incoming_data;
  return NEW;
end;
$$;

drop trigger if exists profiles_protect_stripe_customer_id on public.profiles;
drop trigger if exists profiles_protect_stripe_managed_fields on public.profiles;

create trigger profiles_protect_stripe_managed_fields
  before insert or update on public.profiles
  for each row
  execute function public.profiles_protect_stripe_managed_fields();

drop function if exists public.profiles_block_stripe_customer_id_update();
