-- Job photos → Supabase Storage (off base64).
-- Private bucket `job-photos` (created via the dashboard) hardened here:
-- 5 MB cap, images only, and owner-only access scoped to a per-user folder.
-- Path convention enforced by the app: <user_id>/<job_id>.<ext>
--
-- The bucket itself is created in the dashboard / via:
--   insert into storage.buckets (id, name, public) values ('job-photos','job-photos', false);

update storage.buckets
   set public = false,
       file_size_limit = 5242880,                       -- 5 MB
       allowed_mime_types = array['image/jpeg','image/png','image/webp']
 where id = 'job-photos';

drop policy if exists "job photos owner read"   on storage.objects;
create policy "job photos owner read" on storage.objects
  for select to authenticated
  using (bucket_id = 'job-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "job photos owner insert" on storage.objects;
create policy "job photos owner insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'job-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "job photos owner update" on storage.objects;
create policy "job photos owner update" on storage.objects
  for update to authenticated
  using (bucket_id = 'job-photos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'job-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "job photos owner delete" on storage.objects;
create policy "job photos owner delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'job-photos' and (storage.foldername(name))[1] = auth.uid()::text);
