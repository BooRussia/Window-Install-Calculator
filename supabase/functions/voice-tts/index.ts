// voice-tts  (BETA — owner account only until VOICE_BETA_OPEN=true)
// ─────────────────────────────────────────────────────────────────────────────
// Speaks the assistant's replies with Grok's own voice (xAI text-to-speech)
// instead of the browser's robotic built-in voice.
//
// Request:  POST { text, voice? }   voice ∈ ara | eve | leo | rex | sal
// Response: 200 audio/mpeg (MP3 bytes)
//
// xAI TTS: POST https://api.x.ai/v1/tts {"text","voice_id","language"} →
// raw MP3 (same call the Sona Mac app uses). Text is capped short on purpose —
// replies are a sentence or three.
// Secrets: XAI_API_KEY, XAI_TTS_VOICE (default ara), VOICE_BETA_OPEN,
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
const DEFAULT_VOICE = (Deno.env.get("XAI_TTS_VOICE") ?? "ara").trim().toLowerCase();
const VOICE_BETA_OPEN = (Deno.env.get("VOICE_BETA_OPEN") ?? "") === "true";
const ADMIN_UID = Deno.env.get("ADMIN_UID") ?? "";
const ADMIN_EMAILS = (Deno.env.get("ADMIN_EMAILS") ?? "")
  .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
const VOICES = ["ara", "eve", "leo", "rex", "sal"];
const MAX_TEXT = 800;

function isAdminUser(user: { id?: string; email?: string } | null): boolean {
  if (!user) return false;
  if (ADMIN_UID && user.id === ADMIN_UID) return true;
  const em = (user.email ?? "").toLowerCase();
  return !!em && ADMIN_EMAILS.includes(em);
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
  if (!VOICE_BETA_OPEN && !isAdminUser(user)) return json({ ok: false, error: "Voice is in private beta." }, 403);
  if (!XAI_API_KEY) return json({ ok: false, error: "Voice isn't configured yet." }, 503);

  // deno-lint-ignore no-explicit-any
  let body: any;
  try { body = await req.json(); } catch { return json({ ok: false, error: "Invalid JSON body" }, 400); }
  const text = typeof body?.text === "string" ? body.text.trim().slice(0, MAX_TEXT) : "";
  if (!text) return json({ ok: false, error: "Nothing to say." }, 400);
  const asked = String(body?.voice ?? "").toLowerCase();
  const voice = VOICES.includes(asked) ? asked : (VOICES.includes(DEFAULT_VOICE) ? DEFAULT_VOICE : "ara");

  try {
    const res = await fetch("https://api.x.ai/v1/tts", {
      method: "POST",
      headers: { Authorization: `Bearer ${XAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice_id: voice, language: "en" }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      console.error("[tts] xai failed", res.status, (await res.text()).slice(0, 600));
      return json({ ok: false, error: "Voice unavailable right now." }, 502);
    }
    const audio = await res.arrayBuffer();
    return new Response(audio, {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": res.headers.get("content-type") || "audio/mpeg", "Cache-Control": "no-store" },
    });
  } catch (e) {
    console.error("[tts] error", e);
    return json({ ok: false, error: "Voice unavailable right now." }, 502);
  }
});
