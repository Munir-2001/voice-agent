import { verifyToken } from "@/lib/outreach/tokens";
import { createServiceClient } from "@/lib/supabase/server";

// Unsubscribe. The footer link is /api/e/u/{token}. We add the lead's email to
// the workspace's email_suppression list (so ALL campaigns skip it), mark this
// enrollment unsubscribed, log the event, and show a plain confirmation page.

export const dynamic = "force-dynamic";

function page(message: string, status = 200): Response {
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribe</title></head><body style="font-family:system-ui,sans-serif;max-width:32rem;margin:12vh auto;padding:0 1.5rem;color:#222;text-align:center"><h1 style="font-size:1.25rem">${message}</h1></body></html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

type Enrollment = {
  id: string;
  leads: { email: string | null } | { email: string | null }[] | null;
  email_campaigns: { workspace_id: number } | { workspace_id: number }[] | null;
};

function first<T>(v: T | T[] | null): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const payload = verifyToken<{ e: string; t: string }>(token);
  if (payload?.t !== "u" || !payload.e) {
    return page("This unsubscribe link is invalid.", 400);
  }

  try {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from("email_enrollments")
      .select("id, leads(email), email_campaigns(workspace_id)")
      .eq("id", payload.e)
      .maybeSingle();
    const enr = data as Enrollment | null;
    if (!enr) return page("You've been unsubscribed.");

    const email = (first(enr.leads)?.email ?? "").trim();
    const workspaceId = first(enr.email_campaigns)?.workspace_id ?? null;

    if (email && workspaceId != null) {
      await supabase
        .from("email_suppression")
        .upsert(
          { workspace_id: workspaceId, email, reason: "unsubscribe" },
          { onConflict: "workspace_id,email", ignoreDuplicates: true },
        );
    }
    await supabase
      .from("email_enrollments")
      .update({ status: "unsubscribed", next_send_at: null })
      .eq("id", enr.id);
    await supabase
      .from("email_events")
      .insert({ enrollment_id: enr.id, type: "unsub" });
  } catch {
    /* still confirm to the user even if logging failed */
  }

  return page("You've been unsubscribed. You won't receive further emails.");
}
