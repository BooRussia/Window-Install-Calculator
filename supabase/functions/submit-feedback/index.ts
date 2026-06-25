// submit-feedback
// Records a feature request / bug report from the calculator: inserts a row into
// public.feedback (service role) and best-effort emails the owner via Resend.
//
// SECURITY:
// - verify_jwt = true alone is not enough (the anon key is a valid project JWT),
//   so we resolve a REAL user via auth.getUser(). Anonymous callers are rejected.
// - The user's email + plan are taken from the verified session / their profile —
//   NOT trusted from the request body — so the report can't be spoofed.
// - Message + kind are validated and length-capped (mirrors the DB constraints).
//
// Secrets: RESEND_API_KEY (optional — email is skipped if unset),
//          FEEDBACK_TO_EMAIL  (default admin@anchorquoting.com),
//          FEEDBACK_FROM_EMAIL (default "Anchor <onboarding@resend.dev>").

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FEEDBACK_TO = Deno.env.get("FEEDBACK_TO_EMAIL") ?? "admin@anchorquoting.com";
const FEEDBACK_FROM = Deno.env.get("FEEDBACK_FROM_EMAIL") ?? "Anchor <onboarding@resend.dev>";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  // ── Auth: resolve a real user (the anon key has no user).
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ ok: false, error: "Sign in to send feedback." }, 401);
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) return json({ ok: false, error: "Invalid auth" }, 401);

  // ── Validate input
  let body: any = {};
  try { body = await req.json(); } catch (_e) { /* empty */ }
  const kind = body.kind === "bug" ? "bug" : "feature";
  const message = String(body.message ?? "").trim();
  if (!message) return json({ ok: false, error: "Type a message first." }, 400);
  if (message.length > 4000) return json({ ok: false, error: "That's a bit long — keep it under 4000 characters." }, 400);
  const ctx = (body.context && typeof body.context === "object") ? body.context : {};

  // ── Optional photo attachments. The client uploads compressed images straight
  // into its own folder of the private `feedback-photos` bucket and sends the
  // resulting storage paths here. Trust nothing: require each path to be a short
  // string scoped to THIS user's folder so a caller can't attach someone else's
  // (or an arbitrary) object. Cap to 6 (matches the DB constraint).
  const photos: string[] = (Array.isArray(body.photos) ? body.photos : [])
    .filter((p: unknown): p is string => typeof p === "string")
    .map((p: string) => p.trim())
    .filter((p: string) => p.length > 0 && p.length <= 300 && p.startsWith(`${user.id}/feedback/`))
    .slice(0, 6);

  // ── Pull authoritative submitter info from the profile (not the request body)
  let plan = "unknown";
  let company = String(ctx.company ?? "").slice(0, 120) || null;
  try {
    const { data: profile } = await admin.from("profiles").select("data").eq("id", user.id).single();
    const cfg = profile?.data?.config ?? {};
    plan = cfg?.entitlements?.plan ?? plan;
    if (!company) company = (cfg?.brand?.companyName ?? "").slice(0, 120) || null;
  } catch (_e) { /* best effort */ }

  // ── Insert the feedback row (service role)
  const row = {
    user_id: user.id,
    user_email: user.email ?? null,
    user_name: company,         // B2B: the company is the submitter identity
    company,
    plan,
    kind,
    message,
    photos,
    context: {
      url: String(ctx.url ?? "").slice(0, 500),
      ua: String(ctx.ua ?? "").slice(0, 400),
      viewport: String(ctx.viewport ?? "").slice(0, 40),
      appVersion: String(ctx.appVersion ?? "").slice(0, 40),
    },
  };
  const { data: inserted, error: insErr } = await admin
    .from("feedback").insert(row).select("id").single();
  if (insErr) {
    console.error("[submit-feedback] insert failed", insErr);
    return json({ ok: false, error: "Couldn't save that — try again." }, 500);
  }

  // ── Best-effort email notification (never blocks the save)
  if (RESEND_API_KEY) {
    const label = kind === "bug" ? "🐛 Bug report" : "💡 Feature request";
    const subject = `${label} from ${company || user.email || "a user"}`;
    const html =
      `<h2 style="margin:0 0 8px">${escapeHtml(label)}</h2>` +
      `<p style="white-space:pre-wrap;font-size:15px;line-height:1.5">${escapeHtml(message)}</p>` +
      `<hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0">` +
      `<table style="font-size:13px;color:#475569">` +
      `<tr><td><b>From</b></td><td style="padding-left:10px">${escapeHtml(user.email ?? "—")}</td></tr>` +
      `<tr><td><b>Company</b></td><td style="padding-left:10px">${escapeHtml(company ?? "—")}</td></tr>` +
      `<tr><td><b>Plan</b></td><td style="padding-left:10px">${escapeHtml(plan)}</td></tr>` +
      `<tr><td><b>Page</b></td><td style="padding-left:10px">${escapeHtml(row.context.url)}</td></tr>` +
      (photos.length ? `<tr><td><b>Photos</b></td><td style="padding-left:10px">${photos.length} attached — view them in the in-app feedback inbox</td></tr>` : "") +
      `</table>`;
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: FEEDBACK_FROM,
          to: [FEEDBACK_TO],
          reply_to: user.email ? [user.email] : undefined,
          subject,
          html,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) console.error("[submit-feedback] resend error", res.status, (await res.text().catch(() => "")).slice(0, 500));
    } catch (e) {
      console.error("[submit-feedback] resend fetch failed", e);
    }
  }

  return json({ ok: true, id: inserted?.id ?? null });
});
