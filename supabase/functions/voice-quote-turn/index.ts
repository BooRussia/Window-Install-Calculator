// voice-quote-turn  (BETA — owner account only until VOICE_BETA_OPEN=true)
// ─────────────────────────────────────────────────────────────────────────────
// One turn of the voice quote assistant: the contractor taps the mic and says
// something like "twelve windows, three forty linear feet, block, remodel".
//   1. xAI speech-to-text (POST /v1/stt, multipart) turns the clip into text.
//   2. Grok maps the text onto the calculator's rail fields and returns JSON.
//   3. We validate every field against the allowed values before returning it.
// The app shows "I heard …" and only changes the quote after the contractor
// taps Apply — nothing here writes to their job.
//
// Request:  POST { audio: base64 (no prefix), mimeType, known: {...current
//           fields}, asked: fieldKey | null, manufacturers: string[] }
// Response: 200 { ok:true, transcript, patch:{...}, reply }
//
// Cost: ~1¢ per turn (STT + one small Grok call). While in beta only the owner
// (ADMIN_UID / ADMIN_EMAILS) can call it. Before setting VOICE_BETA_OPEN=true,
// add per-plan metering (consume_ai_credit with its own key) AND make that key
// reset monthly (roll_quota_cycle + invoice.paid only zero the counters they
// name today).
//
// Secrets: XAI_API_KEY (required), XAI_VOICE_MODEL (default grok-4.3),
//          XAI_STT_MODEL (optional; xAI's default when unset), VOICE_BETA_OPEN,
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

const XAI_API_KEY = Deno.env.get("XAI_API_KEY") ?? "";
const XAI_VOICE_MODEL = (Deno.env.get("XAI_VOICE_MODEL") ?? "grok-4.3").trim();
const XAI_STT_MODEL = (Deno.env.get("XAI_STT_MODEL") ?? "").trim();
const VOICE_BETA_OPEN = (Deno.env.get("VOICE_BETA_OPEN") ?? "") === "true";
const XAI_BASE = "https://api.x.ai/v1";
const ADMIN_UID = Deno.env.get("ADMIN_UID") ?? "";
const ADMIN_EMAILS = (Deno.env.get("ADMIN_EMAILS") ?? "")
  .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

// ~20 s of opus/aac is well under 1 MB; this is a backstop against abuse.
const MAX_AUDIO_B64 = 4 * 1024 * 1024;

// Trade words the recognizer should expect (xAI STT `keyterm`, repeatable).
const KEYTERMS = [
  "linear feet", "LF", "windows", "remodel", "new construction", "block framed",
  "stick framed", "impact", "non-impact", "nail fin", "equal leg", "unequal leg",
  "stories", "sliding glass door", "bifold", "Viwinco", "Weathershield", "Velocity",
  "ES Window",
];

const ENUMS: Record<string, string[]> = {
  constructionType: ["New Construction", "Remodel"],
  houseType: ["Block Framed", "Stick Framed"],
  impact: ["Impact", "Non-Impact"],
  application: ["Nail-fin", "Unequal Leg", "Equal Leg"],
};

function isAdminUser(user: { id?: string; email?: string } | null): boolean {
  if (!user) return false;
  if (ADMIN_UID && user.id === ADMIN_UID) return true;
  const em = (user.email ?? "").toLowerCase();
  return !!em && ADMIN_EMAILS.includes(em);
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function extFor(mime: string): string {
  if (/mp4|m4a|aac/i.test(mime)) return "m4a";
  if (/ogg/i.test(mime)) return "ogg";
  if (/wav/i.test(mime)) return "wav";
  if (/mpeg|mp3/i.test(mime)) return "mp3";
  return "webm";
}

// deno-lint-ignore no-explicit-any
function extractReplyText(j: any): string {
  if (!j) return "";
  if (typeof j.output_text === "string" && j.output_text.trim()) return j.output_text;
  const parts: string[] = [];
  if (Array.isArray(j.output)) {
    for (const item of j.output) {
      const content = item?.content;
      if (Array.isArray(content)) {
        for (const c of content) {
          if (typeof c?.text === "string") parts.push(c.text);
          else if (typeof c?.text?.value === "string") parts.push(c.text.value);
        }
      } else if (typeof item?.text === "string") parts.push(item.text);
    }
  }
  if (Array.isArray(j.choices)) {
    const m = j.choices[0]?.message?.content;
    if (typeof m === "string") parts.push(m);
  }
  return parts.join("\n");
}

function firstJsonObject(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) {
      try { return JSON.parse(text.slice(start, i + 1)); } catch { return null; }
    }
  }
  return null;
}

// Keep only fields we know, with values the calculator accepts.
function cleanPatch(raw: unknown, manufacturers: string[]): Record<string, unknown> {
  const p = (raw && typeof raw === "object") ? raw as Record<string, unknown> : {};
  const out: Record<string, unknown> = {};
  const num = (v: unknown) => (typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/,/g, "")));
  const lf = num(p.totalLF);
  if (Number.isFinite(lf) && lf > 0 && lf <= 50000) out.totalLF = Math.round(lf * 10) / 10;
  const wc = num(p.windowCount);
  if (Number.isFinite(wc) && wc >= 1 && wc <= 5000) out.windowCount = Math.round(wc);
  const st = num(p.stories);
  if (Number.isFinite(st) && st >= 1 && st <= 120) out.stories = Math.round(st);
  for (const [k, allowed] of Object.entries(ENUMS)) {
    const v = String(p[k] ?? "").trim().toLowerCase();
    const hit = allowed.find((a) => a.toLowerCase() === v);
    if (hit) out[k] = hit;
  }
  if (typeof p.manufacturer === "string") {
    const v = p.manufacturer.trim().toLowerCase();
    const hit = manufacturers.find((m) => m.toLowerCase() === v);
    if (hit) out.manufacturer = hit;
  }
  if (typeof p.jobName === "string") {
    const v = p.jobName.trim().slice(0, 80);
    if (v) out.jobName = v;
  }
  return out;
}

function buildPrompt(transcript: string, known: unknown, asked: string | null, manufacturers: string[]): string {
  return `You fill in a window-installation quote form from what a contractor just said out loud.

Return ONLY one JSON object, no prose, shaped exactly like:
{"patch": { ...fields... }, "reply": "..."}

Fields you may put in "patch" — ONLY if the contractor clearly said them in THIS utterance:
- "totalLF": number — total linear feet of windows ("340 LF", "three forty linear feet", "about 300 feet")
- "windowCount": integer — how many windows
- "constructionType": "New Construction" or "Remodel" (replacement / existing home / retrofit = "Remodel")
- "houseType": "Block Framed" or "Stick Framed" (block, CBS, concrete block, masonry = "Block Framed"; wood, frame, stick = "Stick Framed")
- "stories": integer number of stories/floors ("two story" = 2)
- "impact": "Impact" or "Non-Impact" (impact glass, hurricane glass = "Impact")
- "application": "Nail-fin", "Unequal Leg" or "Equal Leg" (only if they name one of these)
- "manufacturer": exactly one of ${JSON.stringify(manufacturers)}
- "jobName": a customer or project name if they give one ("the Smith job" = "Smith residence")

The contractor was just asked about: ${asked ? JSON.stringify(asked) : "nothing in particular"}.
If they gave a short answer ("remodel", "block", "yes", "two"), apply it to that field.
Never guess a number they didn't say. Leave out anything you can't map.

"reply": one short sentence confirming what you heard, in plain words, e.g.
"Got it — 12 windows, 340 linear feet, remodel." If nothing usable was said,
reply "Sorry, I didn't catch that."

Current form values (for context only — do not repeat them in "patch" unless they changed them):
${JSON.stringify(known ?? {})}

What the contractor said:
"""${transcript.slice(0, 2000)}"""`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ ok: false, error: "Missing bearer token" }, 401);
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) return json({ ok: false, error: "Invalid auth" }, 401);
  if (!VOICE_BETA_OPEN && !isAdminUser(user)) {
    return json({ ok: false, error: "Voice quoting is in private beta." }, 403);
  }
  if (!XAI_API_KEY) return json({ ok: false, error: "Voice isn't configured yet." }, 503);

  // deno-lint-ignore no-explicit-any
  let body: any;
  try { body = await req.json(); } catch { return json({ ok: false, error: "Invalid JSON body" }, 400); }
  const audio = typeof body?.audio === "string" ? body.audio : "";
  const mimeType = String(body?.mimeType || "audio/webm").slice(0, 60);
  if (!audio) return json({ ok: false, error: "No audio received." }, 400);
  if (audio.length > MAX_AUDIO_B64) return json({ ok: false, error: "That recording is too long — keep it under 20 seconds." }, 413);
  const manufacturers: string[] = Array.isArray(body?.manufacturers)
    ? body.manufacturers.filter((m: unknown) => typeof m === "string").slice(0, 40)
    : [];
  const asked = typeof body?.asked === "string" ? body.asked.slice(0, 40) : null;

  // ── 1. Speech → text
  let transcript = "";
  try {
    let bytes: Uint8Array;
    try { bytes = b64ToBytes(audio); } catch { return json({ ok: false, error: "Couldn't read that recording." }, 400); }
    const form = new FormData();
    form.append("file", new Blob([bytes.buffer as ArrayBuffer], { type: mimeType }), `voice.${extFor(mimeType)}`);
    if (XAI_STT_MODEL) form.append("model", XAI_STT_MODEL);
    form.append("language", "en");
    form.append("format", "true");
    for (const k of KEYTERMS) form.append("keyterm", k);
    const sttRes = await fetch(`${XAI_BASE}/stt`, {
      method: "POST",
      headers: { Authorization: `Bearer ${XAI_API_KEY}` },
      body: form,
      signal: AbortSignal.timeout(30_000),
    });
    if (!sttRes.ok) {
      console.error("[voice] stt failed", sttRes.status, (await sttRes.text()).slice(0, 800));
      return json({ ok: false, error: "Couldn't transcribe that — try again." }, 502);
    }
    const sttJson = await sttRes.json();
    transcript = String(sttJson?.text ?? "").trim();
  } catch (e) {
    console.error("[voice] stt error", e);
    return json({ ok: false, error: "Couldn't transcribe that — try again." }, 502);
  }
  if (!transcript) {
    return json({ ok: true, transcript: "", patch: {}, reply: "I didn't hear anything — tap the mic and try again." });
  }

  // ── 2. Text → fields
  let patch: Record<string, unknown> = {};
  let reply = "";
  try {
    const aiRes = await fetch(`${XAI_BASE}/responses`, {
      method: "POST",
      headers: { Authorization: `Bearer ${XAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: XAI_VOICE_MODEL,
        input: [{ role: "user", content: buildPrompt(transcript, body?.known, asked, manufacturers) }],
      }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!aiRes.ok) {
      console.error("[voice] grok failed", aiRes.status, (await aiRes.text()).slice(0, 800));
      return json({ ok: false, transcript, error: "Heard you, but couldn't fill the quote — try again." }, 502);
    }
    const parsed = firstJsonObject(extractReplyText(await aiRes.json()));
    patch = cleanPatch(parsed?.patch, manufacturers);
    reply = typeof parsed?.reply === "string" ? parsed.reply.slice(0, 240) : "";
  } catch (e) {
    console.error("[voice] grok error", e);
    return json({ ok: false, transcript, error: "Heard you, but couldn't fill the quote — try again." }, 502);
  }

  if (!reply) reply = Object.keys(patch).length ? "Got it." : "Sorry, I didn't catch that.";
  return json({ ok: true, transcript, patch, reply });
});
