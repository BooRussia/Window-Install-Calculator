// generate-house-image
// Generates a randomized, photorealistic Florida-house image via the xAI image
// API (Grok Imagine) for use as an auto job thumbnail. Returns the image as a
// base64 data URL so the browser can blur it + overlay the job name on a
// <canvas> without cross-origin taint.
//
// Auth: verify_jwt = true (logged-in users only). XAI_API_KEY stays server-side.
// Model is overridable via the XAI_IMAGE_MODEL secret (default grok-imagine-image).

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
const XAI_IMAGE_MODEL = Deno.env.get("XAI_IMAGE_MODEL") ?? "grok-imagine-image";
const XAI_BASE = "https://api.x.ai/v1";

const STYLES = [
  "single-story Florida ranch house with a tile roof",
  "two-story Mediterranean-style Florida home with a barrel-tile roof",
  "Key West style coastal cottage on stilts",
  "modern white stucco Florida house with large impact windows",
  "Spanish colonial Florida home with arched windows",
  "classic concrete-block Florida house with a screened lanai",
];
const SCENES = [
  "under a bright blue sky with tall palm trees",
  "in warm golden-hour light with tropical landscaping",
  "with a manicured lawn, palms, and a clear sky",
  "on a quiet suburban street lined with swaying palms",
];

function b64FromBytes(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(bin);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);
  if (!XAI_API_KEY) return json({ ok: false, error: "Image generation is not configured" }, 500);

  const style = STYLES[Math.floor(Math.random() * STYLES.length)];
  const scene = SCENES[Math.floor(Math.random() * SCENES.length)];
  const prompt =
    `Photorealistic exterior real-estate photo of a ${style}, ${scene}. ` +
    `Daytime, residential, sharp focus, high detail, no text, no people, no watermark.`;

  let res: Response;
  try {
    res = await fetch(`${XAI_BASE}/images/generations`, {
      method: "POST",
      headers: { Authorization: `Bearer ${XAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: XAI_IMAGE_MODEL, prompt, n: 1, response_format: "b64_json" }),
    });
  } catch (_e) {
    return json({ ok: false, error: "Image service unreachable" }, 502);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return json({ ok: false, error: "Image API error", status: res.status, detail: detail.slice(0, 400) }, 502);
  }

  const data = await res.json().catch(() => null);
  const item = data && data.data && data.data[0];
  if (!item) return json({ ok: false, error: "No image returned" }, 502);

  let b64: string = item.b64_json || "";
  if (!b64 && item.url) {
    // Some responses return a URL — fetch + encode here so the client gets a
    // same-origin-safe data URL (no canvas taint).
    try {
      const imgRes = await fetch(item.url);
      b64 = b64FromBytes(new Uint8Array(await imgRes.arrayBuffer()));
    } catch (_e) {
      return json({ ok: false, error: "Could not retrieve generated image" }, 502);
    }
  }
  if (!b64) return json({ ok: false, error: "Empty image payload" }, 502);

  const mime = b64.startsWith("iVBOR") ? "image/png" : "image/jpeg";
  return json({ ok: true, image: `data:${mime};base64,${b64}` });
});
