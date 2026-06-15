-- User feedback — feature requests + bug reports submitted from the calculator.
-- Rows are written server-side by the `submit-feedback` edge function (service
-- role), so there is NO client INSERT policy. The owner (admin uid) reads,
-- updates status, and deletes from the admin panel. Mirrors usage_events RLS.

create table if not exists public.feedback (
  id          bigint generated always as identity primary key,
  user_id     uuid references auth.users (id) on delete set null,
  user_email  text,
  user_name   text,
  company     text,
  plan        text,
  kind        text not null default 'feature',     -- 'feature' | 'bug'
  message     text not null,
  context     jsonb not null default '{}'::jsonb,   -- url, viewport, app version…
  status      text not null default 'new',          -- new | reviewing | done | dismissed
  created_at  timestamptz not null default now()
);

-- Row-level bounds against abuse.
alter table public.feedback
  add constraint feedback_kind_chk      check (kind in ('feature','bug')),
  add constraint feedback_status_chk    check (status in ('new','reviewing','done','dismissed')),
  add constraint feedback_msg_len       check (char_length(message) between 1 and 4000),
  add constraint feedback_email_len     check (char_length(coalesce(user_email,'')) <= 200),
  add constraint feedback_context_bytes check (pg_column_size(context) <= 8192);

create index if not exists feedback_created_idx on public.feedback (created_at desc);
create index if not exists feedback_status_idx  on public.feedback (status);

alter table public.feedback enable row level security;

-- No INSERT policy on purpose — the edge function inserts with the service role.
-- Owner/admin (same hardcoded uid as usage_events / quote_events) may read,
-- update status, and delete.
create policy "feedback admin read" on public.feedback
  for select to authenticated
  using (auth.uid() = '62ffcd5f-fb8c-4574-8942-0c273b399a17'::uuid);
create policy "feedback admin update" on public.feedback
  for update to authenticated
  using (auth.uid() = '62ffcd5f-fb8c-4574-8942-0c273b399a17'::uuid)
  with check (auth.uid() = '62ffcd5f-fb8c-4574-8942-0c273b399a17'::uuid);
create policy "feedback admin delete" on public.feedback
  for delete to authenticated
  using (auth.uid() = '62ffcd5f-fb8c-4574-8942-0c273b399a17'::uuid);

-- Live updates in the admin panel — add to the realtime publication (idempotent).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'feedback'
  ) then
    alter publication supabase_realtime add table public.feedback;
  end if;
end $$;
