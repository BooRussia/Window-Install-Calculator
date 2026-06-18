// generate-house-image
// Generates a randomized, photorealistic Florida-house image via the xAI image
// API (Grok Imagine) for use as an auto job thumbnail. Returns the image as a
// base64 data URL so the browser can blur it + overlay the job name on a
// <canvas> without cross-origin taint.
//
// SECURITY:
// - verify_jwt = true is NOT sufficient on its own: the public anon key is a
//   valid project-signed JWT, so the platform gate alone would let anyone who
//   reads the page source call this paid endpoint in a loop. We therefore also
//   resolve a real user via auth.getUser() (an anon-key bearer has no user).
// - Each call costs money, so usage is debited ATOMICALLY against a per-plan
//   cycle cap (consume_ai_credit RPC) BEFORE the xAI call and refunded if the
//   upstream call fails. Admin accounts (ADMIN_UID / ADMIN_EMAILS) bypass caps.
// - Upstream error bodies are logged server-side only — clients get a generic
//   message.
//
// Secrets: XAI_API_KEY (required), XAI_IMAGE_MODEL (default grok-imagine-image),
//          ADMIN_UID, ADMIN_EMAILS.

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
const XAI_API_KEY = Deno.env.get("XAI_API_KEY") ?? "";
const XAI_IMAGE_MODEL = Deno.env.get("XAI_IMAGE_MODEL") ?? "grok-imagine-image";
const XAI_BASE = "https://api.x.ai/v1";

const ADMIN_UID = Deno.env.get("ADMIN_UID") ?? "";
const ADMIN_EMAILS = (Deno.env.get("ADMIN_EMAILS") ?? "")
  .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Thumbnails are cheaper than vision plan-reads, so caps are more generous
// than AI_CAPS in extract-plan-openings — but still bounded per cycle.
const THUMB_CAPS: Record<string, number> = { trial: 10, starter: 10, pro: 100, unlimited: Infinity };
const THUMB_KEY = "aiThumbnailsUsedThisCycle";

const STYLES = [
  "single-story Florida ranch house with a tile roof",
  "two-story Mediterranean-style Florida home with a barrel-tile roof",
  "Key West style coastal cottage on stilts",
  "modern white stucco Florida house with large impact windows",
  "Spanish colonial Florida home with arched windows",
  "classic concrete-block Florida house with a screened lanai",
];
const SCENES = [
  "under a bright blue sky with tall palm trees",
  "in warm golden-hour light with tropical landscaping",
  "with a manicured lawn, palms, and a clear sky",
  "on a quiet suburban street lined with swaying palms",
];

function b64FromBytes(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(bin);
}

function isAdminUser(user: { id?: string; email?: string } | null): boolean {
  if (!user) return false;
  if (ADMIN_UID && user.id === ADMIN_UID) return true;
  const em = (user.email ?? "").toLowerCase();
  return !!em && ADMIN_EMAILS.includes(em);
}

async function refundCredit(userId: string) {
  try {
    await admin.rpc("refund_ai_credit", { p_user: userId, p_key: THUMB_KEY });
  } catch (e) {
    console.warn("[house-image] refund failed", e);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  // ── Auth: resolve a REAL user. The platform's verify_jwt accepts the public
  // anon key, so this getUser() check is the actual authentication boundary.
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ ok: false, error: "Missing bearer token" }, 401);
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) return json({ ok: false, error: "Invalid auth" }, 401);

  if (!XAI_API_KEY) return json({ ok: false, error: "Image generation is not configured" }, 500);

  // ── Entitlement + atomic cost gate (admin bypasses)
  const isAdmin = isAdminUser(user);
  let debited = false;
  if (!isAdmin) {
    let ent: any = null;
    try {
      const { data: profile, error: pErr } = await admin
        .from("profiles").select("data").eq("id", user.id).single();
      if (pErr) throw pErr;
      ent = profile?.data?.config?.entitlements ?? null;
    } catch (_e) {
      return json({ ok: false, error: "Profile lookup failed" }, 500);
    }
    if (!ent) return json({ ok: false, error: "No active plan on this account." }, 403);
    if (ent.plan === "trial" && Date.now() >= (ent.cycleResetAt ?? 0)) {
      return json({ ok: false, error: "Your free trial has ended — subscribe to keep going." }, 403);
    }
    if (
      ent.plan !== "trial" &&
      ent.subscriptionStatus && ent.subscriptionStatus !== "active" &&
      ent.subscriptionStatus !== "trialing"
    ) {
      return json({ ok: false, error: "Your subscription isn't active." }, 403);
    }
    const cap = THUMB_CAPS[ent.plan] ?? 0;
    if (cap !== Infinity) {
      // Atomic debit BEFORE the paid call — parallel requests can't blow the cap.
      const { data: okDebit, error: debitErr } = await admin.rpc("consume_ai_credit", {
        p_user: user.id, p_key: THUMB_KEY, p_cap: cap,
      });
      if (debitErr) {
        console.error("[house-image] debit failed", debitErr);
        return json({ ok: false, error: "Usage check failed — try again." }, 500);
      }
      if (!okDebit) {
        return json({ ok: false, error: "You've used all your AI thumbnails for this billing cycle." }, 429);
      }
      debited = true;
    }
  }

  const style = STYLES[Math.floor(Math.random() * STYLES.length)];
  const scene = SCENES[Math.floor(Math.random() * SCENES.length)];
  const prompt =
    `Photorealistic exterior real-estate photo of a ${style}, ${scene}. ` +
    `Daytime, residential, sharp focus, high detail, no text, no people, no watermark.`;

  let res: Response;
  try {
    res = await fetch(`${XAI_BASE}/images/generations`, {
      method: "POST",
      headers: { Authorization: `Bearer ${XAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: XAI_IMAGE_MODEL, prompt, n: 1, response_format: "b64_json" }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (e) {
    if (debited) await refundCredit(user.id);
    const timedOut = e instanceof DOMException && e.name === "TimeoutError";
    console.error("[house-image] xai fetch failed", e);
    return json({ ok: false, error: timedOut ? "Image service timed out" : "Image service unreachable" }, timedOut ? 504 : 502);
  }

  if (!res.ok) {
    // Log the upstream body server-side only — never reflect it to the client.
    const detail = await res.text().catch(() => "");
    console.error("[house-image] xai error", res.status, detail.slice(0, 1500));
    if (debited) await refundCredit(user.id);
    return json({ ok: false, error: "Image API error" }, 502);
  }

  const data = await res.json().catch(() => null);
  const item = data && data.data && data.data[0];
  let b64: string = (item && item.b64_json) || "";
  if (!b64 && item && item.url) {
    // Some responses return a URL — fetch + encode here so the client gets a
    // same-origin-safe data URL (no canvas taint).
    try {
      const imgRes = await fetch(item.url, { signal: AbortSignal.timeout(30_000) });
      b64 = b64FromBytes(new Uint8Array(await imgRes.arrayBuffer()));
    } catch (_e) {
      if (debited) await refundCredit(user.id);
      return json({ ok: false, error: "Could not retrieve generated image" }, 502);
    }
  }
  if (!b64) {
    if (debited) await refundCredit(user.id);
    return json({ ok: false, error: "No image returned" }, 502);
  }

  const mime = b64.startsWith("iVBOR") ? "image/png" : "image/jpeg";
  return json({ ok: true, image: `data:${mime};base64,${b64}` });
});
