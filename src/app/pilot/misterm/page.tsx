"use client";
import {useState,type FormEvent} from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {KeyRound,ShieldCheck,Wrench} from "lucide-react";

export default function FirstPilotPage(){
 const [code,setCode]=useState("");
 const [message,setMessage]=useState("");
 const router=useRouter();
 function continueSetup(e:FormEvent){
   e.preventDefault();
   if(!/^[0-9a-f]{64}$/.test(code.trim())){
     setMessage("전달받은 64자리 초대 코드를 확인해 주세요.");return;
   }
   // Session-scoped only: never place the invite in a URL, analytics event,
   // localStorage, or an HTTP referrer.
   sessionStorage.setItem("meca-pilot-invite",code.trim());
   router.push("/dashboard");
 }
 return <main className="auth-layout">
  <section className="auth-card" style={{maxWidth:560}}>
   <Link href="/" className="logo"><span className="logo-icon"><Wrench size={18}/></span>meca.</Link>
   <span className="eyebrow" style={{display:"block",marginTop:25}}>PRIVATE PILOT INVITATION</span>
   <h1>첫 번째 정비소 무료 파일럿</h1>
   <p><strong>미스터엠 대상 제안용 준비 페이지</strong>입니다. 실제 제휴나 사용 승인이 완료되었다는 의미는 아닙니다.</p>
   <div style={{background:"#f4f8ee",padding:16,borderRadius:12,fontSize:13,lineHeight:1.9,marginBottom:20}}>
    <ShieldCheck size={18} style={{verticalAlign:"middle",marginRight:8}}/>
    <strong>안전한 시작 순서</strong>
    <div>① 사장님 본인 이메일 가입·인증 → ② 비밀 초대 코드 사용 → ③ 영업시간·정비 항목·개인정보 안내 확인 → ④ 고객 예약 공개</div>
    <div>초대 코드 사용 전에는 미스터엠 명의의 실제 예약을 받지 않습니다.</div>
   </div>
   <form onSubmit={continueSetup}>
    <label className="field-group"><span className="field-label">전달받은 비공개 초대 코드</span>
     <input className="field" value={code} type="password" autoComplete="off"
       placeholder="64자리 초대 코드" maxLength={64} required onChange={e=>setCode(e.target.value)}/>
    </label>
    {message&&<p className="error" role="alert">{message}</p>}
    <button className="btn btn-dark btn-wide" type="submit"><KeyRound size={17}/> 초대 코드 확인 후 계속</button>
   </form>
   <p className="hint" style={{marginTop:18}}>이미 MECA 계정이 있으면 로그인하세요. 매장 계정이 없는 분은 본인 이메일로 먼저 가입해야 합니다.</p>
   <div style={{display:"flex",gap:9,flexWrap:"wrap"}}>
    <Link className="btn btn-outline" href="/start?name=%EB%AF%B8%EC%8A%A4%ED%84%B0%EC%97%A0">사장님 이메일로 가입</Link>
    <Link className="btn btn-outline" href="/login">로그인</Link>
   </div>
   <p className="hint">가입 또는 로그인 후 이 페이지에서 코드를 다시 입력할 수 있어요. 초대 코드는 타인에게 공개하지 마세요.</p>
  </section>
 </main>;
}
