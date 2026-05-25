// Service-role Supabase client for Edge Functions.
//
// The service role bypasses RLS — we use it for two things:
//   1. The webhook updates rows on behalf of users (no JWT to impersonate).
//   2. The checkout/portal functions look up stripe_customer_id on profiles
//      (which RLS lets the user themselves read, but using service-role here
//      keeps the code path identical between user-initiated + webhook calls).
//
// SECURITY: SUPABASE_SERVICE_ROLE_KEY is a root key. Never expose it to the
// browser. It's set via `supabase secrets set` and stays on the Deno worker.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "[supabase-admin] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env. " +
      "These are auto-injected when you `supabase functions deploy`.",
  );
}

export const supabaseAdmin = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { persistSession: false, autoRefreshToken: false },
  },
);

// Helper: pull a user's profile row by user id. Returns the JSON `data` blob
// (which is where entitlements live) plus the stripe_customer_id column.
export async function getProfile(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, data, stripe_customer_id")
    .eq("id", userId)
    .single();
  if (error) throw error;
  return data;
}

// Helper: write back a partial entitlements patch by merging into
// profiles.data.config.entitlements. Atomic-ish at the row level.
export async function patchEntitlements(
  userId: string,
  patch: Record<string, unknown>,
) {
  const profile = await getProfile(userId);
  const data = profile.data ?? {};
  data.config = data.config ?? {};
  data.config.entitlements = { ...(data.config.entitlements ?? {}), ...patch };
  const { error } = await supabaseAdmin
    .from("profiles")
    .update({ data })
    .eq("id", userId);
  if (error) throw error;
}
