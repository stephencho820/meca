import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";

/**
 * Optional email-template endpoint for token_hash based signup confirmation.
 * Template: {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email
 * Never redirect to arbitrary URLs supplied in a query string.
 */
export async function GET(request: NextRequest) {
  const destination = new URL("/dashboard", request.url);
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  if (!tokenHash || tokenHash.length > 2048 || (type !== "email" && type !== "signup")) {
    return NextResponse.redirect(new URL("/login?error=invalid_link", request.url));
  }
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.redirect(new URL("/login?error=server", request.url));
  }

  const response = NextResponse.redirect(destination);
  const client = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() { return request.cookies.getAll(); },
      setAll(cookies: Array<{ name: string; value: string; options?: unknown }>) {
        cookies.forEach(({ name, value, options }) => {
          request.cookies.set(name, value);
          response.cookies.set({
            name,
            value,
            ...(options && typeof options === "object" ? options : {})
          });
        });
      }
    }
  });

  const { error } = await client.auth.verifyOtp({
    token_hash: tokenHash,
    type: type as EmailOtpType
  });

  if (error) return NextResponse.redirect(new URL("/login?error=invalid_link", request.url));
  return response;
}
