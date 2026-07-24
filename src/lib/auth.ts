import "server-only";
import { unstable_rethrow } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAuthConfigured } from "@/lib/supabase/config";

// Returns the authenticated user (validated against Supabase, not just a decoded
// cookie), or null. Route handlers call this to gate state-changing endpoints —
// the proxy protects pages, but each API route re-checks (defense in depth, and
// server functions can slip past a proxy matcher).
//
// Never throws: if auth env is missing or Supabase is unreachable we return null
// (treated as "not signed in") rather than 500-ing the whole page. The proxy
// fails closed in that state, so returning null denies access — it never grants it.
export async function getSessionUser() {
  if (!isAuthConfigured()) return null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user ?? null;
  } catch (err) {
    // `cookies()` throws a framework control-flow error during static prerender
    // to mark the route dynamic — that must propagate, not be swallowed here.
    unstable_rethrow(err);
    console.error("getSessionUser failed:", err);
    return null;
  }
}
