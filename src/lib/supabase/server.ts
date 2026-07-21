import "server-only"; // hard fail if this (holds the service-role key) is ever imported client-side
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Server-side Supabase client (uses the anon key + user session cookies).
 * Requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // called from a Server Component — safe to ignore when middleware
            // is refreshing sessions.
          }
        },
      },
    },
  );
}

/**
 * Service-role client for trusted server work (webhook writes, scheduler).
 * NEVER import this into client components. Requires SUPABASE_SERVICE_ROLE_KEY.
 */
export function createServiceClient() {
  const { createClient } = require("@supabase/supabase-js");
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}
