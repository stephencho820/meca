"use client";
import {useCallback,useEffect,useMemo,useState} from "react";
import {Mail,RefreshCw} from "lucide-react";
import {browserDb} from "@/lib/supabase";
import type {Shop} from "@/lib/types";

type EmailItem={
 id:string;event_type:"requested"|"rescheduled"|"cancelled";
 created_at:string;status:string;attempts:number;error_code:string|null
};
const titles:Record<EmailItem["event_type"],string>={
 requested:"신규 예약",rescheduled:"예약 변경",cancelled:"예약 취소"
};
const label:Record<string,string>={
 pending:"발송 대기",retry:"재시도 대기",processing:"처리 중",
 submitted:"발송업체 접수",skipped:"발송 안 함",failed:"발송 실패",uncertain:"결과 확인 필요"
};
export default function OwnerEmailSettings({shop,isDemo}:{shop:Shop;isDemo:boolean}){
 const db=useMemo(()=>browserDb(),[]);
 const [enabled,setEnabled]=useState(true),[loaded,setLoaded]=useState(false);
 const [ready,setReady]=useState(false),[recipient,setRecipient]=useState("");
 const [rows,setRows]=useState<EmailItem[]>([]);
 const [error,setError]=useState(""),[notice,setNotice]=useState(""),[busy,setBusy]=useState(false);
 const reload=useCallback(async()=>{
  if(isDemo){setLoaded(true);return;}
  if(!db){setError("연결된 계정이 필요합니다.");setLoaded(true);return;}
  const {data:session}=await db.auth.getSession();
  const token=session.session?.access_token;
  const [p,j,config]=await Promise.all([
   db.from("owner_email_preferences").select("enabled").eq("shop_id",shop.id).maybeSingle(),
   db.from("owner_email_outbox").select("id,event_type,created_at,status,attempts,error_code")
     .eq("shop_id",shop.id).order("created_at",{ascending:false}).limit(30),
   token?fetch("/api/owner-email/status",{headers:{Authorization:`Bearer ${token}`},cache:"no-store"})
     .then(r=>r.ok?r.json():null).catch(()=>null):Promise.resolve(null)
  ]);
  if(p.error||j.error)setError("이메일 알림 설정 또는 발송 내역을 불러오지 못했습니다.");
  else{
   setEnabled(p.data?.enabled!==false);
   setRows((j.data||[]) as EmailItem[]);
  }
  if(config&&typeof config==="object"){
   setReady(Boolean(config.configured&&config.email_verified));
   setRecipient(typeof config.recipient==="string"?config.recipient:"");
  }
  setLoaded(true);
 },[db,isDemo,shop.id]);
 useEffect(()=>{void reload();},[reload]);
 async function toggle(){
  if(isDemo){setNotice("체험 모드에서는 실제 메일이 발송되지 않습니다.");return;}
  if(!db)return;
  setBusy(true);setNotice("");setError("");
  const {error:e}=await db.from("owner_email_preferences")
   .update({enabled:!enabled,updated_at:new Date().toISOString()})
   .eq("shop_id",shop.id);
  if(e)setError("설정을 저장하지 못했어요.");
  else{setEnabled(!enabled);setNotice(!enabled?"예약 알림을 켰어요. 발송 환경이 연결되면 새 예약부터 알림이 전송됩니다.":"예약 알림을 껐어요.");}
  setBusy(false);
 }
 return <div className="dash-panel" style={{maxWidth:780}}>
  <span className="eyebrow">OWNER BOOKING EMAIL</span>
  <h3 style={{display:"flex",alignItems:"center",gap:9}}><Mail size={21}/> 사장님 이메일 예약 알림</h3>
  <p className="booking-help">고객이 온라인으로 예약을 신청하거나 일정을 변경·취소하면 사장님이 가입할 때 인증한 이메일로 알립니다. <strong>무료 파일럿에 포함</strong>되며 고객 카카오 알림톡과는 별개입니다.</p>
  {loaded&&<div className="resource-item" style={{marginTop:16}}>
    <div><strong>{isDemo?"체험 모드":ready?"이메일 발송 서비스 연결됨":"이메일 발송 준비 중"}</strong>
      <small>{isDemo?"실제 발송하지 않는 예시 화면":recipient?"수신: "+recipient:"로그인한 사장님 계정의 인증된 이메일 주소로 전송"}</small></div>
    <span className={"pill "+(ready?"confirmed":"pending")}>{ready?"발송 가능":"설정 확인 필요"}</span>
  </div>}
  {!ready&&!isDemo&&<p className="hint" style={{marginTop:10}}>현재 발신 서비스 연결 또는 계정 이메일 인증이 완료되지 않았을 수 있어요. 화면에 예약이 나타나더라도 실제 메일이 발송된 것으로 간주하지 마세요. 운영자가 발송 서비스와 도메인을 연결해야 합니다.</p>}
  <div className="row-between" style={{gap:12,marginTop:20,flexWrap:"wrap"}}>
    <div><strong>새 예약·변경·취소 알림 받기</strong><p className="hint">{enabled?"알림 받기로 설정됨":"알림 받지 않음"}</p></div>
    <button className="btn btn-outline" type="button" disabled={busy||!loaded||isDemo} onClick={()=>void toggle()}>
     {enabled?"알림 끄기":"알림 켜기"}</button>
  </div>
  {error&&<div className="error" role="alert">{error}</div>}
  {notice&&<div className="success" role="status">{notice}</div>}
  <div className="row-between" style={{marginTop:26}}>
    <h4>최근 이메일 알림 내역</h4><button className="btn btn-ghost" type="button" onClick={()=>void reload()}><RefreshCw size={15}/> 새로고침</button>
  </div>
  {!rows.length?<p className="dash-empty">아직 발송할 이메일 알림이 없습니다.</p>:
   <div className="table-wrap"><table className="data-table"><thead><tr><th>시간</th><th>알림</th><th>진행 상태</th><th>시도</th></tr></thead>
     <tbody>{rows.map(r=><tr key={r.id}>
      <td>{new Date(r.created_at).toLocaleString("ko-KR",{timeZone:"Asia/Seoul"})}</td>
      <td>{titles[r.event_type]}</td><td>{label[r.status]||r.status}
       {r.error_code&&<small className="muted" style={{display:"block"}}>{r.error_code}</small>}</td>
      <td>{r.attempts}</td>
     </tr>)}</tbody></table></div>}
  <p className="hint" style={{marginTop:14}}>‘발송업체 접수’는 이메일 서비스의 요청 수락을 뜻하며 실제 수신함 도착을 보장하지 않습니다. 고객 전화번호는 이메일 본문에 표시하지 않습니다.</p>
 </div>;
}
