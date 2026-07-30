// admin-users — owner-only account management for the in-app Admin panel.
//
// WHY THIS IS A FUNCTION AND NOT CLIENT CODE
// The browser cannot do any of this, by design:
//   * profiles UPDATE is `auth.uid() = id` (own row only), so the client cannot
//     change another account's plan. That policy is the protection that stopped
//     clients overwriting Stripe entitlements; this function is the ONE sanctioned
//     way around it, not a hole in it.
//   * deleting an auth user needs the service role, which must never ship to a
//     browser.
//
// TRUST BOUNDARY
// The caller's JWT is verified server-side and their identity checked against
// ADMIN_UID / ADMIN_EMAILS. The client's own isAdmin() is a UI convenience and is
// NEVER trusted here — a non-admin calling this endpoint directly gets 403.
//
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_UID, ADMIN_EMAILS.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ADMIN_UID = Deno.env.get("ADMIN_UID") ?? "";
const ADMIN_EMAILS = (Deno.env.get("ADMIN_EMAILS") ?? "")
  .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function isAdminUser(user: { id?: string; email?: string } | null): boolean {
  if (!user) return false;
  if (ADMIN_UID && user.id === ADMIN_UID) return true;
  const em = (user.email ?? "").toLowerCase();
  return !!em && ADMIN_EMAILS.includes(em);
}

// Plans the panel may assign. Mirrors the client's PLANS ids; "none" is the
// pre-trial state a brand-new account sits in.
const ASSIGNABLE = ["none", "trial", "starter", "pro", "unlimited", "crew"];

const DAY = 86400000;

/** Read a profile's settings blob (the app stores everything under `data`). */
async function getProfileData(userId: string): Promise<Record<string, unknown>> {
  const { data, error } = await admin.from("profiles")
    .select("data").eq("id", userId).maybeSingle();
  if (error) throw error;
  return (data?.data as Record<string, unknown>) ?? {};
}

/** Write entitlements back, preserving everything else in the blob. */
async function patchEntitlements(userId: string, patch: Record<string, unknown>) {
  const data = await getProfileData(userId);
  const config = (data.config as Record<string, unknown>) ?? {};
  const ents = (config.entitlements as Record<string, unknown>) ?? {};
  config.entitlements = { ...ents, ...patch };
  data.config = config;
  const { error } = await admin.from("profiles")
    .upsert({ id: userId, data, updated_at: new Date().toISOString() });
  if (error) throw error;
  return config.entitlements;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "Missing authorization" }, 401);

    const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
    if (userErr || !userData?.user) return json({ error: "Invalid token" }, 401);
    const caller = userData.user;
    if (!isAdminUser(caller)) return json({ error: "Not permitted" }, 403);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "");

    // ── list ────────────────────────────────────────────────────────────────
    // Real accounts from auth.users, not inferred from event logs — the old
    // panel could only see accounts that had generated activity, so a fresh
    // signup was invisible.
    if (action === "list") {
      const { data: list, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (error) return json({ error: error.message }, 500);
      const users = list?.users ?? [];
      const ids = users.map((u) => u.id);

      const { data: profs } = await admin.from("profiles")
        .select("id, data, stripe_customer_id").in("id", ids);
      const profById = new Map((profs ?? []).map((p) => [p.id, p]));

      // Job counts in one grouped pass rather than N queries.
      const { data: jobRows } = await admin.from("jobs").select("user_id").in("user_id", ids);
      const jobCount = new Map<string, number>();
      (jobRows ?? []).forEach((r: { user_id: string }) =>
        jobCount.set(r.user_id, (jobCount.get(r.user_id) ?? 0) + 1));

      const { data: memberRows } = await admin.from("org_members")
        .select("user_id, role, org_id").in("user_id", ids);
      const memberBy = new Map<string, { role: string; org_id: string }[]>();
      (memberRows ?? []).forEach((m: { user_id: string; role: string; org_id: string }) => {
        const arr = memberBy.get(m.user_id) ?? [];
        arr.push({ role: m.role, org_id: m.org_id });
        memberBy.set(m.user_id, arr);
      });

      return json({
        ok: true,
        users: users.map((u) => {
          const p = profById.get(u.id) as { data?: Record<string, unknown>; stripe_customer_id?: string } | undefined;
          const cfg = ((p?.data as Record<string, unknown>)?.config ?? {}) as Record<string, unknown>;
          const ents = (cfg.entitlements ?? {}) as Record<string, unknown>;
          const brand = (cfg.brand ?? {}) as Record<string, unknown>;
          return {
            id: u.id,
            email: u.email ?? "",
            createdAt: u.created_at,
            lastSignInAt: u.last_sign_in_at,
            confirmed: !!u.email_confirmed_at,
            company: (brand.companyName as string) ?? "",
            plan: (ents.plan as string) ?? "none",
            // The one thing that makes a manual plan change dangerous.
            stripeCustomerId: p?.stripe_customer_id ?? null,
            jobs: jobCount.get(u.id) ?? 0,
            memberships: memberBy.get(u.id) ?? [],
            isAdmin: isAdminUser({ id: u.id, email: u.email ?? "" }),
          };
        }),
      });
    }

    // ── set_plan ────────────────────────────────────────────────────────────
    if (action === "set_plan") {
      const userId = String(body.userId ?? "");
      const plan = String(body.plan ?? "");
      if (!userId) return json({ error: "userId required" }, 400);
      if (!ASSIGNABLE.includes(plan)) {
        return json({ error: `plan must be one of ${ASSIGNABLE.join(", ")}` }, 400);
      }
      const now = Date.now();
      // Fresh cycle so caps (quotes, AI reads) start clean on the new plan.
      const ents = await patchEntitlements(userId, {
        plan,
        status: plan === "none" ? "none" : "active",
        cycleStart: new Date(now).toISOString(),
        cycleEnd: new Date(now + 30 * DAY).toISOString(),
        quotesUsedThisCycle: 0,
        aiReadsUsedThisCycle: 0,
        aiThumbnailsUsedThisCycle: 0,
        manualOverrideAt: new Date(now).toISOString(),
        manualOverrideBy: caller.email ?? caller.id,
      });
      return json({ ok: true, entitlements: ents });
    }

    // ── reset_counters ──────────────────────────────────────────────────────
    if (action === "reset_counters") {
      const userId = String(body.userId ?? "");
      if (!userId) return json({ error: "userId required" }, 400);
      const ents = await patchEntitlements(userId, {
        quotesUsedThisCycle: 0,
        aiReadsUsedThisCycle: 0,
        aiThumbnailsUsedThisCycle: 0,
      });
      return json({ ok: true, entitlements: ents });
    }

    // ── delete ──────────────────────────────────────────────────────────────
    // Same order and the same ownership guard as delete-account, so an account
    // removed from here leaves the database in exactly the state the user's own
    // "delete my account" would.
    if (action === "delete") {
      const userId = String(body.userId ?? "");
      const confirmEmail = String(body.confirmEmail ?? "").trim().toLowerCase();
      if (!userId) return json({ error: "userId required" }, 400);
      if (userId === caller.id) {
        return json({ error: "Refusing to delete the account you are signed in as." }, 400);
      }

      const { data: target, error: tErr } = await admin.auth.admin.getUserById(userId);
      if (tErr || !target?.user) return json({ error: "No such account" }, 404);
      const targetEmail = (target.user.email ?? "").toLowerCase();
      // Server-side re-check of the typed confirmation: the UI asks for it, but
      // the UI is not the thing standing between a mis-click and a deletion.
      if (!confirmEmail || confirmEmail !== targetEmail) {
        return json({ error: "confirmEmail does not match this account" }, 400);
      }
      if (isAdminUser({ id: userId, email: targetEmail })) {
        return json({ error: "Refusing to delete an admin account." }, 400);
      }

      // Ownership guard — never orphan an org that still has other people in it.
      const { data: owned } = await admin.from("organizations").select("id").eq("owner_id", userId);
      const ownedIds = (owned ?? []).map((o: { id: string }) => o.id);
      const { data: ownerRoles } = await admin.from("org_members")
        .select("org_id").eq("user_id", userId).eq("role", "owner");
      (ownerRoles ?? []).forEach((m: { org_id: string }) => {
        if (!ownedIds.includes(m.org_id)) ownedIds.push(m.org_id);
      });
      for (const orgId of ownedIds) {
        const { count } = await admin.from("org_members")
          .select("id", { count: "exact", head: true })
          .eq("org_id", orgId).neq("user_id", userId);
        if ((count ?? 0) > 0) {
          return json({
            error: "That account owns a team that still has other members. Transfer ownership or remove them first.",
          }, 409);
        }
      }

      for (const table of ["location_pings", "member_locations", "member_profiles",
                           "member_field_settings", "crew_members", "time_sessions"]) {
        const { error } = await admin.from(table).delete().eq("user_id", userId);
        if (error) return json({ error: `${table}: ${error.message}` }, 500);
      }
      { const { error } = await admin.from("org_invites").delete().eq("created_by", userId);
        if (error) console.warn("org_invites cleanup skipped:", error.message); }
      { const { error } = await admin.from("org_members").delete().eq("user_id", userId);
        if (error) return json({ error: `org_members: ${error.message}` }, 500); }
      for (const orgId of ownedIds) {
        const { error } = await admin.from("organizations").delete().eq("id", orgId);
        if (error) return json({ error: `organizations: ${error.message}` }, 500);
      }
      { const { error } = await admin.from("jobs").delete().eq("user_id", userId);
        if (error) return json({ error: `jobs: ${error.message}` }, 500); }
      { const { error } = await admin.from("profiles").delete().eq("id", userId);
        if (error) console.warn("profiles cleanup:", error.message); }

      const { error: delErr } = await admin.auth.admin.deleteUser(userId);
      if (delErr) return json({ error: delErr.message }, 500);
      return json({ ok: true, deleted: targetEmail });
    }

    return json({ error: `Unknown action "${action}"` }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
