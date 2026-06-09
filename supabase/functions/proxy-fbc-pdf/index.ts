// proxy-fbc-pdf
// Tiny reverse-proxy for floridabuilding.org PDFs so the browser can fetch
// them cross-origin (FBC sets X-Frame-Options: SAMEORIGIN + no CORS header).
//
// Usage: GET /proxy-fbc-pdf?url=<encoded-fbc-url>
// Whitelists only floridabuilding.org/upload/* to prevent open-proxy abuse.
// Streams the response back with CORS + a 1-day public cache hint.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "GET") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const target = url.searchParams.get("url");
  if (!target) {
    return new Response("Missing ?url= parameter", { status: 400, headers: corsHeaders });
  }

  let parsed: URL;
  try { parsed = new URL(target); }
  catch { return new Response("Invalid url", { status: 400, headers: corsHeaders }); }

  if (parsed.hostname !== "www.floridabuilding.org" ||
      !parsed.pathname.startsWith("/upload/PR_")) {
    return new Response("Only floridabuilding.org/upload/PR_* allowed", {
      status: 403, headers: corsHeaders,
    });
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      headers: { "User-Agent": "Mozilla/5.0 (Anchor proxy)" },
      // The whitelist above is checked on the INITIAL url only — refuse to
      // follow redirects so upstream can't bounce us to an arbitrary host.
      redirect: "error",
      signal: AbortSignal.timeout(60_000),
    });
  } catch (err) {
    console.error("[fbc-proxy] upstream fetch failed", err);
    return new Response("Upstream fetch failed", { status: 502, headers: corsHeaders });
  }

  if (!upstream.ok) {
    return new Response(`Upstream returned ${upstream.status}`,
      { status: 502, headers: corsHeaders });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": upstream.headers.get("content-type") ?? "application/pdf",
      "Content-Length": upstream.headers.get("content-length") ?? "",
      "Cache-Control": "public, max-age=86400, s-maxage=604800",
      "Content-Disposition": "inline",
    },
  });
});
