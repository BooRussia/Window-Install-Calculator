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
// Atomic usage accounting (consume_ai_credit / refund_ai_credit RPCs).
// The debit happens BEFORE the paid xAI call — a single UPDATE with the cap in
// its WHERE clause, so parallel requests serialize on the row lock and can't
// blow through the plan cap. On upstream failure we refund the credit.
const EXTRACT_KEY = "aiExtractionsUsedThisCycle";
async function refundExtraction(userId: string) {
  try {
    await supabaseAdmin.rpc("refund_ai_credit", { p_user: userId, p_key: EXTRACT_KEY });
  } catch (e) {
    console.warn("[extract] refund failed", e);
  }
}

const XAI_API_KEY = Deno.env.get("XAI_API_KEY") ?? "";
const XAI_MODEL = Deno.env.get("XAI_MODEL") ?? "grok-4";
const XAI_BASE = "https://api.x.ai/v1";

const ADMIN_UID = Deno.env.get("ADMIN_UID") ?? "";
const ADMIN_EMAILS = (Deno.env.get("ADMIN_EMAILS") ?? "")
  .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

// AI plan-read caps per cycle (2026 repricing). The trial gives a generous
// taste (5); Solo deliberately allows only 2/mo so frequent users feel the
// upgrade pull to Pro; Pro is effectively unconstrained for normal use.
const AI_CAPS: Record<string, number> = { trial: 5, starter: 2, pro: 100, unlimited: Infinity };

const MIME_ALLOW = new Set(["image/png", "image/jpeg"]);
// Multi-page schedules run long (10–14 pages is common). xAI imposes no
// image-count limit, so the only real bound is request size. Allow up to 20
// pages and ~15 MB of raw image bytes (~20 MB as base64) per extraction.
const MAX_IMAGES = 20;
const MAX_TOTAL_B64 = 20 * 1024 * 1024;

const FULL_PROMPT = `Window Schedule — Full Takeoff

You are looking at one or more pages of a window/door schedule (images). Do ALL of the following.

PART A — Manufacturer & project:
Identify the window MANUFACTURER (title block, header row, notes, or any "MFR" / "MANUFACTURER" column; common ones: Viwinco, Weathershield, Velocity, ES Window & Door, Pella, Andersen, Marvin, Jeld-Wen, PGT, MI Windows). Also identify the PROJECT / JOB NAME from the title block — the homeowner or project name, or the street address. Write Unknown for anything you cannot find.

PART B — Every opening (READ THE QUANTITY COLUMN — THIS IS CRITICAL):
A window schedule almost always has a QUANTITY column, labeled QTY, QT, QNTY, COUNT, NO., or # . ONE row in the schedule usually represents MULTIPLE identical units — e.g. a "Type W1" row with QTY 4 means there are four of that window in the building. You MUST read that column for every row. Do NOT assume the quantity is 1.
For EACH row/opening in the schedule:
1. Find the ROUGH OPENING width and height (labeled R.O., Rough Opening, R/O, SIZING R/O, or Masonry Opening / M.O.). Convert to inches: 3'-0" becomes 36, 36 1/2" becomes 36.5. If NO rough opening is shown but the unit/nominal/frame size is shown, COMPUTE it: add 3.5 inches to BOTH the width and the height of that unit size — a 1.5" buck board on each side plus a 1/4" shim gap on each side — and report that as the rough opening (e.g. a 36 x 60 unit with no R.O. listed becomes 39.5 x 63.5). Do NOT compute from glass size, glazing size, DLO, daylight opening, or visible-lite dimensions.
2. Read the QUANTITY (QTY) for that row straight off the schedule — the real count. Only use 1 if there is genuinely no quantity shown anywhere for that row.
3. Find the room or location name (or the window mark/label if no room is given).
4. Determine the TYPE. There are THREE types:
   - A SLIDING GLASS DOOR (also called slider, SGD, patio door, XO/OX/XOX/OXO/XOXO, or shown with a panel-configuration code) — mark it exactly "sliding glass door".
   - A BIFOLD DOOR (also called bi-fold, folding glass wall, accordion door, FGW, or a multi-leaf folding door that stacks/folds to one or both sides) — mark it exactly "bifold door". This is distinct from a slider: bifold leaves are hinged together and fold, they do not slide past each other.
   - Everything else (including hinged/swing/French doors) is "window".
   Both sliding glass doors and bifold doors are much more involved than a window and MUST be tagged separately.
5. PANELS — for sliding glass doors AND bifold doors: count the PANELS (the number of glass leaves/panels). For sliders, codes map directly: XO or OX = 2, XOX or OXO = 3, XOXO = 4, etc. For bifolds, use the stated leaf count (e.g. a "4-panel bifold"). If a code or panel count is shown, use it; otherwise estimate from the width. Leave panels blank for windows.
6. SIZE for sliding glass doors and bifold doors: report the OVERALL rough-opening width and height. If the schedule only gives a single PANEL size, multiply: overall width = panel width × number of panels; overall height = the panel height.

PART C — Florida product approvals:
Schedules frequently list a Florida Product Approval number (FL#, formatted like FL12345, FL12345.1, or FL12345-R3) and/or a Miami-Dade NOA number (formatted like 21-0119.05) for each window or door — usually in a column headed "FL #", "FL APPROVAL", "PRODUCT APPROVAL", "APPROVAL", "FBC", or "NOA", or in the schedule notes/legend. Extract EVERY product-approval number you can find, along with what it applies to (the window mark / type / series). If no approval numbers appear anywhere, skip Part C entirely.

If multiple schedule pages are shown, include EVERYTHING across ALL of them. Reply with ONLY the lines below — no headers, totals, preamble, or commentary. Manufacturer and project first, then one OPENING line per opening, then one APPROVAL line per approval number:

MANUFACTURER: <name or Unknown>
PROJECT: <project name, homeowner, or address — or Unknown>
OPENING | room or location | width_inches | height_inches | qty | type | panels
APPROVAL | <FL# or NOA number> | <window mark / type / series it applies to>

The 7th field (panels) is for sliding glass doors and bifold doors only — leave it off for windows.

Example reply:
MANUFACTURER: Viwinco
PROJECT: Smith Residence
OPENING | Master Bedroom | 36 | 48 | 2 | window
OPENING | Kitchen | 48 | 60 | 1 | window
OPENING | Living Room Patio | 144 | 80 | 1 | sliding glass door | 3
OPENING | Family Room | 192 | 96 | 1 | sliding glass door | 4
OPENING | Great Room Rear | 192 | 96 | 1 | bifold door | 6
APPROVAL | FL16258.3 | 7000 Series Single Hung (W1-W4)
APPROVAL | FL22193.1 | 8000 Series Sliding Glass Door (SGD1)

Read the dimensions and quantities directly off the drawing. If any opening only has glass/DLO/visible-lite dimensions and no R.O. or unit/frame/nominal size, do not return a partial or guessed takeoff; reply with just "MANUFACTURER: <name>" so the app asks the user for a clearer schedule. Only if there are genuinely no openings visible at all, reply with just "MANUFACTURER: <name>". Otherwise reply with the MANUFACTURER line, one OPENING line per opening, and one APPROVAL line per approval number you find.`;

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
  let debited = false;
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
    if (cap !== Infinity) {
      // Atomic pre-debit (race-safe). Refunded on any failure path below.
      const { data: okDebit, error: debitErr } = await supabaseAdmin.rpc("consume_ai_credit", {
        p_user: user.id, p_key: EXTRACT_KEY, p_cap: cap,
      });
      if (debitErr) {
        console.error("[extract] debit failed", debitErr);
        return errorResponse("Usage check failed — try again.", 500);
      }
      if (!okDebit) {
        return errorResponse("You've used all your AI plan reads for this billing cycle.", 429);
      }
      debited = true;
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
      signal: AbortSignal.timeout(120_000),
    });
    if (!aiRes.ok) {
      const t = await aiRes.text();
      console.error("[extract] xai responses failed", aiRes.status, t.slice(0, 1500));
      if (debited) await refundExtraction(user.id);
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
    if (debited) await refundExtraction(user.id);
    const timedOut = err instanceof DOMException && err.name === "TimeoutError";
    return errorResponse(
      timedOut ? "The AI took too long — try again shortly." : "AI request failed — try again shortly.",
      timedOut ? 504 : 502,
    );
  }

  // ── Validate the reply has openings (an unreadable plan doesn't count
  // against the user's cycle cap — refund the pre-debited credit)
  if (!looksValid(replyText)) {
    if (debited) await refundExtraction(user.id);
    const debug = admin
      ? { pages: images.length, model: XAI_MODEL, extracted: replyText.slice(0, 800), raw: rawPreview }
      : undefined;
    return jsonResponse({
      error: "Couldn't read any openings from that plan — try a clearer page, or upload just the schedule sheet.",
      debug,
    }, 422);
  }

  return jsonResponse({ ok: true, text: replyText, usage: { model: XAI_MODEL, pages: images.length } });
});
