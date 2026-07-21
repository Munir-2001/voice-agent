import { redirect } from "next/navigation";

export default function Home() {
  // Real app: check the Supabase session and route to /login or /overview.
  redirect("/overview");
}
