"use client";
import {useState,type FormEvent} from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {KeyRound,ShieldCheck,Wrench} from "lucide-react";
import {browserDb} from "@/lib/supabase";

export default function FirstPilotPage({practice=false}:{practice?:boolean}){
 const [code,setCode]=useState("");
 const [message,setMessage]=useState("");
 const router=useRouter();
 async function continueSetup(e:FormEvent){
   e.preventDefault();
   if(!/^[0-9a-f]{64}$/.test(code.trim())){
     setMessage("전달받은 64자리 초대 코드를 확인해 주세요.");return;
   }
   // Session-scoped only: never place the invite in a URL, analytics event,
   // localStorage, or an HTTP referrer.
   sessionStorage.setItem("meca-pilot-invite",code.trim());
   sessionStorage.setItem("meca-pilot-onboarding",practice?"owner-test":"misterm");
   const db=browserDb();
   const {data}=db?await db.auth.getSession():{data:{session:null}};
   if(data.session){router.push("/dashboard");return;}
   router.push(practice
     ?"/start?name=MECA-%EC%82%AC%EC%9E%A5%EB%8B%98-%EC%B2%B4%ED%97%98&pilot=owner-test"
     :"/start?name=%EB%AF%B8%EC%8A%A4%ED%84%B0%EC%97%A0&pilot=misterm");
 }
 return <main className="auth-layout">
  <section className="auth-card" style={{maxWidth:560}}>
   <Link href="/" className="logo"><span className="logo-icon"><Wrench size={18}/></span>meca.</Link>
   <span className="eyebrow" style={{display:"block",marginTop:25}}>PRIVATE PILOT INVITATION</span>
   <h1>{practice?"사장님 역할로 MECA 체험하기":"첫 번째 정비소 무료 파일럿"}</h1>
   {practice?<p><strong>실제 미스터엠과 무관한 연습용 매장</strong>으로, 사장님 계정 개설부터 매장 설정까지 직접 테스트합니다. 실제 고객 개인정보나 실제 매장 연락처는 입력하지 마세요.</p>
   :<p><strong>미스터엠 대상 제안용 준비 페이지</strong>입니다. 실제 제휴나 사용 승인이 완료되었다는 의미는 아닙니다.</p>}
   <div style={{background:"#f4f8ee",padding:16,borderRadius:12,fontSize:13,lineHeight:1.9,marginBottom:20}}>
    <ShieldCheck size={18} style={{verticalAlign:"middle",marginRight:8}}/>
    <strong>안전한 시작 순서</strong>
    <div>① 사장님 본인 이메일 가입·인증 → ② 비밀 초대 코드 사용 → ③ 영업시간·정비 항목·개인정보 안내 확인 → ④ 고객 예약 공개</div>
    <div>{practice?"연습용 초대 코드는 미스터엠 실제 초대장과 별개이며, 먼저 미스터엠이 사용 중인 코드를 소모하지 않습니다.":"초대 코드 사용 전에는 미스터엠 명의의 실제 예약을 받지 않습니다."}</div>
   </div>
   <form onSubmit={continueSetup}>
    <label className="field-group"><span className="field-label">전달받은 비공개 초대 코드</span>
     <input className="field" value={code} type="password" autoComplete="off"
       placeholder="64자리 초대 코드" maxLength={64} required onChange={e=>setCode(e.target.value)}/>
    </label>
    {message&&<p className="error" role="alert">{message}</p>}
    <button className="btn btn-dark btn-wide" type="submit"><KeyRound size={17}/> 초대 코드 확인 후 계속</button>
   </form>
   <p className="hint" style={{marginTop:18}}>현재 가입한 MECA 계정에 매장이 있으면 다른 이메일로 새 테스트 계정을 만들어야 해요. 비밀번호는 누구에게도 공유하지 마세요.</p>
   <div style={{display:"flex",gap:9,flexWrap:"wrap"}}>
    <Link className="btn btn-outline" href={practice?"/start?name=MECA-%EC%82%AC%EC%9E%A5%EB%8B%98-%EC%B2%B4%ED%97%98&pilot=owner-test":"/start?name=%EB%AF%B8%EC%8A%A4%ED%84%B0%EC%97%A0&pilot=misterm"}>사장님 이메일로 가입</Link>
    <Link className="btn btn-outline" href="/login">로그인</Link>
   </div>
   <p className="hint">가입 또는 로그인 후 초대 코드를 다시 입력할 수 있어요. 실제 고객 예약을 열기 전에는 사업장 정보와 개인정보 처리 안내를 확인해야 합니다.</p>
   {practice&&<Link href="/dashboard?demo=1" className="btn btn-outline btn-wide">가입 없이 예약·정비 관리 데모 체험하기</Link>}
  </section>
 </main>;
}
