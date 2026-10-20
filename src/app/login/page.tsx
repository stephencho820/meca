"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Wrench } from "lucide-react";
import { browserDb } from "@/lib/supabase";
export default function LoginPage() {
  const router=useRouter(),[email,setEmail]=useState(""),[password,setPassword]=useState(""),[error,setError]=useState(""),[loading,setLoading]=useState(false);
  async function login(e:React.FormEvent){e.preventDefault();setError("");const db=browserDb();if(!db){setError("로그인 서버가 아직 연결되지 않았습니다. 관리자 데모를 이용해 주세요.");return;}
    setLoading(true);const {error}=await db.auth.signInWithPassword({email,password});setLoading(false);if(error){setError(error.message.toLowerCase().includes("email not confirmed")?"이메일 인증이 완료되지 않았습니다. 받은 편지함에서 인증 링크를 확인해 주세요.":"로그인에 실패했습니다. 이메일과 비밀번호를 확인해 주세요.");return;}router.push("/dashboard");router.refresh();
  }
  return <><header className="navbar"><div className="container nav-inner"><Link href="/" className="logo"><span className="logo-icon"><Wrench size={20}/></span> meca.</Link></div></header><div className="auth-layout"><form className="auth-card" onSubmit={login}><span className="eyebrow">WELCOME BACK</span><h1>다시 만나 반가워요.</h1><p>메카 계정으로 로그인하고 예약을 관리하세요.</p><div className="field-group"><label className="field-label">이메일</label><input className="field" type="email" required autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="email@example.com"/></div><div className="field-group"><label className="field-label">비밀번호</label><input className="field" type="password" required value={password} onChange={e=>setPassword(e.target.value)} placeholder="비밀번호"/></div>{error&&<p className="error">{error}</p>}<button disabled={loading} className="btn btn-dark btn-wide" type="submit">{loading?"로그인 중...":"로그인"}</button><p style={{textAlign:"center"}}>아직 계정이 없으세요? <Link href="/start" style={{color:"#368448",fontWeight:800}}>무료로 시작하기</Link></p><Link href="/dashboard?demo=1" className="btn btn-outline btn-wide">관리자 데모 보기</Link></form></div></>;
}
