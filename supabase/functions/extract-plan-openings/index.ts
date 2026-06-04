// extract-plan-openings
// ─────────────────────────────────────────────────────────────────────────────
// One upload → one Grok call → returns the FULL takeoff in a single reply:
//   MANUFACTURER: <name>
//   OPENING | room | w | h | qty | type      (one line per opening)
//
// The browser then, from that ONE reply:
//   • builds the buck cut list from the openings (always; pricing ignores it
//     for stick-framed jobs),
//   • derives window count + total LF from the same openings (so the LF and the
//     cut list can never disagree),
//   • sets the manufacturer.
//
// `text` stays byte-compatible with the existing frontend parsers
// (parseOpenings reads the OPENING lines, parseGrokResponse reads MANUFACTURER).
//
// Self-contained (helpers inlined) so it deploys as a single file.
// Secrets: XAI_API_KEY (required), XAI_MODEL (default below), ADMIN_UID, ADMIN_EMAILS.

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

const AI_CAPS: Record<string, number> = {
  trial: 5,
  starter: 50,
  pro: 200,
  unlimited: Infinity,
};

const MIME_ALLOW = new Set(["application/pdf", "image/png", "image/jpeg"]);
const MAX_RAW_BYTES = 10 * 1024 * 1024;

// One combined prompt — manufacturer + every opening, in the existing dialects.
const FULL_PROMPT = `Window Schedule — Full Takeoff

Read the attached window/door schedule and do BOTH of the following.

PART A — Manufacturer:
Identify the window MANUFACTURER (look in the title block, header row, notes, or any "MFR" / "MANUFACTURER" column; common ones: Viwinco, Weathershield, Velocity, ES Window & Door, Pella, Andersen, Marvin, Jeld-Wen, PGT, MI Windows). If you cannot find one, write Unknown.

PART B — Every opening:
For EACH opening in the schedule:
1. Find the ROUGH OPENING width and height (labeled R.O., Rough Opening, or SIZING R/O — ignore frame size, unit size, and glass size). Convert to inches: 3'-0" becomes 36, 36 1/2" becomes 36.5.
2. Find the quantity (QTY) — how many of that opening. If none is shown, use 1.
3. Find the room or location name.
4. Determine the TYPE: if it is a sliding glass door, slider, SGD, or patio door, mark it "sliding glass door"; everything else is "window".

Reply with ONLY the following — the manufacturer line first, then one OPENING line per opening. No headers, totals, preamble, or commentary:

MANUFACTURER: <name or Unknown>
OPENING | room or location | width_inches | height_inches | qty | type

Example reply:
MANUFACTURER: Viwinco
OPENING | Master Bedroom | 36 | 48 | 2 | window
OPENING | Kitchen | 48 | 60 | 1 | window
OPENING | Living Room Patio | 72 | 80 | 1 | sliding glass door

If the schedule does not clearly show rough opening sizes, say so instead. Otherwise reply with only the MANUFACTURER line and the OPENING lines.`;

function looksValid(text: string): boolean {
  return !!text && /OPENING\s*\|/i.test(text);
}

function isAdminUser(user: { id?: string; email?: string } | null): boolean {
  if (!user) return false;
  if (ADMIN_UID && user.id === ADMIN_UID) return true;
  const em = (user.email ?? "").toLowerCase();
  return !!em && ADMIN_EMAILS.includes(em);
}

// Pull text from an xAI response defensively — tries the known shapes, then
// falls back to a deep walk that finds whichever string actually holds the
// opening lines (covers any unexpected response envelope).
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
  // Deep fallback: collect every string in the payload, prefer one with openings.
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
  let body: { mimeType?: string; fileName?: string; fileBase64?: string };
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON body");
  }
  const mimeType = (body.mimeType ?? "").toLowerCase();
  const fileBase64 = body.fileBase64 ?? "";
  if (!MIME_ALLOW.has(mimeType)) {
    return errorResponse("Unsupported file type — upload a PDF, PNG, or JPEG.", 400);
  }
  if (!fileBase64) return errorResponse("No file data provided.", 400);
  const isImage = mimeType === "image/png" || mimeType === "image/jpeg";
  const approxRawBytes = Math.floor((fileBase64.length * 3) / 4);
  if (approxRawBytes > MAX_RAW_BYTES) {
    return errorResponse("File too large — max ~10 MB. Upload just the schedule page, or a screenshot of it.", 413);
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

  // ── Upload the file to xAI's Files API (PDFs only; images go in as vision)
  let fileId = "";
  if (!isImage) try {
    const bin = Uint8Array.from(atob(fileBase64), (c) => c.charCodeAt(0));
    const form = new FormData();
    form.append(
      "file",
      new Blob([bin], { type: mimeType }),
      body.fileName || (mimeType === "application/pdf" ? "plan.pdf" : "plan.img"),
    );
    form.append("purpose", "assistants");
    const upRes = await fetch(`${XAI_BASE}/files`, {
      method: "POST",
      headers: { Authorization: `Bearer ${XAI_API_KEY}` },
      body: form,
    });
    if (!upRes.ok) {
      const t = await upRes.text();
      console.error("[extract] xai file upload failed", upRes.status, t);
      return errorResponse("Couldn't read that file — try a clearer scan, or paste the schedule into Grok.", 502);
    }
    const upJson = await upRes.json();
    fileId = upJson.id ?? upJson.file_id ?? "";
    console.log("[extract] xai file uploaded id:", fileId, "upload keys:", Object.keys(upJson));
    if (!fileId) {
      console.error("[extract] no file id in upload response", JSON.stringify(upJson).slice(0, 1000));
      return errorResponse("Upload succeeded but no file id returned.", 502);
    }
  } catch (err) {
    console.error("[extract] file decode/upload error", err);
    return errorResponse("Could not process the uploaded file.", 400);
  }

  // ── Ask Grok to read it
  let replyText = "";
  let rawPreview = "";
  // Images go in as VISION (input_image data URI) — far better for a visual
  // schedule. PDFs go in as a Files-API document (input_file = doc search).
  const fileContent = isImage
    ? { type: "input_image", image_url: `data:${mimeType};base64,${fileBase64}` }
    : { type: "input_file", file_id: fileId };
  try {
    const aiRes = await fetch(`${XAI_BASE}/responses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${XAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: XAI_MODEL,
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: FULL_PROMPT },
              fileContent,
            ],
          },
        ],
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
    console.log("[extract] xai raw (truncated):", rawPreview);
    replyText = extractReplyText(aiJson);
    console.log("[extract] extracted len", replyText.length, "preview:", replyText.slice(0, 400));
  } catch (err) {
    console.error("[extract] xai responses error", err);
    return errorResponse("AI request failed — try again shortly.", 502);
  } finally {
    if (fileId) {
      fetch(`${XAI_BASE}/files/${fileId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${XAI_API_KEY}` },
      }).catch(() => {});
    }
  }

  // ── Validate the reply has openings
  if (!looksValid(replyText)) {
    const debug = admin
      ? { mode: isImage ? "vision" : "document", fileId, model: XAI_MODEL, extracted: replyText.slice(0, 800), raw: rawPreview }
      : undefined;
    return jsonResponse({
      error: "Couldn't read the schedule from that file — it may be a low-res photo. Try a clearer page, or paste it into Grok.",
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

  return jsonResponse({ ok: true, text: replyText, usage: { model: XAI_MODEL } });
});
