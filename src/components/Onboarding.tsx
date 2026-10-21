"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { browserDb } from "@/lib/supabase";
function Form(){
  const search=useSearchParams();const [name,setName]=useState(search.get("name")||""),[email,setEmail]=useState(""),[password,setPassword]=useState(""),[message,setMessage]=useState(""),[error,setError]=useState(""),[working,setWorking]=useState(false);
  async function submit(e:React.FormEvent){e.preventDefault();setError("");if(password.length<8){setError("비밀번호는 8자 이상 입력해 주세요.");return;}if(!name.trim()){setError("가게 이름을 입력해 주세요.");return;}
    const db=browserDb();if(!db){setError("아직 계정 생성 서버가 연결되지 않았습니다. 데모 모드에서 기능을 체험할 수 있습니다.");return;}
    if(search.get("pilot")==="misterm")sessionStorage.setItem("meca-pilot-onboarding","misterm");
    setWorking(true);const origin=window.location.origin;const {data,error}=await db.auth.signUp({email:email.trim().toLowerCase(),password,options:{emailRedirectTo:origin+"/auth/callback",data:{shop_name:name.trim().slice(0,70)}}});setWorking(false);
    if(error){setError("계정을 만들지 못했습니다: "+error.message);return;}
    localStorage.setItem("meca-pending-shop",name.trim().slice(0,70));
    if(data.session){window.location.href="/dashboard";return;}
    setMessage("가입 요청이 접수됐어요. 이메일로 받은 인증 링크를 누르면 MECA로 돌아옵니다. 메일이 보이지 않으면 스팸함도 확인해 주세요.");
  }
  return <form className="auth-card" onSubmit={submit}><span className="eyebrow">GET STARTED</span><h1>우리 가게 예약,<br/>오늘부터 메카로.</h1><p>몇 가지 정보만 입력하면 독립적인 예약 페이지를 만들 수 있습니다.</p>{message?<><p className="success">{message}</p><Link className="btn btn-dark btn-wide" href="/login">로그인으로 이동</Link></>:<><div className="field-group"><label className="field-label">가게 이름 *</label><input className="field" value={name} maxLength={70} onChange={e=>setName(e.target.value)} placeholder="예: 우리 동네 모터스" required/></div><div className="field-group"><label className="field-label">이메일 *</label><input className="field" value={email} onChange={e=>setEmail(e.target.value)} type="email" autoComplete="email" placeholder="you@workshop.kr" required/></div><div className="field-group"><label className="field-label">비밀번호 *</label><input className="field" value={password} onChange={e=>setPassword(e.target.value)} type="password" autoComplete="new-password" minLength={8} placeholder="8자 이상" required/></div>{error&&<p className="error">{error}</p>}<button type="submit" disabled={working} className="btn btn-dark btn-wide">{working?"계정 생성 중...":"무료 계정 만들기"}</button><p style={{textAlign:"center",fontSize:12}}>계정 생성 후 매장 설정 및 예약 링크를 발급합니다.</p><Link className="btn btn-outline btn-wide" href="/demo">가입 전에 예약 체험하기</Link></>}</form>;
}
export default function Onboarding(){return <Suspense fallback={<div>로딩 중...</div>}><Form/></Suspense>;}
