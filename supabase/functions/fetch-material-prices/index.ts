// fetch-material-prices  (Grok Live Search — PRO / SHOP only)
// ─────────────────────────────────────────────────────────────────────────────
// The frontend sends a small list of materials to price + the account's ZIP
// (and city/state as a fallback). We ask Grok — with Live Search ON — to look up
// current retail prices at Lowe's, Home Depot, and other building-supply stores
// near that location and return an AVERAGE price per unit for each item, plus the
// low/high range and which stores it saw. The user reviews and confirms before
// anything is written to their rate grid.
//
// This is a PAID, gated capability:
//   • PRO and UNLIMITED (customer-facing "Shop") only — trial/starter get 403.
//   • Metered per cycle via the shared consume_ai_credit RPC (key below), same
//     race-safe pre-debit + refund-on-failure pattern as extract-plan-openings.
//
// Request:  POST { zip?, city?, state?, kind?, items: [{id, label, unit}] }
// Response: 200 { ok:true, prices:[{id, price, low, high, unit, stores:[{name,price}],
//                                    confidence, note}], area, model }
//
// Secrets: XAI_API_KEY (required), XAI_MODEL (default grok-4.3), ADMIN_UID, ADMIN_EMAILS.
// NOTE (verify at deploy): the Live Search request shape below targets xAI's
// documented `search_parameters` on /chat/completions. If xAI changes the param
// names, only buildSearchBody() needs to change — the gate/debit/parse are stable.

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
function errorResponse(message: string, status = 400, code?: string): Response {
  return jsonResponse(code ? { error: message, code } : { error: message }, status);
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

// Atomic usage accounting — same shared RPCs as the AI plan-read, keyed to a
// SEPARATE counter so the two features don't share a budget.
const FETCH_KEY = "materialPriceFetchesUsedThisCycle";
async function refundFetch(userId: string) {
  try {
    await supabaseAdmin.rpc("refund_ai_credit", { p_user: userId, p_key: FETCH_KEY });
  } catch (e) {
    console.warn("[prices] refund failed", e);
  }
}

const XAI_API_KEY = Deno.env.get("XAI_API_KEY") ?? "";
const _xaiModelRaw = (Deno.env.get("XAI_MODEL") ?? "grok-4.3").trim();
const XAI_MODEL = /^grok-4(-0709)?$/i.test(_xaiModelRaw) ? "grok-4.3" : _xaiModelRaw;
const XAI_BASE = "https://api.x.ai/v1";

const ADMIN_UID = Deno.env.get("ADMIN_UID") ?? "";
const ADMIN_EMAILS = (Deno.env.get("ADMIN_EMAILS") ?? "")
  .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
function isAdminUser(user: { id?: string; email?: string } | null): boolean {
  if (!user) return false;
  if (ADMIN_UID && user.id === ADMIN_UID) return true;
  const em = (user.email ?? "").toLowerCase();
  return !!em && ADMIN_EMAILS.includes(em);
}

// Per-cycle price-fetch caps. Trial & Starter are 0 → the feature is Pro/Shop
// only (mirrored by planAllows("pro") on the client, but ENFORCED here).
const FETCH_CAPS: Record<string, number> = { trial: 0, starter: 0, pro: 20, unlimited: Infinity };
// Plans allowed to use the feature at all (0-cap plans are rejected with a
// distinct code so the client can show the right upsell).
const ALLOWED_PLANS = new Set(["pro", "unlimited"]);

const MAX_ITEMS = 40;

function buildSearchBody(area: string, items: { id: string; label: string; unit: string }[]) {
  const list = items
    .map((it) => `- id "${it.id}": ${it.label} (price per ${it.unit})`)
    .join("\n");
  const system =
    "You are a building-materials pricing researcher for a Florida window & door " +
    "install contractor. Use web search to find CURRENT retail prices at Lowe's, " +
    "Home Depot, and other building-supply retailers serving the given area. For " +
    "each requested item, report the AVERAGE price across the stores you find, the " +
    "low and high you saw, and which stores/prices those were. Prices must be the " +
    "per-unit figure requested (e.g. per linear foot: take the board price and " +
    "divide by its length). If you cannot find a real listing for an item, set its " +
    'confidence to "low" and give your best estimate. Reply with STRICT JSON only.';
  const user =
    `Area: ${area}\n\nPrice these items:\n${list}\n\n` +
    "Return JSON of exactly this shape (numbers only, no $ signs, no commentary):\n" +
    `{"prices":[{"id":"<echo the id>","price":<avg number>,"low":<number>,"high":<number>,` +
    `"unit":"<echo unit>","stores":[{"name":"Home Depot","price":<number>}],` +
    `"confidence":"high|medium|low","note":"<short>"}],"area":"${area}"}`;
  return {
    model: XAI_MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    // xAI Live Search — real-time web results folded into the completion.
    search_parameters: {
      mode: "on",
      sources: [{ type: "web" }],
      max_search_results: 20,
      return_citations: true,
    },
    response_format: { type: "json_object" },
    temperature: 0.2,
  };
}

// Pull the JSON payload out of a chat/completions reply and coerce it to our
// shape. Tolerant: strips code fences, ignores junk, clamps to requested ids.
function parsePrices(
  raw: string,
  wantIds: Set<string>,
): { id: string; price: number; low: number; high: number; unit: string; stores: { name: string; price: number }[]; confidence: string; note: string }[] {
  if (!raw) return [];
  let txt = raw.trim();
  const fence = txt.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) txt = fence[1].trim();
  const start = txt.indexOf("{");
  const end = txt.lastIndexOf("}");
  if (start > 0 || end >= 0) txt = txt.slice(Math.max(0, start), end + 1);
  let obj: any;
  try { obj = JSON.parse(txt); } catch { return []; }
  const arr = Array.isArray(obj?.prices) ? obj.prices : [];
  const num = (v: any) => (typeof v === "number" && isFinite(v) ? v : parseFloat(v));
  return arr
    .map((p: any) => {
      const price = num(p?.price);
      if (!(price > 0)) return null;
      const low = num(p?.low); const high = num(p?.high);
      const stores = Array.isArray(p?.stores)
        ? p.stores
            .map((s: any) => ({ name: String(s?.name ?? "").slice(0, 40), price: num(s?.price) }))
            .filter((s: any) => s.name && s.price > 0)
            .slice(0, 6)
        : [];
      const conf = ["high", "medium", "low"].includes(p?.confidence) ? p.confidence : "medium";
      return {
        id: String(p?.id ?? ""),
        price: Math.round(price * 100) / 100,
        low: low > 0 ? Math.round(low * 100) / 100 : price,
        high: high > 0 ? Math.round(high * 100) / 100 : price,
        unit: String(p?.unit ?? "").slice(0, 12),
        stores,
        confidence: conf,
        note: String(p?.note ?? "").slice(0, 160),
      };
    })
    .filter((p: any) => p && wantIds.has(p.id));
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
  let body: { zip?: string; city?: string; state?: string; kind?: string; items?: any[] };
  try { body = await req.json(); } catch { return errorResponse("Invalid JSON body"); }
  const zip = String(body.zip ?? "").trim().slice(0, 12);
  const city = String(body.city ?? "").trim().slice(0, 60);
  const state = String(body.state ?? "").trim().slice(0, 40);
  const area = [zip, [city, state].filter(Boolean).join(", ")].filter(Boolean).join(" · ") || "Florida, USA";
  if (!zip && !city) return errorResponse("Add your ZIP (or city/state) in Settings first.", 400, "no_location");
  let items = Array.isArray(body.items)
    ? body.items
        .filter((it) => it && typeof it.id === "string" && typeof it.label === "string")
        .map((it) => ({ id: String(it.id).slice(0, 60), label: String(it.label).slice(0, 160), unit: String(it.unit ?? "unit").slice(0, 12) }))
    : [];
  if (!items.length) return errorResponse("No materials to price.", 400);
  if (items.length > MAX_ITEMS) items = items.slice(0, MAX_ITEMS);

  if (!XAI_API_KEY) return errorResponse("AI pricing isn't configured yet.", 503);

  // ── Entitlement / cost gate (admin unlimited)
  const admin = isAdminUser(user);
  let debited = false;
  if (!admin) {
    let profile: any;
    try { profile = await getProfile(user.id); } catch { return errorResponse("Profile lookup failed", 500); }
    const ent = profile?.data?.config?.entitlements ?? null;
    if (!ent) return errorResponse("No active plan on this account.", 403, "plan_gate");
    if (ent.plan === "trial" && Date.now() >= (ent.cycleResetAt ?? 0)) {
      return errorResponse("Your free trial has ended — subscribe to keep going.", 403, "trial_expired");
    }
    // Feature gate: Pro & Shop only.
    if (!ALLOWED_PLANS.has(ent.plan)) {
      return errorResponse("AI price updates are a Pro & Shop feature.", 403, "plan_gate");
    }
    if (
      ent.plan !== "unlimited" &&
      ent.subscriptionStatus && ent.subscriptionStatus !== "active" && ent.subscriptionStatus !== "trialing"
    ) {
      return errorResponse("Your subscription isn't active.", 403, "subscription_inactive");
    }
    const cap = FETCH_CAPS[ent.plan] ?? 0;
    if (cap !== Infinity) {
      const { data: okDebit, error: debitErr } = await supabaseAdmin.rpc("consume_ai_credit", {
        p_user: user.id, p_key: FETCH_KEY, p_cap: cap,
      });
      if (debitErr) { console.error("[prices] debit failed", debitErr); return errorResponse("Usage check failed — try again.", 500); }
      if (!okDebit) return errorResponse("You've used all your AI price updates this billing cycle.", 429, "cap_reached");
      debited = true;
    }
  }

  // ── Ask Grok (Live Search) for current prices
  let prices: any[] = [];
  try {
    const aiRes = await fetch(`${XAI_BASE}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${XAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(buildSearchBody(area, items)),
      signal: AbortSignal.timeout(90_000),
    });
    if (!aiRes.ok) {
      const t = await aiRes.text();
      console.error("[prices] xai failed", aiRes.status, t.slice(0, 1200));
      if (debited) await refundFetch(user.id);
      const status = aiRes.status === 429 ? 429 : 502;
      return errorResponse(
        status === 429 ? "The AI is busy right now — try again in a moment." : "Couldn't fetch prices right now — try again shortly.",
        status,
        status === 429 ? "rate_limited" : undefined,
      );
    }
    const aiJson = await aiRes.json();
    const content = aiJson?.choices?.[0]?.message?.content ?? "";
    prices = parsePrices(String(content), new Set(items.map((it) => it.id)));
  } catch (err) {
    console.error("[prices] xai error", err);
    if (debited) await refundFetch(user.id);
    const timedOut = err instanceof DOMException && err.name === "TimeoutError";
    return errorResponse(timedOut ? "The AI took too long — try again shortly." : "AI request failed — try again shortly.", timedOut ? 504 : 502);
  }

  // A run that surfaced no usable prices shouldn't burn a credit.
  if (!prices.length) {
    if (debited) await refundFetch(user.id);
    return jsonResponse({ error: "Couldn't find current prices for those materials — try again, or enter them by hand." }, 422);
  }

  return jsonResponse({ ok: true, prices, area, model: XAI_MODEL });
});
