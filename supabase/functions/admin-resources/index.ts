// admin-resources
// Serves the owner-only Resources guide. These files intentionally live inside
// the Edge Function bundle instead of the public site root, so possession of a
// valid owner/admin session is required before either JSON or PDF content is
// returned.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  corsHeaders,
  errorResponse,
  handlePreflight,
} from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

// Match the in-app owner gate, with env vars available for production override.
const ADMIN_UID = (Deno.env.get("ADMIN_UID") ?? "").trim() ||
  "62ffcd5f-fb8c-4574-8942-0c273b399a17";
const ADMIN_EMAILS = ((Deno.env.get("ADMIN_EMAILS") ?? "").trim() ||
  "voxeldesignedit@gmail.com")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

const RESOURCES_JSON = new URL("./anchor-resources.json", import.meta.url);
const RESOURCES_PDF = new URL("./anchor-how-it-works.pdf", import.meta.url);

function assetHeaders(extra: Record<string, string>): HeadersInit {
  return {
    ...corsHeaders,
    "Cache-Control": "no-store, max-age=0",
    ...extra,
  };
}

function isAdminUser(user: { id?: string; email?: string } | null): boolean {
  if (!user) return false;
  if (ADMIN_UID && user.id === ADMIN_UID) return true;
  const em = (user.email ?? "").toLowerCase();
  return !!em && ADMIN_EMAILS.includes(em);
}

async function requireAdmin(req: Request): Promise<Response | null> {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return errorResponse("Missing bearer token", 401);
  }

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) return errorResponse("Invalid auth", 401);
  if (!isAdminUser(user)) return errorResponse("Owner-only resources", 403);
  return null;
}

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  const authError = await requireAdmin(req);
  if (authError) return authError;

  let body: { type?: string } = {};
  try {
    body = await req.json();
  } catch {
    // Default below handles an empty body.
  }

  if ((body.type ?? "json") === "json") {
    return new Response(await Deno.readTextFile(RESOURCES_JSON), {
      headers: assetHeaders({ "Content-Type": "application/json; charset=utf-8" }),
    });
  }

  if (body.type === "pdf") {
    return new Response(await Deno.readFile(RESOURCES_PDF), {
      headers: assetHeaders({
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="anchor-how-it-works.pdf"',
      }),
    });
  }

  return errorResponse("Unknown resource type", 400);
});
