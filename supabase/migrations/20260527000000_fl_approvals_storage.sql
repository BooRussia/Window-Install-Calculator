-- Phase A.2 — Hosting bucket for the FL product-approval index JSON
-- The 805 KB gzipped JSON is uploaded once via the dashboard or curl.
-- Public read so the app can fetch without auth on the landing page.
-- Only service_role can write (so a malicious user can't replace the file).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'fl-approvals',
  'fl-approvals',
  true,
  10485760,  -- 10 MB cap (file is 6.9 MB)
  array['application/json', 'application/gzip', 'application/octet-stream']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public read on fl-approvals" on storage.objects;
create policy "Public read on fl-approvals"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'fl-approvals');

drop policy if exists "Block writes on fl-approvals" on storage.objects;
create policy "Block writes on fl-approvals"
on storage.objects for insert
to anon, authenticated
with check (false);
