-- The security advisor flagged both T7 RPCs as executable by the `anon` role.
-- `revoke ... from public` does NOT remove Supabase's default grant to anon, which
-- is a separate role. Neither function was exploitable — each raises
-- 'not authenticated' when auth.uid() is null — but an unauthenticated caller has
-- no business reaching them at all, so close the surface.
--
-- Applied to production 2026-07-26. Verified with has_function_privilege():
-- anon = false, authenticated = true for both.
revoke execute on function public.set_crew_self_service(uuid, jsonb, jsonb) from anon;
revoke execute on function public.set_crew_shopping_check(uuid, text, boolean) from anon;
