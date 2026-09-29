// ask-anchor  (BETA — owner account only until VOICE_BETA_OPEN=true)
// ─────────────────────────────────────────────────────────────────────────────
// "Ask Anchor": the app-wide assistant. The contractor asks by voice or text —
// "anything I need to follow up on?", "how are bookings this month?", "open the
// Smith job", "start a new quote, 12 windows, 340 LF, block remodel", "mark the
// Garcia job won", "send the Smith job for signature".
//   1. Voice → text with xAI speech-to-text (skipped when they typed).
//   2. Grok answers from the data the app sends (the same numbers the dashboard
//      shows — nothing here reads the database) and may propose ONE action.
//   3. Every action is validated here: known type, a job id that was in the
//      data, an allowed screen, quote fields in their allowed values.
// The app runs navigation immediately and asks before anything that changes a
// job or creates a signing link.
//
// Request:  POST { audio?: base64, mimeType?, text?, context: {...},
//                  history?: [{q,a}], manufacturers?: string[], expectConfirm?: boolean,
//                  handsFree?: boolean }
// Response: 200 { ok:true, transcript, reply, action, confirm?: "yes"|"no", end?: true }
//   confirm is only set when expectConfirm was true and the answer was a plain yes/no;
//   end is only set when handsFree was true and they said "that's all" / "thanks".
//
// Beta gate + cost: same as voice-quote-turn (~1¢/turn; owner-only until
// VOICE_BETA_OPEN=true, which needs per-plan metering first).
// Secrets: XAI_API_KEY, XAI_VOICE_MODEL (default grok-4.3), XAI_STT_MODEL,
//          VOICE_BETA_OPEN, ADMIN_UID, ADMIN_EMAILS.

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

const MAX_AUDIO_B64 = 4 * 1024 * 1024;
const MAX_CONTEXT_CHARS = 100_000;
// A plain "yes" / "no" to a confirm card already on screen needs no thinking.
const YES_RE = /^\W*(yes|yeah|yep|yup|sure|ok|okay|confirm|confirmed|do it|go ahead|go for it|please do|that'?s right|correct|affirmative)\b/i;
const NO_RE = /^\W*(no|nope|nah|cancel|never ?mind|stop|don'?t|do not|forget it|negative)\b/i;
// Hands-free: "that's all" / "thanks" ends the back-and-forth (no Grok call, the mic stays closed).
const END_RE = /^\W*(?:(?:ok|okay|alright|all right|yeah|yes|cool|great|perfect)\W+)?(?:that(?:'?s| is) (?:all|it|everything|enough)|that will be all|i'?m (?:good|done|all set)|we'?re (?:good|done)|all done|all set|nothing else|no,? thanks|no,? thank you|thanks|thank you|goodbye|good ?bye|bye|stop listening)(?:\W+(?:for now|so much|very much|a lot|anymore|please|today|then|anchor|thanks|thank you|bye|goodbye))*\W*$/i;

const KEYTERMS = [
  "linear feet", "LF", "windows", "remodel", "new construction", "block framed",
  "stick framed", "impact", "non-impact", "nail fin", "follow up", "follow-ups",
  "pipeline", "signing link", "e-signature", "quote", "approved", "booked",
  "Viwinco", "Weathershield", "Velocity", "ES Window",
];

const VIEWS = ["dashboard", "followups", "pipeline", "revenue", "jobs", "esign", "insights",
  "calibration", "shopping", "calculator", "fl_lookup", "settings"];
const STATUSES = ["Quoted", "Approved", "Finished", "Lost"];
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

// Same rules as voice-quote-turn: only known quote fields, allowed values only.
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

// Keep only an action the app can run, pointing at things that exist.
function cleanAction(raw: unknown, jobIds: Set<string>, manufacturers: string[]): Record<string, unknown> {
  const a = (raw && typeof raw === "object") ? raw as Record<string, unknown> : {};
  const type = String(a.type ?? "none");
  const jobId = typeof a.jobId === "string" ? a.jobId : "";
  if (type === "open" && VIEWS.includes(String(a.view))) return { type, view: String(a.view) };
  if (type === "open_job" && jobIds.has(jobId)) return { type, jobId };
  if (type === "sign_link" && jobIds.has(jobId)) return { type, jobId };
  if (type === "set_status" && jobIds.has(jobId) && STATUSES.includes(String(a.status))) {
    return { type, jobId, status: String(a.status) };
  }
  if (type === "new_quote") return { type, patch: cleanPatch(a.patch, manufacturers) };
  if (type === "update_quote") {
    const patch = cleanPatch(a.patch, manufacturers);
    if (Object.keys(patch).length) return { type, patch };
  }
  return { type: "none" };
}

function buildPrompt(said: string, context: unknown, history: unknown, manufacturers: string[]): string {
  const hist = Array.isArray(history)
    ? history.slice(-4).map((h) => {
      const q = String((h as Record<string, unknown>)?.q ?? "").slice(0, 300);
      const a = String((h as Record<string, unknown>)?.a ?? "").slice(0, 400);
      return `Contractor: ${q}\nAnchor: ${a}`;
    }).join("\n")
    : "";
  return `You are Anchor, the assistant inside a quoting app used by a window & door installation contractor in Florida. Talk like a sharp, friendly office manager: short and plain.

Your reply is READ ALOUD, so: no markdown, no bullet symbols, no emojis. Keep it to 1–3 short sentences, or up to 6 when they ask for a rundown. Say money like "$12,400" and dates like "September 12". Use ONLY the data below — if something isn't in it, say you don't have it. Never invent jobs, customers or numbers.

Return ONLY one JSON object, no prose around it:
{"reply": "...", "action": { ... }}

"action" — at most one, and only when they ask for it (otherwise {"type":"none"}):
- {"type":"none"}
- {"type":"open","view":V} where V is one of ${JSON.stringify(VIEWS)} (followups = quotes needing a follow-up; pipeline = deals by stage; revenue = booked by month; esign = signatures)
- {"type":"open_job","jobId":ID} — open one saved job
- {"type":"new_quote","patch":{...}} — they want to start a NEW quote; include any quote fields they gave
- {"type":"update_quote","patch":{...}} — change the quote that is open right now
- {"type":"set_status","jobId":ID,"status":S} with S one of ${JSON.stringify(STATUSES)} (won / booked / sold = "Approved"; lost = "Lost"; done / installed = "Finished")
- {"type":"sign_link","jobId":ID} — make an e-signature link for a saved job
ID must be an "id" from data.jobs. When they name a job by customer or job name, match it; if two could match, ask which one and use {"type":"none"}.

Quote fields for "patch": "totalLF" (number, window linear feet), "windowCount" (integer), "constructionType" ("New Construction" | "Remodel"), "houseType" ("Block Framed" | "Stick Framed"), "stories" (integer), "impact" ("Impact" | "Non-Impact"), "application" ("Nail-fin" | "Unequal Leg" | "Equal Leg"), "manufacturer" (one of ${JSON.stringify(manufacturers)}), "jobName" (string). Only fields they actually said.

MONEY: every job in data.jobs has "price" (what the customer pays), "cost" (what it costs the contractor), "profit" (price minus cost) and "profitPct" (profit as a percent of the price). data.profit holds ready-made answers so you never have to add up a long list: "topByProfit" (the 5 most profitable jobs of all saved jobs), "topWonByProfit" (the 5 most profitable among approved or finished jobs), "wonTotals" and "allTotals" (jobs, revenue, cost, profit, profitPct). Pipeline stages and bookingsByMonth also carry profit. For "our most profitable job" use topWonByProfit's first entry and mention that it's a won job; if topWonByProfit is empty, use topByProfit and say it's still only quoted. Answer like: "Your most profitable job is the Smith remodel: $4,200 profit on a $14,000 job, about 30 percent." Never say you don't have profit numbers when these fields are present.

JOB DETAIL — you can see everything the app shows about a job. Never say you can't see the labor detail, the breakdown, install time or a customer's info; look for it in the data:
- data.quoteOpenNow is the quote on screen right now: money (price, cost, profit, markupPct, costPerLF), labor (jobHours, installDays, crewSize, crewCostPerHour, laborCost, hoursByTask = the Labor Detail card, crew, editedForThisJob), lineItems (the Full Breakdown table — each line priced by the exact quantity used), materials (the Materials card: the shopping list of full packs to buy), access (lift, swing stage, storage), permit, bucking, doors, customer.
- data.jobDetails has the same in full for a few saved jobs (the job open on screen is data.openJobId, then the most recently touched). Each has customer contact info (name, phone, email, address, notes), scope, money, labor, crew, lineItems, signed, actualsLogged.
- Every job in data.jobs also has laborHours, installDays and laborCost when known, so install time works for any job. If someone asks for a job's line items or customer phone and it isn't in data.jobDetails, give what data.jobs shows and offer to open that job ("say open the Smith job, then ask me again").
- data.customers and data.crews roll up by customer and by crew (jobs, wonRevenue, wonProfit, open quotes). data.defaults has the account's default markup and crew cost.
- MATERIALS: there are two different material numbers and they don't match — that's normal. The Materials card on screen is the shopping list rounded UP to full packs (cases, rolls, sticks): data.quoteOpenNow.materials.toBuy lists each item with what to buy and its cost, and materials.toBuyTotal is the card's total. The quote itself (lineItems, money.costExcludingLabor) prices only the exact amount used, so it is lower. For "material breakdown", "material cost", "what do we need to buy", "shopping list" or "how much are the materials", answer from materials.toBuy / toBuyTotal — that is the number they see on the card. Read the top items and the total, and only mention the used-in-quote figure (money.costExcludingLabor, which also includes non-material job costs like a permit or lift) if they ask why the totals differ or how the job cost is made up. materials.removedFromQuote are items they crossed off. Materials-to-buy exists only for the quote open in the calculator; for a saved job you only have its lineItems (priced by quantity used).
- INSTALL TIME: "how long will it take" = labor.installDays (8-hour workdays) and labor.jobHours, with crewSize. Say it plainly: "About 3 days with a 2-person crew, roughly 22 job hours." If there's also a lift, mention its days. "markupPct" is the markup on cost (this app calls it markup, not margin).
- LABOR DETAIL: read out labor.hoursByTask (mobilization, per-opening setup, window install, doors), the crew and crewCostPerHour, and laborCost.
- If a number really isn't in the data, say which one and where in the app it lives; don't refuse the whole question.

In hands-free mode the app listens again after every reply, so keep replies short and never end with filler like "anything else?". Only end with a question when you truly need an answer to continue.

When you propose an action, the reply should say what you're about to do ("Opening your follow-ups." / "I'll mark the Garcia job approved — tap confirm.").

DATA (JSON — today's date, where they are, their saved jobs with details, follow-ups, pipeline, bookings by month, e-signatures, customers, crews, defaults, the quote open now):
${JSON.stringify(context ?? {}).slice(0, MAX_CONTEXT_CHARS)}

${hist ? `Recent conversation:\n${hist}\n` : ""}
The contractor says:
"""${said.slice(0, 2000)}"""`;
}

async function transcribe(audio: string, mimeType: string): Promise<string> {
  const bytes = b64ToBytes(audio);
  const form = new FormData();
  form.append("file", new Blob([bytes.buffer as ArrayBuffer], { type: mimeType }), `ask.${extFor(mimeType)}`);
  if (XAI_STT_MODEL) form.append("model", XAI_STT_MODEL);
  form.append("language", "en");
  form.append("format", "true");
  for (const k of KEYTERMS) form.append("keyterm", k);
  const res = await fetch(`${XAI_BASE}/stt`, {
    method: "POST",
    headers: { Authorization: `Bearer ${XAI_API_KEY}` },
    body: form,
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    console.error("[ask] stt failed", res.status, (await res.text()).slice(0, 800));
    throw new Error("stt");
  }
  const j = await res.json();
  return String(j?.text ?? "").trim();
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
    return json({ ok: false, error: "Ask Anchor is in private beta." }, 403);
  }
  if (!XAI_API_KEY) return json({ ok: false, error: "The assistant isn't configured yet." }, 503);

  // deno-lint-ignore no-explicit-any
  let body: any;
  try { body = await req.json(); } catch { return json({ ok: false, error: "Invalid JSON body" }, 400); }
  const manufacturers: string[] = Array.isArray(body?.manufacturers)
    ? body.manufacturers.filter((m: unknown) => typeof m === "string").slice(0, 40)
    : [];
  const jobIds = new Set<string>(
    Array.isArray(body?.context?.jobs)
      ? body.context.jobs.map((j: { id?: unknown }) => String(j?.id ?? "")).filter(Boolean)
      : [],
  );

  // ── 1. What did they say?
  let said = typeof body?.text === "string" ? body.text.trim().slice(0, 2000) : "";
  if (!said) {
    const audio = typeof body?.audio === "string" ? body.audio : "";
    if (!audio) return json({ ok: false, error: "Say or type something to ask." }, 400);
    if (audio.length > MAX_AUDIO_B64) return json({ ok: false, error: "That recording is too long — keep it under 20 seconds." }, 413);
    try {
      said = await transcribe(audio, String(body?.mimeType || "audio/webm").slice(0, 60));
    } catch {
      return json({ ok: false, error: "Couldn't hear that — try again." }, 502);
    }
    if (!said) return json({ ok: true, transcript: "", reply: "I didn't hear anything — tap the mic and try again.", action: { type: "none" } });
  }

  // A confirm card is on screen and they just said yes / no — settle it without Grok.
  // Only for SHORT answers ("yes", "yeah do it", "no cancel"): a longer sentence that
  // merely starts with "okay" is a new question and goes to Grok like any other.
  if (body?.expectConfirm === true && said.split(/\s+/).filter(Boolean).length <= 4) {
    if (YES_RE.test(said)) return json({ ok: true, transcript: said, reply: "", action: { type: "none" }, confirm: "yes" });
    if (NO_RE.test(said)) return json({ ok: true, transcript: said, reply: "", action: { type: "none" }, confirm: "no" });
  }

  // Hands-free and they said "that's all" / "thanks" — wind the conversation down, no Grok call.
  if (body?.handsFree === true && said.split(/\s+/).filter(Boolean).length <= 6 && END_RE.test(said)) {
    return json({ ok: true, transcript: said, reply: "Okay — I'm here when you need me.", action: { type: "none" }, end: true });
  }

  // ── 2. Answer + maybe one action
  try {
    const aiRes = await fetch(`${XAI_BASE}/responses`, {
      method: "POST",
      headers: { Authorization: `Bearer ${XAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: XAI_VOICE_MODEL,
        input: [{ role: "user", content: buildPrompt(said, body?.context, body?.history, manufacturers) }],
      }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!aiRes.ok) {
      console.error("[ask] grok failed", aiRes.status, (await aiRes.text()).slice(0, 800));
      return json({ ok: false, transcript: said, error: "I heard you, but couldn't think that through — try again." }, 502);
    }
    const parsed = firstJsonObject(extractReplyText(await aiRes.json()));
    const reply = typeof parsed?.reply === "string" && parsed.reply.trim()
      ? parsed.reply.trim().slice(0, 700)
      : "Sorry, I didn't catch that.";
    const action = cleanAction(parsed?.action, jobIds, manufacturers);
    return json({ ok: true, transcript: said, reply, action });
  } catch (e) {
    console.error("[ask] grok error", e);
    return json({ ok: false, transcript: said, error: "I heard you, but couldn't think that through — try again." }, 502);
  }
});
