-- Owner analytics: persist product feature-usage events so the admin panel can
-- show how often each feature is used + where users get stuck.
--
-- Privacy: coarse only. The client `track()` shim writes the event name + safe
-- metadata (plan, counts, bands) — NEVER customer names or dollar amounts (the
-- analytics contract). RLS mirrors quote_events exactly: a user may insert ONLY
-- their own rows; only the owner (admin uid) may read.

create table if not exists public.usage_events (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  user_email  text,
  event       text not null,
  props       jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

-- Bound abuse: cap the event name + payload size at the row level.
alter table public.usage_events
  add constraint usage_events_event_len   check (char_length(event) between 1 and 80),
  add constraint usage_events_email_len   check (char_length(coalesce(user_email,'')) <= 200),
  add constraint usage_events_props_bytes check (pg_column_size(props) <= 4096);

create index if not exists usage_events_created_idx on public.usage_events (created_at desc);
create index if not exists usage_events_user_idx    on public.usage_events (user_id);
create index if not exists usage_events_event_idx   on public.usage_events (event);

alter table public.usage_events enable row level security;

-- Insert: authenticated users, own rows only (same as quote_events).
create policy "usage_events insert own" on public.usage_events
  for insert to authenticated
  with check (auth.uid() = user_id);

-- Read: owner/admin only (same hardcoded admin uid as quote_events / fl_missing).
create policy "usage_events admin read" on public.usage_events
  for select to authenticated
  using (auth.uid() = '62ffcd5f-fb8c-4574-8942-0c273b399a17'::uuid);

-- Delete: admin only (lets the owner purge from the admin panel).
create policy "usage_events admin delete" on public.usage_events
  for delete to authenticated
  using (auth.uid() = '62ffcd5f-fb8c-4574-8942-0c273b399a17'::uuid);

-- Admin-read on profiles so the Accounts view can show plan + last activity per
-- user. The owner already sees customer PII via quote_events; reading the
-- entitlement/plan slice of every profile is consistent with that owner scope.
create policy "profiles admin read" on public.profiles
  for select to authenticated
  using (auth.uid() = '62ffcd5f-fb8c-4574-8942-0c273b399a17'::uuid);
