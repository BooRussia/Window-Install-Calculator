-- Security hardening: stop internal SECURITY DEFINER functions from being
-- callable over the REST API (/rest/v1/rpc/...).
--
-- profiles_block_stripe_customer_id_update is a TRIGGER function — triggers
-- fire regardless of EXECUTE grants, so revoking direct EXECUTE is safe.
-- rls_auto_enable is a one-shot setup helper attached to no trigger; it should
-- never be invoked by clients.
--
-- NOTE: the org RLS helpers (is_org_admin/user_org_ids/user_org_role) are
-- intentionally left EXECUTE-able by authenticated — they are referenced by the
-- crew/org table RLS policies and only ever return the caller's own membership.

revoke execute on function public.profiles_block_stripe_customer_id_update() from public, anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
