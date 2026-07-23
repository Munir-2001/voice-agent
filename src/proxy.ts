import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

// Next 16: the `middleware` convention was renamed to `proxy` (Node.js runtime).
// This refreshes the Supabase session and gates every non-public route.
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Run on everything EXCEPT static assets and image files, so auth logic
     * never blocks CSS/JS/images. API routes ARE matched (so unauthenticated
     * calls get a 401) — self-authed endpoints opt out inside updateSession.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)",
  ],
};
