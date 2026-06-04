// extract-plan-openings  (VISION-only)
// ─────────────────────────────────────────────────────────────────────────────
// The frontend renders the plan to page images (PDF → JPEGs via PDF.js, or a
// direct PNG/JPEG) and sends them here. We pass them to Grok as input_image
// (vision) — the same way the consumer app reads a schedule. xAI's PDF *file*
// path only reads extracted text, which is useless for a visual drawing, so we
// never use it.
//
// Request:  POST { images: string[] (base64, no prefix), mimeType }
// Response: 200 { ok:true, text }   ← text is byte-compatible with the existing
//           parseOpenings / parseGrokResponse on the frontend.
//
// Secrets: XAI_API_KEY (required), XAI_MODEL (default grok-4), ADMIN_UID, ADMIN_EMAILS.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status);
}
function handlePreflight(req: Request): Response | null {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  return null;
}

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);
async function getProfile(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("profiles").select("id, data").eq("id", userId).single();
  if (error) throw error;
  return data;
}
async function patchEntitlements(userId: string, patch: Record<string, unknown>) {
  const profile = await getProfile(userId);
  const data: any = profile.data ?? {};
  data.config = data.config ?? {};
  data.config.entitlements = { ...(data.config.entitlements ?? {}), ...patch };
  const { error } = await supabaseAdmin.from("profiles").update({ data }).eq("id", userId);
  if (error) throw error;
}

const XAI_API_KEY = Deno.env.get("XAI_API_KEY") ?? "";
const XAI_MODEL = Deno.env.get("XAI_MODEL") ?? "grok-4";
const XAI_BASE = "https://api.x.ai/v1";

const ADMIN_UID = Deno.env.get("ADMIN_UID") ?? "";
const ADMIN_EMAILS = (Deno.env.get("ADMIN_EMAILS") ?? "")
  .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

const AI_CAPS: Record<string, number> = { trial: 5, starter: 50, pro: 200, unlimited: Infinity };

const MIME_ALLOW = new Set(["image/png", "image/jpeg"]);
const MAX_IMAGES = 8;
const MAX_TOTAL_B64 = 14 * 1024 * 1024; // ~10.5 MB of raw image data across pages

const FULL_PROMPT = `Window Schedule — Full Takeoff

You are looking at one or more pages of a window/door schedule (images). Do BOTH of the following.

PART A — Manufacturer:
Identify the window MANUFACTURER (title block, header row, notes, or any "MFR" / "MANUFACTURER" column; common ones: Viwinco, Weathershield, Velocity, ES Window & Door, Pella, Andersen, Marvin, Jeld-Wen, PGT, MI Windows). If you cannot find one, write Unknown.

PART B — Every opening:
For EACH opening in the schedule:
1. Find the ROUGH OPENING width and height (labeled R.O., Rough Opening, or SIZING R/O — ignore frame size, unit size, and glass size). If only the unit/nominal size is shown, use it. Convert to inches: 3'-0" becomes 36, 36 1/2" becomes 36.5.
2. Find the quantity (QTY) — how many of that opening. If none is shown, use 1.
3. Find the room or location name (or the window mark/label if no room is given).
4. Determine the TYPE: if it is a sliding glass door, slider, SGD, or patio door, mark it "sliding glass door"; everything else is "window".

Reply with ONLY the following — the manufacturer line first, then one OPENING line per opening. No headers, totals, preamble, or commentary:

MANUFACTURER: <name or Unknown>
OPENING | room or location | width_inches | height_inches | qty | type

Example reply:
MANUFACTURER: Viwinco
OPENING | Master Bedroom | 36 | 48 | 2 | window
OPENING | Kitchen | 48 | 60 | 1 | window
OPENING | Living Room Patio | 72 | 80 | 1 | sliding glass door

Read the dimensions directly off the drawing. Only if there are genuinely no openings visible at all, reply with just "MANUFACTURER: <name>". Otherwise reply with the MANUFACTURER line and one OPENING line per opening.`;

function looksValid(text: string): boolean {
  return !!text && /OPENING\s*\|/i.test(text);
}

function isAdminUser(user: { id?: string; email?: string } | null): boolean {
  if (!user) return false;
  if (ADMIN_UID && user.id === ADMIN_UID) return true;
  const em = (user.email ?? "").toLowerCase();
  return !!em && ADMIN_EMAILS.includes(em);
}

function extractReplyText(json: any): string {
  if (!json) return "";
  const parts: string[] = [];
  if (typeof json.output_text === "string") parts.push(json.output_text);
  if (Array.isArray(json.output)) {
    for (const item of json.output) {
      const content = item?.content;
      if (Array.isArray(content)) {
        for (const c of content) {
          if (typeof c?.text === "string") parts.push(c.text);
          else if (typeof c?.text?.value === "string") parts.push(c.text.value);
        }
      } else if (typeof item?.text === "string") {
        parts.push(item.text);
      }
    }
  }
  if (Array.isArray(json.choices)) {
    const m = json.choices[0]?.message?.content;
    if (typeof m === "string") parts.push(m);
    else if (Array.isArray(m)) {
      for (const c of m) if (typeof c?.text === "string") parts.push(c.text);
    }
  }
  let text = parts.join("\n").trim();
  if (/OPENING\s*\|/i.test(text)) return text;
  const all: string[] = [];
  (function walk(o: any) {
    if (typeof o === "string") all.push(o);
    else if (Array.isArray(o)) o.forEach(walk);
    else if (o && typeof o === "object") Object.values(o).forEach(walk);
  })(json);
  const hit = all.find((s) => /OPENING\s*\|/i.test(s)) || all.find((s) => /MANUFACTURER/i.test(s));
  if (hit) return hit;
  return text || all.sort((a, b) => b.length - a.length)[0] || "";
}

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  // ── Auth
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return errorResponse("Missing bearer token", 401);
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) return errorResponse("Invalid auth", 401);

  // ── Body + validation
  let body: { images?: string[]; mimeType?: string };
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON body");
  }
  const mimeType = (body.mimeType ?? "image/jpeg").toLowerCase();
  let images = Array.isArray(body.images)
    ? body.images.filter((s) => typeof s === "string" && s.length > 0)
    : [];
  if (!MIME_ALLOW.has(mimeType)) return errorResponse("Unsupported image type.", 400);
  if (!images.length) return errorResponse("No plan pages provided.", 400);
  if (images.length > MAX_IMAGES) images = images.slice(0, MAX_IMAGES);
  const totalB64 = images.reduce((s, im) => s + im.length, 0);
  if (totalB64 > MAX_TOTAL_B64) {
    return errorResponse("Plan is too large to read — upload fewer pages, or just the schedule page.", 413);
  }

  if (!XAI_API_KEY) {
    return errorResponse("AI plan reading isn't configured yet. Paste your schedule into Grok manually for now.", 503);
  }

  // ── Entitlement / cost gate (admin unlimited)
  const admin = isAdminUser(user);
  let ent: any = null;
  if (!admin) {
    let profile: any;
    try {
      profile = await getProfile(user.id);
    } catch {
      return errorResponse("Profile lookup failed", 500);
    }
    ent = profile?.data?.config?.entitlements ?? null;
    if (!ent) return errorResponse("No active plan on this account.", 403);
    if (ent.plan === "trial" && Date.now() >= (ent.cycleResetAt ?? 0)) {
      return errorResponse("Your free trial has ended — subscribe to keep going.", 403);
    }
    if (
      ent.plan !== "trial" && ent.plan !== "unlimited" &&
      ent.subscriptionStatus && ent.subscriptionStatus !== "active" &&
      ent.subscriptionStatus !== "trialing"
    ) {
      return errorResponse("Your subscription isn't active.", 403);
    }
    const cap = AI_CAPS[ent.plan] ?? 0;
    const used = ent.aiExtractionsUsedThisCycle ?? 0;
    if (used >= cap) {
      return errorResponse("You've used all your AI plan reads for this billing cycle.", 429);
    }
  }

  // ── Ask Grok to read the page images (vision)
  let replyText = "";
  let rawPreview = "";
  const content: any[] = [{ type: "input_text", text: FULL_PROMPT }];
  for (const b64 of images) {
    content.push({ type: "input_image", image_url: `data:${mimeType};base64,${b64}` });
  }
  try {
    const aiRes = await fetch(`${XAI_BASE}/responses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${XAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: XAI_MODEL,
        input: [{ role: "user", content }],
      }),
    });
    if (!aiRes.ok) {
      const t = await aiRes.text();
      console.error("[extract] xai responses failed", aiRes.status, t.slice(0, 1500));
      const status = aiRes.status === 429 ? 429 : 502;
      return errorResponse(
        status === 429
          ? "The AI is busy right now — try again in a moment."
          : "The AI couldn't process that plan. Try again or paste it into Grok.",
        status,
      );
    }
    const aiJson = await aiRes.json();
    rawPreview = JSON.stringify(aiJson).slice(0, 2200);
    console.log("[extract] pages:", images.length, "xai raw:", rawPreview);
    replyText = extractReplyText(aiJson);
    console.log("[extract] extracted len", replyText.length, "preview:", replyText.slice(0, 400));
  } catch (err) {
    console.error("[extract] xai responses error", err);
    return errorResponse("AI request failed — try again shortly.", 502);
  }

  // ── Validate the reply has openings
  if (!looksValid(replyText)) {
    const debug = admin
      ? { pages: images.length, model: XAI_MODEL, extracted: replyText.slice(0, 800), raw: rawPreview }
      : undefined;
    return jsonResponse({
      error: "Couldn't read any openings from that plan — try a clearer page, or upload just the schedule sheet.",
      debug,
    }, 422);
  }

  // ── Charge one extraction (non-admin), only on success
  if (!admin && ent) {
    try {
      await patchEntitlements(user.id, {
        aiExtractionsUsedThisCycle: (ent.aiExtractionsUsedThisCycle ?? 0) + 1,
      });
    } catch (err) {
      console.warn("[extract] couldn't increment extraction counter", err);
    }
  }

  return jsonResponse({ ok: true, text: replyText, usage: { model: XAI_MODEL, pages: images.length } });
});
