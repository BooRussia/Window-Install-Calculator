// CORS headers for Edge Functions.
//
// In production you may want to lock `Access-Control-Allow-Origin` down to
// your real domain(s) instead of "*". Stripe webhook does NOT need CORS
// (Stripe calls it server-to-server), but the two checkout/portal endpoints
// are hit directly from the browser.

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function handlePreflight(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  return null;
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status);
}

// Stripe success/cancel/return URLs are client-supplied. Anchor them to an
// origin allowlist so a crafted request can't bounce a user from a trusted
// Stripe-hosted page to an attacker URL after payment.
const ALLOWED_RETURN_ORIGINS = new Set([
  "https://anchorquoting.com",
  "https://www.anchorquoting.com",
  // local dev
  "http://localhost:8000",
  "http://localhost:8755",
  "http://127.0.0.1:8000",
  "http://127.0.0.1:8755",
]);

export function safeReturnUrl(
  candidate: string | null | undefined,
  fallback = "https://anchorquoting.com/",
): string {
  try {
    const u = new URL(candidate || "");
    if (ALLOWED_RETURN_ORIGINS.has(u.origin)) return u.toString();
  } catch {
    /* not a parseable URL */
  }
  return fallback;
}
