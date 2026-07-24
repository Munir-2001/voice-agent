import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Endpoints that authenticate themselves (HMAC / shared secret) and are called
// by external services (ElevenLabs, the cron scheduler) — never gate these on a
// browser session, and skip the Supabase round-trip entirely for them.
const SELF_AUTHED_API = ["/api/webhook", "/api/dial-tick"];

function isPublic(pathname: string): boolean {
  return pathname === "/login" || pathname.startsWith("/login/");
}

// Refreshes the Supabase session cookie on every request and gates access:
// unauthenticated page requests → /login, unauthenticated API requests → 401.
// Signed-in users hitting /login are bounced to the console.
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // Self-authed external endpoints pass straight through.
  if (SELF_AUTHED_API.some((p) => pathname.startsWith(p))) {
    return NextResponse.next({ request });
  }

  // If auth env isn't set we cannot authenticate anyone, so fail CLOSED: send
  // pages to /login (which explains the misconfiguration) and reject APIs with
  // 503. Never fall through to the console — that would expose it unauthenticated.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    if (isPublic(pathname)) return NextResponse.next({ request });
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Auth is not configured" }, { status: 503 });
    }
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    return NextResponse.redirect(loginUrl);
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // Do not run other code between creating the client and getUser().
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isPublic(pathname)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

  if (user && isPublic(pathname)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/overview";
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}
