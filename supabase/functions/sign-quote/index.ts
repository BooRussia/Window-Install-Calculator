// sign-quote
// Public, token-gated endpoint for the customer e-signature flow (E-sign Phase B).
//
// The link a customer receives is  <app>/#/sign/<token>  where <token> is the
// random uuid primary key of a public.shared_quotes row. That uuid is an
// unguessable capability: holding it IS the authorization, exactly like a
// DocuSign / Calendly signing link. This function runs with the service role
// (bypassing RLS) and is the ONLY public door to the shared_quotes table —
// the table's own RLS grants direct access to the row owner alone.
//
// verify_jwt is FALSE on purpose: the customer who signs is not (and should
// not have to be) a logged-in Supabase user. Access is gated entirely by
// possession of the token. This file is self-contained (no ../_shared imports)
// so it deploys as a single bundle.
//
// Actions (POST JSON { action, token, ... }):
//   "get"  -> return the customer-safe snapshot; marks 'sent' -> 'viewed'.
//   "sign" -> record typed legal name + drawn signature + audit metadata.
//             Sets status 'signed'. Idempotent: re-signing a signed row is a
//             no-op that returns the existing signature timestamp.

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
function err(message: string, status = 400): Response {
  return json({ ok: false, error: message }, status);
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_NAME = 160;
const MAX_SIG_BYTES = 600 * 1024; // ~600 KB ceiling on the drawn-signature image

// Strip every sensitive column before anything reaches the public signer.
// (Never expose signer_ip, signer_user_agent, or the raw signature blob.)
function publicView(row: Record<string, any>) {
  const expired = row.expires_at
    ? new Date(row.expires_at).getTime() < Date.now()
    : false;
  return {
    status: row.status,
    detail_level: row.detail_level,
    snapshot: row.snapshot,
    signer_name: row.signer_name ?? null,
    signed_at: row.signed_at ?? null,
    expires_at: row.expires_at ?? null,
    expired,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return err("Method not allowed", 405);

  let body: any;
  try { body = await req.json(); }
  catch { return err("Invalid JSON body", 400); }

  const action = String(body?.action || "");
  const token = String(body?.token || "");
  if (!UUID_RE.test(token)) return err("Invalid or missing token", 400);

  const { data: row, error: loadErr } = await admin
    .from("shared_quotes")
    .select("*")
    .eq("id", token)
    .maybeSingle();
  if (loadErr) return err("Lookup failed", 500);
  if (!row) return err("not_found", 404);
  if (row.status === "void") return json({ ok: false, status: "void" }, 410);

  const expired = row.expires_at
    ? new Date(row.expires_at).getTime() < Date.now()
    : false;

  // -------------------------------------------------------- GET
  if (action === "get") {
    if (row.status === "sent" && !expired) {
      const { data: upd } = await admin
        .from("shared_quotes")
        .update({ status: "viewed", viewed_at: new Date().toISOString() })
        .eq("id", token)
        .eq("status", "sent") // guard against double-stamping viewed_at
        .select("*")
        .maybeSingle();
      if (upd) return json({ ok: true, quote: publicView(upd) });
    }
    return json({ ok: true, quote: publicView(row) });
  }

  // -------------------------------------------------------- SIGN
  if (action === "sign") {
    if (expired) return json({ ok: false, status: "expired" }, 410);
    if (row.status === "declined") return json({ ok: false, status: "declined" }, 409);
    if (row.status === "signed") {
      return json({
        ok: true, alreadySigned: true,
        signed_at: row.signed_at, signer_name: row.signer_name,
      });
    }

    const signerName = String(body?.signerName || "").trim();
    const signature = String(body?.signature || "");
    const consent = body?.consent === true;

    if (signerName.length < 2 || signerName.length > MAX_NAME)
      return err("A typed legal name is required.", 422);
    if (!/^data:image\/(png|jpeg);base64,/.test(signature))
      return err("A drawn signature is required.", 422);
    const sigBytes = Math.floor((signature.split(",")[1] || "").length * 0.75);
    if (sigBytes > MAX_SIG_BYTES)
      return err("Signature image is too large.", 413);
    if (!consent)
      return err("Consent to sign electronically is required.", 422);

    const fwd = req.headers.get("x-forwarded-for") || "";
    const ip = fwd.split(",")[0].trim() || null;
    const ua = req.headers.get("user-agent") || null;

    const { data: signed, error: signErr } = await admin
      .from("shared_quotes")
      .update({
        status: "signed",
        signer_name: signerName,
        signer_signature: signature,
        signer_ip: ip,
        signer_user_agent: ua,
        signed_at: new Date().toISOString(),
      })
      .eq("id", token)
      .neq("status", "signed") // race guard: don't overwrite an existing signature
      .select("status, signed_at, signer_name")
      .maybeSingle();
    if (signErr) return err("Could not record signature", 500);
    if (!signed) {
      // Lost the race — someone signed between our read and write. Treat as done.
      const { data: now } = await admin
        .from("shared_quotes")
        .select("signed_at, signer_name")
        .eq("id", token)
        .maybeSingle();
      return json({
        ok: true, alreadySigned: true,
        signed_at: now?.signed_at ?? null, signer_name: now?.signer_name ?? null,
      });
    }
    return json({ ok: true, signed_at: signed.signed_at, signer_name: signed.signer_name });
  }

  return err("Unknown action", 400);
});
