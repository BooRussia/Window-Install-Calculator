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

  // Reject oversized payloads BEFORE buffering the body (the signature image
  // is capped at ~600 KB; 1 MB leaves headroom for the JSON envelope).
  const contentLength = parseInt(req.headers.get("content-length") ?? "0", 10);
  if (contentLength > 1_000_000) return err("Payload too large", 413);

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
    // An expired, unsigned link is a revoked read capability: return only the
    // brand block (so the page can still say who to ask for a fresh link) and
    // strip the quote body — customer name/address, line items, and totals
    // should not be readable forever once the link lapses. Signed quotes stay
    // viewable: the signer is a party to that record.
    if (expired && row.status !== "signed") {
      return json({
        ok: true,
        quote: {
          status: row.status,
          detail_level: row.detail_level,
          snapshot: { brand: (row.snapshot && row.snapshot.brand) || null },
          signer_name: null,
          signed_at: null,
          expires_at: row.expires_at ?? null,
          expired: true,
        },
      });
    }
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
    const sigB64 = signature.split(",")[1] || "";
    const sigBytes = Math.floor(sigB64.length * 0.75);
    if (sigBytes > MAX_SIG_BYTES)
      return err("Signature image is too large.", 413);
    // Verify the payload actually IS a PNG/JPEG, not 600 KB of arbitrary text
    // wearing a data-URL prefix: decode the head and check the magic bytes.
    let sigHead: Uint8Array;
    try {
      sigHead = Uint8Array.from(atob(sigB64.slice(0, 16)), (c) => c.charCodeAt(0));
    } catch {
      return err("A drawn signature is required.", 422);
    }
    const isPng = sigHead[0] === 0x89 && sigHead[1] === 0x50 && sigHead[2] === 0x4e && sigHead[3] === 0x47;
    const isJpeg = sigHead[0] === 0xff && sigHead[1] === 0xd8 && sigHead[2] === 0xff;
    if (!isPng && !isJpeg)
      return err("A drawn signature is required.", 422);
    if (!consent)
      return err("Consent to sign electronically is required.", 422);

    const fwd = req.headers.get("x-forwarded-for") || "";
    const ip = fwd.split(",")[0].trim() || null;
    const ua = req.headers.get("user-agent") || null;
    const nowIso = new Date().toISOString();

    const { data: signed, error: signErr } = await admin
      .from("shared_quotes")
      .update({
        status: "signed",
        signer_name: signerName,
        signer_signature: signature,
        signer_ip: ip,
        signer_user_agent: ua,
        signed_at: nowIso,
      })
      .eq("id", token)
      // Race guard: only the valid source states may transition to signed.
      // (.neq("signed") alone would let a signature overwrite a void/decline
      // that landed between our read and this write.)
      .in("status", ["sent", "viewed"])
      .select("status, signed_at, signer_name")
      .maybeSingle();
    if (signErr) return err("Could not record signature", 500);

    // Best-effort: flip the source job to "Approved" so it surfaces in the
    // installer's pipeline immediately. The job lives in jobs.data (jsonb),
    // scoped to the quote owner. A failure here must NOT fail the signature —
    // the signature record in shared_quotes is the source of truth.
    if (signed && row.job_id) {
      try {
        const { data: jobRow } = await admin
          .from("jobs").select("data")
          .eq("id", row.job_id).eq("user_id", row.user_id).maybeSingle();
        if (jobRow && jobRow.data && typeof jobRow.data === "object") {
          const d = jobRow.data as Record<string, unknown>;
          d.status = "Approved";
          d.signedAt = nowIso;
          d.signerName = signerName;
          d.signedQuoteId = token;
          await admin.from("jobs").update({ data: d })
            .eq("id", row.job_id).eq("user_id", row.user_id);
        }
      } catch (_) { /* best-effort — never block the signature on this */ }
    }

    if (!signed) {
      // Lost the race — the row left sent/viewed between our read and write.
      // Report what actually happened instead of assuming "signed".
      const { data: now } = await admin
        .from("shared_quotes")
        .select("status, signed_at, signer_name")
        .eq("id", token)
        .maybeSingle();
      if (now?.status === "signed") {
        return json({
          ok: true, alreadySigned: true,
          signed_at: now.signed_at ?? null, signer_name: now.signer_name ?? null,
        });
      }
      if (now?.status === "void") return json({ ok: false, status: "void" }, 410);
      if (now?.status === "declined") return json({ ok: false, status: "declined" }, 409);
      return err("Could not record signature", 500);
    }
    return json({ ok: true, signed_at: signed.signed_at, signer_name: signed.signer_name });
  }

  return err("Unknown action", 400);
});
