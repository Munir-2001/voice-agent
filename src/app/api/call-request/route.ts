import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { toE164US } from "@/lib/phone";
import { cleanName, cleanEmail } from "@/lib/clean";
import { clientIp } from "@/lib/security";
import { rateLimit } from "@/lib/rate-limit";
import { DEFAULT_WORKSPACE_ID } from "@/lib/workspace";

// PUBLIC, cross-origin intake for the "request a demo AI call" form (e.g. the
// portfolio site). This is the ONLY unauthenticated write endpoint, so it is
// deliberately defensive — but its real safety is architectural: a submission is
// only ever stored as a PENDING request. Nothing dials until the account holder
// approves it in the dashboard, so even a flood of spam can't spend a cent.
//
// Layers here: IP rate-limit · honeypot · strict phone validation · per-phone
// dedupe. No session/same-origin (it's meant to be called from another domain).

export const dynamic = "force-dynamic";

// Which origin(s) may call this from a browser. Comma-separated allowlist in
// PORTFOLIO_ORIGIN (e.g. "https://munirabbasi.com,https://www.munirabbasi.com").
// Empty → allow any origin ("*"), which is safe here: no cookies/credentials are
// used and the endpoint only ever creates a pending row.
function allowedOrigin(request: Request): string {
  const configured = (process.env.PORTFOLIO_ORIGIN ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (configured.length === 0) return "*";
  const origin = request.headers.get("origin") ?? "";
  return configured.includes(origin) ? origin : configured[0];
}

function corsHeaders(request: Request): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": allowedOrigin(request),
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

// Preflight.
export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

const STR = z.preprocess(
  (v) => (v == null ? "" : String(v).slice(0, 500)),
  z.string(),
);

const Body = z.object({
  name: STR,
  businessName: STR.optional(),
  phone: STR,
  email: STR.optional(),
  industry: STR.optional(),
  message: STR.optional(),
  // Honeypot: a hidden field real users never see/fill. Any value → treat as a
  // bot and silently succeed (so the bot doesn't learn it was blocked).
  hp: STR.optional(),
});

function json(body: unknown, status: number, request: Request) {
  return NextResponse.json(body, { status, headers: corsHeaders(request) });
}

export async function POST(request: Request) {
  // Tight per-IP limit — this is a human filling a form, not a hot path.
  const ip = clientIp(request);
  const rl = rateLimit(`call-request:${ip}`, 5, 60_000);
  if (!rl.ok) return json({ error: "Too many requests — try again shortly" }, 429, request);

  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return json({ error: "Not accepting requests right now" }, 503, request);
  }

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: "Invalid request" }, 400, request);
  const b = parsed.data;

  // Honeypot tripped → pretend success, store nothing.
  if (b.hp && b.hp.trim()) return json({ ok: true }, 200, request);

  const phone = toE164US(b.phone ?? "");
  if (!phone) {
    return json(
      { error: "Please enter a valid US phone number" },
      422,
      request,
    );
  }
  const name = cleanName(b.name);
  if (!name) return json({ error: "Please enter your name" }, 422, request);

  const workspaceId =
    Number(process.env.PORTFOLIO_WORKSPACE_ID) || DEFAULT_WORKSPACE_ID;
  const supabase = createServiceClient();

  // Dedupe: if this number already has a request awaiting review in this
  // workspace, don't pile on another row — just acknowledge success.
  const { data: existing } = await supabase
    .from("call_requests")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("phone", phone)
    .eq("status", "pending")
    .maybeSingle();
  if (existing) return json({ ok: true, deduped: true }, 200, request);

  const { error } = await supabase.from("call_requests").insert({
    workspace_id: workspaceId,
    name,
    business_name: cleanName(b.businessName ?? ""),
    phone,
    email: cleanEmail(b.email ?? ""),
    industry: (b.industry ?? "").trim(),
    message: (b.message ?? "").trim() || null,
    source: "portfolio",
    status: "pending",
    ip,
    user_agent: (request.headers.get("user-agent") ?? "").slice(0, 300),
  });
  if (error) {
    console.error("call-request insert failed:", error.message);
    // Most likely the migration hasn't been run yet.
    return json({ error: "Could not submit your request" }, 500, request);
  }

  return json({ ok: true }, 201, request);
}
