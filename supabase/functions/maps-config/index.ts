// maps-config
// Returns the publishable Google Maps JavaScript API key for the address
// picker. The key MUST be HTTP-referrer restricted in Google Cloud Console
// (anchorquoting.com, *.netlify.app, localhost). This endpoint is public on
// purpose — the value is destined for the browser either way.
//
// Secret: GOOGLE_MAPS_API_KEY

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": status === 200 ? "private, max-age=300" : "no-store",
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "GET" && req.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, 405);
  }

  const key = (Deno.env.get("GOOGLE_MAPS_API_KEY") ?? "").trim();
  if (!key) {
    return json({ ok: false, error: "Google Maps isn’t configured" }, 503);
  }

  return json({ ok: true, key });
});
