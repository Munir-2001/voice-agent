import { verifyToken } from "@/lib/outreach/tokens";
import { createServiceClient } from "@/lib/supabase/server";

// Open pixel. The email embeds <img src="/api/e/o/{token}">. We log an 'open'
// event and always return a 1x1 GIF — even on a bad token — so the image never
// shows broken. NOTE: opens are DIRECTIONAL only (Gmail proxies + Apple Mail
// Privacy Protection pre-fetch pixels); trust clicks + replies for real intent.

export const dynamic = "force-dynamic";

const GIF = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const payload = verifyToken<{ e: string; s: number; t: string }>(token);
  if (payload?.t === "o" && payload.e) {
    try {
      const supabase = createServiceClient();
      await supabase.from("email_events").insert({
        enrollment_id: payload.e,
        step_no: payload.s ?? null,
        type: "open",
      });
    } catch {
      /* never break the pixel over a logging failure */
    }
  }
  return new Response(GIF, {
    headers: {
      "Content-Type": "image/gif",
      "Content-Length": String(GIF.length),
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
    },
  });
}
