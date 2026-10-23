"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import {CheckCircle2,Loader2,Wrench} from "lucide-react";
import {browserDb} from "@/lib/supabase";
import ResendConfirmation from "@/components/ResendConfirmation";

/**
 * Supports Supabase email confirmation in either PKCE (?code) or implicit
 * (#access_token, #refresh_token) mode, including a different mail browser.
 * Never relay auth tokens to external redirects or expose them in error text.
 */
export default function AuthCallback(){
 const [errorMessage,setErrorMessage]=useState("");
 const [working,setWorking]=useState(true);
 useEffect(()=>{
  let active=true;
  const finish=async()=>{
   const db=browserDb();
   if(!db){setErrorMessage("인증 서버 설정을 확인할 수 없습니다.");setWorking(false);return;}
   const url=new URL(window.location.href);
   const hash=new URLSearchParams(url.hash.slice(1));
   if(url.searchParams.get("error")||hash.get("error")){
    // An email link is single-use. On mobile, opening it again can produce
    // otp_expired even when the first click has already verified the account.
    // Never infer that signup itself failed from this provider redirect.
    const {data:{user}}=await db.auth.getUser();
    if(!active)return;
    window.history.replaceState(null,"",url.pathname);
    if(user?.email_confirmed_at){window.location.replace("/dashboard");return;}
    setErrorMessage("인증 링크가 이미 사용됐거나 만료됐을 수 있습니다. 계정이 만들어졌다면 먼저 로그인해 주세요. 인증이 안 됐다면 아래에서 새 메일을 받을 수 있어요.");
    setWorking(false);return;
   }
   try{
    const access=hash.get("access_token"),refresh=hash.get("refresh_token");
    if(access&&refresh){
      const {error}=await db.auth.setSession({access_token:access,refresh_token:refresh});
      if(error)throw error;
      // Strip fragment tokens without sharing them as referrer.
      window.history.replaceState(null,"",url.pathname);
    }
    const code=url.searchParams.get("code");
    if(code){
      // Browser client can exchange the PKCE token during initialization.
      const session=await db.auth.getSession();
      if(!session.data.session){
        const result=await db.auth.exchangeCodeForSession(code);
        if(result.error)throw result.error;
      }
    }
    const {data:{user},error}=await db.auth.getUser();
    if(!active)return;
    if(error||!user){
      setErrorMessage("이메일 인증이 끝났다면 MECA에 직접 로그인해 주세요. 메일 앱과 가입한 브라우저가 달라 로그인 정보가 전달되지 않았을 수 있습니다.");
      setWorking(false);return;
    }
    window.history.replaceState(null,"",url.pathname);
    window.location.replace("/dashboard");
   }catch{
    if(!active)return;
    // Confirmation can succeed at provider even if browser PKCE state was
    // lost: do not incorrectly ask the user to register a second time.
    setErrorMessage("인증 링크를 연 브라우저에서 로그인 세션을 불러오지 못했습니다. 인증이 완료됐을 수도 있으니 가입한 이메일과 비밀번호로 로그인해 주세요.");
    setWorking(false);
   }
  };
  void finish();
  return()=>{active=false;};
 },[]);
 return <div className="auth-layout"><div className="auth-card" style={{textAlign:"center"}}>
  <Link href="/" className="logo" style={{justifyContent:"center"}}><span className="logo-icon"><Wrench size={20}/></span>meca.</Link>
  {working?<><CheckCircle2 size={42} color="#3d8b52" style={{marginTop:26}}/>
    <h1>이메일 인증 확인 중</h1><p>인증이 확인되면 관리자 화면으로 이동합니다.</p><Loader2 className="spin" size={24}/></>:
    <><h1>인증 후 로그인이 필요합니다</h1><p className="error">{errorMessage}</p>
      <Link className="btn btn-dark btn-wide" href="/login">이메일로 로그인</Link>
      <ResendConfirmation/>
      <p className="hint" style={{marginTop:14}}>인증을 이미 완료했다면 다시 가입하지 말고 기존 이메일로 로그인하세요.</p>
    </>}
 </div></div>;
}
