import { verifyToken } from "@/lib/outreach/tokens";
import { createServiceClient } from "@/lib/supabase/server";

// Click redirect. Links in the email are rewritten to /api/e/c/{token}; the real
// destination is INSIDE the signed token, so there is no open-redirect (an
// attacker can't mint a token pointing anywhere). We log a 'click' event, then
// 302 to the original URL.

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const payload = verifyToken<{ e: string; s: number; u: string; t: string }>(token);
  if (payload?.t !== "c" || !payload.u || !/^https?:\/\//i.test(payload.u)) {
    return new Response("Invalid link", { status: 400 });
  }
  try {
    const supabase = createServiceClient();
    await supabase.from("email_events").insert({
      enrollment_id: payload.e,
      step_no: payload.s ?? null,
      type: "click",
      meta: { url: payload.u },
    });
  } catch {
    /* never block the redirect over a logging failure */
  }
  return Response.redirect(payload.u, 302);
}
