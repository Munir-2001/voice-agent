import "server-only";
import { createClient } from "@/lib/supabase/server";

// Returns the authenticated user (validated against Supabase, not just a decoded
// cookie), or null. Route handlers call this to gate state-changing endpoints —
// the proxy protects pages, but each API route re-checks (defense in depth, and
// server functions can slip past a proxy matcher).
export async function getSessionUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ?? null;
}
