"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, Wrench } from "lucide-react";
import { browserDb } from "@/lib/supabase";

/**
 * Supabase's default Confirm Signup email URL redirects with an auth code or
 * URL fragment. Exchange it in the browser where the PKCE verifier and
 * browser cookies live, then navigate to the shop dashboard.
 *
 * For customized server-side TokenHash emails use /auth/confirm instead.
 */
export default function AuthCallback() {
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let mounted = true;
    async function finish() {
      const db = browserDb();
      if (!db) { setErrorMessage("인증 서버가 연결되어 있지 않습니다."); return; }

      const url = new URL(window.location.href);
      const queryError = url.searchParams.get("error") || url.searchParams.get("error_description");
      const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
      const fragmentError = hash.get("error") || hash.get("error_description");
      if (queryError || fragmentError) {
        if (mounted) setErrorMessage("인증 링크가 만료되었거나 유효하지 않습니다. 다시 로그인해 주세요.");
        return;
      }
      try {
        const code = url.searchParams.get("code");

        // Creating a browser client can already exchange URL tokens.
        // Check for a session before attempting a second code exchange.
        let { data: sessionData } = await db.auth.getSession();
        if (!sessionData.session && code) {
          const exchange = await db.auth.exchangeCodeForSession(code);
          if (exchange.error) throw exchange.error;
          sessionData = { session: exchange.data.session };
        }

        const { data: { user }, error } = await db.auth.getUser();
        if (error || !user) throw error || new Error("No session after verification");
        // Full navigation ensures the browser's Supabase cookies are ready.
        window.location.replace("/dashboard");
      } catch {
        if (mounted) setErrorMessage("인증을 완료하지 못했습니다. 로그인하거나 새로운 인증 메일을 요청해 주세요.");
      }
    }
    void finish();
    return () => { mounted = false; };
  }, []);

  return <div className="auth-layout">
    <div className="auth-card" style={{ textAlign: "center" }}>
      <Link href="/" className="logo" style={{ justifyContent: "center" }}>
        <span className="logo-icon"><Wrench size={20} /></span>meca.
      </Link>
      {errorMessage ? <>
        <h1>이메일 인증을 확인해 주세요.</h1>
        <p className="error">{errorMessage}</p>
        <Link href="/login" className="btn btn-dark btn-wide">로그인으로 이동</Link>
        <Link href="/start" className="btn btn-outline btn-wide" style={{ marginTop: 10 }}>회원가입 다시 하기</Link>
      </> : <>
        <CheckCircle2 size={43} color="#3d8b52" style={{ marginTop: 28 }} />
        <h1>인증 중이에요.</h1>
        <p>안전하게 계정을 확인하고 관리자 페이지로 이동합니다.</p>
        <Loader2 size={23} className="spin" />
      </>}
    </div>
  </div>;
}
