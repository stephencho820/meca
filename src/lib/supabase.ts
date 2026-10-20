import { createBrowserClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
export function configured() { return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY); }
export function browserDb() {
  if (!configured()) return null;
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}
export function publicDb() {
  if (!configured()) return null;
  // Anon key only. This never bypasses RLS; public writes use narrow SQL RPCs.
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
}
