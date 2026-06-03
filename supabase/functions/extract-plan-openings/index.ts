// extract-plan-openings
// ─────────────────────────────────────────────────────────────────────────────
// Replaces the manual "copy prompt → open grok.com → paste PDF → copy reply →
// paste back" round-trip with a single server-side call.
//
// Request:  POST { mode: "summary"|"openings", mimeType, fileName?, fileBase64 }
// Response: 200 { ok:true, mode, text, usage:{model} }     ← `text` is byte-
//           compatible with the frontend's existing parsers (parseGrokResponse
//           for "summary", parseOpenings for "openings"), so the browser feeds
//           it straight into applyGrokResponse() / generateCutList() unchanged.
//
// Self-contained (helpers inlined) so it deploys as a single file.
//
// Secrets:  XAI_API_KEY (required), XAI_MODEL (optional, default below),
//           ADMIN_UID / ADMIN_EMAILS (optional, mirror the frontend admin gate).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── inlined CORS / response helpers ──────────────────────────────────────────
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

// ── inlined service-role admin client + profile helpers ──────────────────────
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

// ── config ───────────────────────────────────────────────────────────────────
const XAI_API_KEY = Deno.env.get("XAI_API_KEY") ?? "";
const XAI_MODEL = Deno.env.get("XAI_MODEL") ?? "grok-4";
const XAI_BASE = "https://api.x.ai/v1";

const ADMIN_UID = Deno.env.get("ADMIN_UID") ?? "";
const ADMIN_EMAILS = (Deno.env.get("ADMIN_EMAILS") ?? "")
  .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

// Per-cycle extraction caps by plan. Admin bypasses all. Tune freely.
const AI_CAPS: Record<string, number> = {
  trial: 5,
  starter: 50,
  pro: 200,
  unlimited: Infinity,
};

const MIME_ALLOW = new Set(["application/pdf", "image/png", "image/jpeg"]);
const MAX_RAW_BYTES = 10 * 1024 * 1024; // 10 MB raw (Supabase invoke body is the tighter bound).

// ── the proven prompts, ported from index.html, hardened to "output ONLY" ────
const SUMMARY_PROMPT = `I'm uploading a window schedule for a window installation bid. Please:

1. Identify every individual window opening in the schedule. If a row lists a quantity (QTY), multiply by that quantity so the totals reflect the actual number of windows installed.
2. For each window, find its rough opening width and height. If given as feet/inches (e.g., 3'-0" x 4'-6"), convert to inches first. If given as fractional inches (e.g., 36 1/2"), use the decimal equivalent.
3. Calculate the PERIMETER of each window in inches: (2 x width) + (2 x height).
4. Sum all perimeters across every window, then convert to linear feet by dividing by 12.
5. Count the total number of window units (sum of quantities across all rows).
6. Identify the window MANUFACTURER from the schedule. Look in the title block, header row, notes, or any "MFR" / "MANUFACTURER" column. Common manufacturers include Viwinco, Weathershield, Velocity, ES Window & Door, Pella, Andersen, Marvin, Jeld-Wen, PGT, MI Windows. If you cannot find one, write "Unknown".

Reply with ONLY these three lines and nothing else — no preamble, no explanation, no markdown:

WINDOW_COUNT: <integer>
TOTAL_LF: <total linear feet, one decimal>
MANUFACTURER: <name or Unknown>

Example correct reply:
WINDOW_COUNT: 14
TOTAL_LF: 196.7
MANUFACTURER: Viwinco`;

const OPENINGS_PROMPT = `Window Schedule — Rough Opening Extraction

I'm doing a window buck takeoff. Read the attached window/door schedule and extract every opening.

For EACH opening:
1. Find the ROUGH OPENING width and height (labeled R.O., Rough Opening, or SIZING R/O). Ignore frame size, unit size, and glass size.
2. Convert both to inches. Feet-and-inches like 3'-0" becomes 36. Fractions like 36 1/2" become 36.5.
3. Find the quantity (QTY) — how many of that opening. If no quantity is shown, use 1.
4. Find the room or location name.
5. Determine the TYPE. If the opening is a sliding glass door, slider, SGD, or patio door, mark it "sliding glass door". Everything else is a "window".

Reply with ONLY a list — one opening per line — in EXACTLY this format. No headers, no totals, no commentary:

OPENING | room or location | width_inches | height_inches | qty | type

Example reply:
OPENING | Master Bedroom | 36 | 48 | 2 | window
OPENING | Kitchen | 48 | 60 | 1 | window
OPENING | Living Room Patio | 72 | 80 | 1 | sliding glass door

If the schedule does not clearly show rough opening sizes, say so instead. Otherwise reply with only the OPENING lines.`;

function looksValid(mode: string, text: string): boolean {
  if (!text) return false;
  if (mode === "openings") return /OPENING\s*\|/i.test(text);
  return /total[_\s-]*lf|linear\s*feet|window[_\s-]*count/i.test(text);
}

function isAdminUser(user: { id?: string; email?: string } | null): boolean {
  if (!user) return false;
  if (ADMIN_UID && user.id === ADMIN_UID) return true;
  const em = (user.email ?? "").toLowerCase();
  return !!em && ADMIN_EMAILS.includes(em);
}

// Pull text from an xAI /v1/responses payload defensively (handle Responses-API
// and chat-completions shapes).
function extractReplyText(json: any): string {
  if (!json) return "";
  if (typeof json.output_text === "string") return json.output_text.trim();
  const parts: string[] = [];
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
  if (!parts.length && Array.isArray(json.choices)) {
    const m = json.choices[0]?.message?.content;
    if (typeof m === "string") parts.push(m);
  }
  return parts.join("\n").trim();
}

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  // ── 1. Auth
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return errorResponse("Missing bearer token", 401);
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) return errorResponse("Invalid auth", 401);

  // ── 2. Body + validation
  let body: { mode?: string; mimeType?: string; fileName?: string; fileBase64?: string };
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON body");
  }
  const mode = body.mode === "openings" ? "openings" : "summary";
  const mimeType = (body.mimeType ?? "").toLowerCase();
  const fileBase64 = body.fileBase64 ?? "";
  if (!MIME_ALLOW.has(mimeType)) {
    return errorResponse("Unsupported file type — upload a PDF, PNG, or JPEG.", 400);
  }
  if (!fileBase64) return errorResponse("No file data provided.", 400);
  const approxRawBytes = Math.floor((fileBase64.length * 3) / 4);
  if (approxRawBytes > MAX_RAW_BYTES) {
    return errorResponse(
      "File too large — max ~10 MB. Upload just the schedule page, or a screenshot of it.",
      413,
    );
  }

  if (!XAI_API_KEY) {
    return errorResponse(
      "AI plan reading isn't configured yet. Paste your schedule into Grok manually for now.",
      503,
    );
  }

  // ── 3. Entitlement / cost gate (admin unlimited)
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

  // ── 4. Upload the file to xAI's Files API
  let fileId = "";
  try {
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
      headers: { Authorization: `Bearer ${XAI_API_KEY}` }, // FormData sets its own Content-Type
      body: form,
    });
    if (!upRes.ok) {
      const t = await upRes.text();
      console.error("[extract] xai file upload failed", upRes.status, t);
      return errorResponse(
        "Couldn't read that file — try a clearer scan, or paste the schedule into Grok.",
        502,
      );
    }
    const upJson = await upRes.json();
    fileId = upJson.id ?? upJson.file_id ?? "";
    if (!fileId) {
      console.error("[extract] no file id in upload response", upJson);
      return errorResponse("Upload succeeded but no file id returned.", 502);
    }
  } catch (err) {
    console.error("[extract] file decode/upload error", err);
    return errorResponse("Could not process the uploaded file.", 400);
  }

  // ── 5. Ask Grok to read it
  let replyText = "";
  try {
    const prompt = mode === "openings" ? OPENINGS_PROMPT : SUMMARY_PROMPT;
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
              { type: "input_text", text: prompt },
              { type: "input_file", file_id: fileId },
            ],
          },
        ],
      }),
    });
    if (!aiRes.ok) {
      const t = await aiRes.text();
      console.error("[extract] xai responses failed", aiRes.status, t);
      const status = aiRes.status === 429 ? 429 : 502;
      return errorResponse(
        status === 429
          ? "The AI is busy right now — try again in a moment."
          : "The AI couldn't process that plan. Try again or paste it into Grok.",
        status,
      );
    }
    const aiJson = await aiRes.json();
    replyText = extractReplyText(aiJson);
  } catch (err) {
    console.error("[extract] xai responses error", err);
    return errorResponse("AI request failed — try again shortly.", 502);
  } finally {
    // Best-effort cleanup — don't keep customer plans on xAI.
    if (fileId) {
      fetch(`${XAI_BASE}/files/${fileId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${XAI_API_KEY}` },
      }).catch(() => {});
    }
  }

  // ── 6. Validate the reply is in the parser's dialect
  if (!looksValid(mode, replyText)) {
    return errorResponse(
      "Couldn't read the schedule from that file — it may be a low-res photo. Try a clearer page, or paste it into Grok.",
      422,
    );
  }

  // ── 7. Charge one extraction (non-admin), only on success
  if (!admin && ent) {
    try {
      await patchEntitlements(user.id, {
        aiExtractionsUsedThisCycle: (ent.aiExtractionsUsedThisCycle ?? 0) + 1,
      });
    } catch (err) {
      console.warn("[extract] couldn't increment extraction counter", err);
    }
  }

  return jsonResponse({ ok: true, mode, text: replyText, usage: { model: XAI_MODEL } });
});
