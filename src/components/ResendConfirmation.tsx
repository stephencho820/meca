"use client";
import {useState,type FormEvent} from "react";
import {resendSignupConfirmation} from "@/lib/auth-email";

export default function ResendConfirmation({defaultEmail=""}:{defaultEmail?:string}){
 const [email,setEmail]=useState(defaultEmail);
 const [pending,setPending]=useState(false);
 const [sent,setSent]=useState(false);
 const [error,setError]=useState("");
 async function resend(event:FormEvent){
  event.preventDefault();if(sent||pending)return;
  setPending(true);setError("");
  try{
   const result=await resendSignupConfirmation(email);
   if(result.error)setError(result.error);
   else setSent(true);
  }catch{setError("요청을 처리하지 못했습니다. 다시 시도해 주세요.");}
  finally{setPending(false);}
 }
 return <form onSubmit={e=>void resend(e)} style={{marginTop:22,textAlign:"left"}}>
  <label className="field-group">
   <span className="field-label">아직 이메일 인증이 안 됐다면 인증 메일 다시 받기</span>
   <input className="field" type="email" autoComplete="email" required maxLength={254}
    value={email} disabled={pending||sent}
    placeholder="회원가입에 사용한 이메일" onChange={e=>setEmail(e.target.value)}/>
  </label>
  {sent?<p className="success" role="status">인증이 필요한 계정이라면 이메일을 다시 보냈습니다. 최신 메일의 버튼을 한 번만 눌러 주세요.</p>
   :<button type="submit" className="btn btn-outline btn-wide" disabled={pending||!email.trim()}>
      {pending?"인증 메일 요청 중...":"인증 메일 다시 보내기"}</button>}
  {error&&<p role="alert" className="error">{error}</p>}
  <p className="hint">이미 인증된 계정이라면 메일 재발송 대신 로그인해 주세요.</p>
 </form>;
}
