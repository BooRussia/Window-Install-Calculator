-- Feedback photos — let users attach screenshots to a bug report / feature idea.
--
-- Two parts:
--  1) A private `feedback-photos` Storage bucket. Uploaders write/read/delete
--     ONLY their own folder (<user_id>/feedback/...). The owner/admin can READ
--     every object so the feedback inbox can sign URLs for the screenshots.
--  2) A `photos` jsonb column on public.feedback holding the storage paths
--     (the edge function writes it with the service role).
--
-- Mirrors the job-photos bucket hardening + the feedback table's admin RLS.

-- ── 1. Bucket ───────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('feedback-photos', 'feedback-photos', false)
on conflict (id) do nothing;

update storage.buckets
   set public = false,
       file_size_limit = 5242880,                       -- 5 MB
       allowed_mime_types = array['image/jpeg','image/png','image/webp']
 where id = 'feedback-photos';

-- Uploader: read / insert / delete inside their own top-level folder only.
drop policy if exists "feedback photos owner read" on storage.objects;
create policy "feedback photos owner read" on storage.objects
  for select to authenticated
  using (bucket_id = 'feedback-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "feedback photos owner insert" on storage.objects;
create policy "feedback photos owner insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'feedback-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "feedback photos owner delete" on storage.objects;
create policy "feedback photos owner delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'feedback-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- Admin/owner (same hardcoded uid as the feedback table) may READ every photo
-- so the inbox can sign URLs across all submitters.
drop policy if exists "feedback photos admin read" on storage.objects;
create policy "feedback photos admin read" on storage.objects
  for select to authenticated
  using (bucket_id = 'feedback-photos'
         and auth.uid() = '62ffcd5f-fb8c-4574-8942-0c273b399a17'::uuid);

-- ── 2. Column ───────────────────────────────────────────────────────────────
alter table public.feedback
  add column if not exists photos jsonb not null default '[]'::jsonb;

-- Bound count + size (each path is short; cap the whole array well under 2 KB).
alter table public.feedback
  drop constraint if exists feedback_photos_is_array,
  add  constraint feedback_photos_is_array  check (jsonb_typeof(photos) = 'array'),
  drop constraint if exists feedback_photos_count,
  add  constraint feedback_photos_count     check (jsonb_array_length(photos) <= 6),
  drop constraint if exists feedback_photos_bytes,
  add  constraint feedback_photos_bytes     check (pg_column_size(photos) <= 2048);
