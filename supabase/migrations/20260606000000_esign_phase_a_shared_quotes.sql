-- E-sign Phase A: shared_quotes — a frozen, server-side snapshot of a quote
-- created when an installer generates a "send for signature" link. The snapshot
-- locks the price/scope so it can't change after the customer signs. Signature
-- fields are filled later (Phase B/C) by a service-role edge function.
--
-- Security model: RLS is ON and the ONLY policy grants the OWNER access to their
-- own rows. The public signer path (read snapshot by token + submit signature)
-- runs through a service-role edge function that bypasses RLS, so anon/public
-- has NO direct access to this table.

create extension if not exists "pgcrypto";

create table if not exists public.shared_quotes (
  id                uuid primary key default gen_random_uuid(),  -- this id is the link token
  user_id           uuid not null references auth.users(id) on delete cascade,
  job_id            uuid,                                        -- source job (no FK; snapshot survives job deletion)
  snapshot          jsonb not null,                              -- frozen quote data for the sign page
  detail_level      text not null default 'summary'
                      check (detail_level in ('summary','itemized')),
  status            text not null default 'sent'
                      check (status in ('sent','viewed','signed','declined','void')),
  signer_name       text,
  signer_signature  text,                                        -- base64 drawn-signature image (filled at sign)
  signer_ip         text,
  signer_user_agent text,
  viewed_at         timestamptz,
  signed_at         timestamptz,
  expires_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists shared_quotes_user_id_idx on public.shared_quotes (user_id);
create index if not exists shared_quotes_status_idx  on public.shared_quotes (status);
create index if not exists shared_quotes_job_id_idx  on public.shared_quotes (job_id);

alter table public.shared_quotes enable row level security;

drop policy if exists "Owners manage their shared quotes" on public.shared_quotes;
create policy "Owners manage their shared quotes"
  on public.shared_quotes
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- keep updated_at current on writes (search_path pinned for hardening)
create or replace function public.shared_quotes_touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_shared_quotes_updated_at on public.shared_quotes;
create trigger trg_shared_quotes_updated_at
  before update on public.shared_quotes
  for each row execute function public.shared_quotes_touch_updated_at();
