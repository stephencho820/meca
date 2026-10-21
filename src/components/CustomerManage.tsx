"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CalendarDays, CheckCircle2, ClipboardCopy, Clock3, Loader2, ShieldCheck, Wrench } from "lucide-react";
import { demoBookings, demoServices, demoShop, demoSlots, getDays, updateDemoBooking } from "@/lib/demo";
import type { Booking, TimeSlot } from "@/lib/types";

type Managed = {
  booking_id:string; customer_name:string; customer_phone_last4:string;
  vehicle_model:string|null;service_name:string;status:Booking["status"];
  starts_at:string;ends_at:string;shop_name:string;shop_slug:string;shop_phone:string|null;
};
type Reply={booking?:Managed;slots?:TimeSlot[];error?:string;code?:string};
const dateTime=(v:string)=>new Date(v).toLocaleString("ko-KR",{timeZone:"Asia/Seoul",year:"numeric",month:"long",day:"numeric",weekday:"short",hour:"2-digit",minute:"2-digit"});
const getToken=(value:string)=>{
  const v=value.trim();
  if(/^([0-9a-f]{64}|demo-[0-9a-f-]{36})$/.test(v))return v;
  try { const u=new URL(v);return new URLSearchParams(u.hash.replace(/^#/,"")).get("token")||""; }catch{return "";}
};
const errorText=(x:string)=>x||"예약을 확인할 수 없습니다.";
export default function CustomerManage(){
  const [token,setToken]=useState("");
  const [input,setInput]=useState("");
  const [booking,setBooking]=useState<Managed|null>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [privacySubmitting,setPrivacySubmitting]=useState(false);
  const [editing,setEditing]=useState(false);
  const [day,setDay]=useState("");
  const [time,setTime]=useState("");
  const [slots,setSlots]=useState<TimeSlot[]>([]);
  const [loadingSlots,setLoadingSlots]=useState(false);
  const [submitting,setSubmitting]=useState(false);
  const days=useMemo(()=>getDays(),[]);
  const isDemo=token.startsWith("demo-");

  async function api(t:string,action:string,date?:string,slot?:string):Promise<Reply>{
    const res=await fetch("/api/manage",{method:"POST",headers:{"Content-Type":"application/json"},
      cache:"no-store",referrerPolicy:"no-referrer",
      body:JSON.stringify({token:t,action,date,time:slot})});
    const result=await res.json() as Reply;
    if(!res.ok)throw new Error(result.error||"예약 처리에 실패했습니다.");
    return result;
  }
  function readDemo(t:string):Managed|null{
    const b=demoBookings().find(x=>"demo-"+x.id===t);
    if(!b)return null;
    return {booking_id:b.id,customer_name:b.customer_name,customer_phone_last4:b.customer_phone.slice(-4),
      vehicle_model:b.vehicle_model,service_name:b.service_name,status:b.status,
      starts_at:b.starts_at,ends_at:b.ends_at,shop_name:demoShop.name,shop_slug:demoShop.slug,shop_phone:demoShop.phone};
  }
  async function load(t:string){
    if(!/^([0-9a-f]{64}|demo-[0-9a-f-]{36})$/.test(t)){setError("올바른 예약 관리 링크를 입력해 주세요.");return;}
    setLoading(true);setError("");setNotice("");setEditing(false);
    try{
      const result=t.startsWith("demo-")?{booking:readDemo(t)}:await api(t,"lookup");
      if(!result.booking)throw Error("예약을 찾을 수 없습니다. 링크를 확인해 주세요.");
      setToken(t);setInput("");setBooking(result.booking);
      window.sessionStorage.setItem("meca-manage-token",t);
      // Booking secrets never appear in path, queries, HTTP access logs or Referer.
      if(window.location.hash)window.history.replaceState(null,"",window.location.pathname);
    }catch(e){setError(e instanceof Error?e.message:"예약 조회에 실패했습니다.");setBooking(null);}
    finally{setLoading(false);}
  }
  useEffect(()=>{
    const supplied=getToken(window.location.hash.replace(/^#/,""))
      || new URLSearchParams(window.location.hash.replace(/^#/,"")).get("token")
      || window.sessionStorage.getItem("meca-manage-token")
      || "";
    if(supplied)void load(supplied);
  // first mount only
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);
  useEffect(()=>{
    if(!editing||!day||!token)return;
    let active=true;setTime("");setSlots([]);setLoadingSlots(true);setError("");
    if(isDemo){
      const service=demoServices.find(s=>s.name===booking?.service_name)||demoServices[0];
      const filtered=demoSlots(day,service).map(s=>{
        const bookings=demoBookings().filter(b=>b.id!==booking?.booking_id &&
          ["pending","confirmed"].includes(b.status));
        const start=new Date(day+"T"+s.time+":00+09:00").getTime();
        const end=start+service.duration_minutes*60000;
        const boundaries=[start,...bookings.map(b=>new Date(b.starts_at).getTime()).filter(t=>t>start&&t<end)];
        return {...s,available:boundaries.every(t=>bookings.filter(b=>new Date(b.starts_at).getTime()<=t&&new Date(b.ends_at).getTime()>t).length<(demoShop.slot_capacity||1))
          &&start>Date.now()+3600000};
      });
      setSlots(filtered);setLoadingSlots(false);return;
    }
    api(token,"slots",day).then(r=>{if(active)setSlots(r.slots||[]);})
      .catch(e=>{if(active)setError(e instanceof Error?e.message:"시간을 확인할 수 없습니다.");})
      .finally(()=>{if(active)setLoadingSlots(false);});
    return()=>{active=false;};
  },[day,editing,token,isDemo,booking?.booking_id,booking?.service_name]);

  async function update(action:"cancel"|"reschedule"){
    if(!booking)return;
    if(action==="reschedule"&&(!day||!time)){setError("날짜와 시간을 선택해 주세요.");return;}
    if(action==="cancel"&&!window.confirm("이 예약을 취소하시겠습니까? 취소 후에는 되돌릴 수 없습니다."))return;
    setError("");setSubmitting(true);
    try{
      let next:Managed|null=null;
      if(isDemo){
        if(action==="cancel")updateDemoBooking(booking.booking_id,"cancelled");
        else {
          const list=demoBookings().map(x=>{
            if(x.id!==booking.booking_id)return x;
            const duration=new Date(x.ends_at).getTime()-new Date(x.starts_at).getTime();
            const start=new Date(day+"T"+time+":00+09:00");
            return {...x,starts_at:start.toISOString(),ends_at:new Date(start.getTime()+duration).toISOString()};
          });
          localStorage.setItem("meca-demo-bookings",JSON.stringify(list));
        }
        next=readDemo(token);
      }else{
        const r=await api(token,action,day,time);next=r.booking||null;
      }
      if(!next)throw Error("예약을 새로고침하지 못했습니다.");
      setBooking(next);setEditing(false);setDay("");setTime("");
      setNotice(action==="cancel"?"예약이 취소됐습니다.":"방문 일정이 변경됐습니다.");
    }catch(e){setError(e instanceof Error?e.message:"변경을 완료하지 못했습니다.");}
    finally{setSubmitting(false);}
  }
  async function requestPrivacy(kind:"access"|"rectify"|"erase"){
    if(isDemo){setNotice("체험 예약에서는 개인정보 요청을 실제로 전송하지 않습니다.");return;}
    if(!token||!window.confirm("개인정보 요청을 정비소 담당자에게 접수할까요? 요청 즉시 삭제되는 것은 아닙니다."))return;
    setPrivacySubmitting(true);setError("");setNotice("");
    try{
      const res=await fetch("/api/privacy",{method:"POST",headers:{"Content-Type":"application/json"},
        cache:"no-store",referrerPolicy:"no-referrer",body:JSON.stringify({token,kind})});
      const obj=await res.json() as {error?:string;message?:string};
      if(!res.ok)throw Error(obj.error||"요청 접수에 실패했습니다.");
      setNotice("개인정보 요청을 접수했어요. 담당자가 확인한 후 처리합니다. 요청만으로 예약 정보가 자동 삭제되지는 않습니다.");
    }catch(e){setError(e instanceof Error?e.message:"요청을 접수하지 못했습니다.");}
    finally{setPrivacySubmitting(false);}
  }
  const canEdit=Boolean(booking&&["pending","confirmed"].includes(booking.status)&&
    new Date(booking.starts_at).getTime()>Date.now()+3600000);
  const statusMap:Record<Managed["status"],string>={
    pending:"승인 대기",confirmed:"예약 확정",completed:"정비 완료",cancelled:"취소됨"
  };
  async function copyLink(){
    try{await navigator.clipboard.writeText(window.location.origin+"/manage#token="+token);
      setNotice("예약 관리 링크를 복사했습니다.");}
    catch{setNotice("복사할 수 없습니다. 브라우저 설정을 확인해 주세요.");}
  }
  return <div className="booking-page" style={{minHeight:"100vh"}}>
    <div className="container row-between" style={{maxWidth:660,marginBottom:26}}>
      <Link href="/" className="logo"><span className="logo-icon"><Wrench size={20}/></span> meca.</Link>
      <Link className="btn btn-outline" href="/"><ArrowLeft size={16}/> 홈으로</Link>
    </div>
    <main className="booking-shell"><div className="booking-inner">
      <span className="eyebrow">CUSTOMER BOOKING</span>
      <h1 className="booking-h2" style={{marginTop:13}}>예약 확인 · 변경 · 취소</h1>
      <p className="booking-help">예약 완료 시 받은 개인 예약 관리 링크를 이용하세요. 휴대전화 번호만으로는 개인정보를 조회할 수 없어요.</p>
      {!booking&&<form onSubmit={e=>{e.preventDefault();void load(getToken(input));}}>
        <div className="field-group"><label className="field-label">예약 관리 링크 또는 확인 코드</label>
          <textarea className="field" rows={3} value={input} onChange={e=>setInput(e.target.value)} placeholder="예약 완료 후 복사한 링크를 붙여넣으세요" autoComplete="off" spellCheck={false}/></div>
        <button className="btn btn-dark btn-wide" disabled={loading||!input.trim()} type="submit">{loading?<Loader2 size={16}/>:"예약 조회하기"}</button>
      </form>}
      {error&&<div className="error" style={{margin:"18px 0"}} role="alert">{error}</div>}
      {notice&&<div className="success" style={{margin:"18px 0"}} role="status">{notice}</div>}
      {booking&&<>
        {isDemo&&<p className="success">체험 예약입니다. 변경 내용은 현재 브라우저에만 저장됩니다.</p>}
        <div className="booking-summary" style={{lineHeight:2.6,marginTop:18}}>
          <div>예약 상태 <strong><span className={"pill "+booking.status}>{statusMap[booking.status]}</span></strong></div>
          <div>매장 <strong>{booking.shop_name}</strong></div>
          <div>정비 항목 <strong>{booking.service_name}</strong></div>
          <div>예약자 <strong>{booking.customer_name}</strong></div>
          <div>휴대전화 <strong>****-{booking.customer_phone_last4}</strong></div>
          {booking.vehicle_model&&<div>차량 <strong>{booking.vehicle_model}</strong></div>}
        </div>
        <h3 style={{margin:"23px 0 8px"}}><CalendarDays size={18} style={{verticalAlign:"middle",marginRight:8}}/>방문 일정</h3>
        <div style={{padding:"17px",border:"1px solid #e2ebe0",borderRadius:13,background:"#f7faf3",fontWeight:800}}>{dateTime(booking.starts_at)}</div>
        <p className="booking-help" style={{marginTop:16}}>방문 1시간 전까지 온라인 변경·취소가 가능해요. 이후에는 매장에 직접 연락해 주세요.</p>
        {editing&&<div style={{borderTop:"1px solid #e6ede2",paddingTop:22}}>
          <h3>변경할 날짜와 시간 선택</h3>
          <div className="day-scroll">{days.map(d=><button type="button" key={d.iso} className={"day-pill"+(day===d.iso?" active":"")} onClick={()=>setDay(d.iso)}><span>{d.dayName}</span><strong>{d.label}</strong></button>)}</div>
          {!day?<p className="booking-help">먼저 날짜를 선택해 주세요.</p>:loadingSlots?<p className="booking-help">예약 가능 시간을 확인하는 중...</p>:slots.length===0?<p className="booking-help">선택한 날짜에 변경할 수 있는 시간이 없습니다.</p>:<div className="time-grid">{slots.map(s=><button type="button" key={s.time} className={"time-pill"+(time===s.time?" active":"")} disabled={!s.available} onClick={()=>setTime(s.time)}>{s.time}</button>)}</div>}
          <div className="booking-bottom"><button className="btn btn-outline" type="button" onClick={()=>{setEditing(false);setDay("");setTime("");}}>돌아가기</button><button className="btn btn-dark" disabled={!day||!time||submitting} onClick={()=>void update("reschedule")}>{submitting?"변경 중...":"일정 변경 확정"}</button></div>
        </div>}
        {canEdit&&!editing&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginTop:24}}>
          <button className="btn btn-dark" onClick={()=>{setError("");setEditing(true);}}>날짜·시간 변경</button>
          <button className="btn btn-outline" disabled={submitting} onClick={()=>void update("cancel")}>예약 취소</button>
        </div>}
        {!canEdit&&<p className="booking-help" style={{marginTop:18}}>온라인 변경이 불가능한 예약입니다. 추가 도움이 필요하면 매장에 연락해 주세요.</p>}
        {booking.shop_phone&&<p style={{fontSize:13,marginTop:15}}>매장 연락처: <a href={"tel:"+booking.shop_phone} style={{textDecoration:"underline"}}>{booking.shop_phone}</a></p>}
        <div className="privacy-actions">
          <h3>개인정보 관련 요청</h3>
          <p className="booking-help">예약에 사용된 개인정보에 대해 열람, 정정 또는 삭제를 요청할 수 있어요. 요청을 담당 정비소가 확인하며, 다른 법적 보관 의무가 있는 기록은 즉시 삭제되지 않을 수 있습니다.</p>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            <button type="button" className="btn btn-outline" disabled={privacySubmitting} onClick={()=>void requestPrivacy("access")}>열람 요청</button>
            <button type="button" className="btn btn-outline" disabled={privacySubmitting} onClick={()=>void requestPrivacy("rectify")}>정정 요청</button>
            <button type="button" className="btn btn-outline" disabled={privacySubmitting} onClick={()=>void requestPrivacy("erase")}>삭제 요청</button>
          </div>
        </div>
        <button className="btn btn-outline btn-wide" style={{marginTop:15}} onClick={()=>void copyLink()}><ClipboardCopy size={16}/> 내 예약 관리 링크 복사</button>
        <button className="btn btn-ghost btn-wide" style={{marginTop:9}} onClick={()=>{setBooking(null);setToken("");setInput("");window.sessionStorage.removeItem("meca-manage-token");}}>다른 예약 조회하기</button>
      </>}
      <p style={{fontSize:11,color:"#8e9a8e",lineHeight:1.8,marginTop:25,display:"flex",gap:6}}><ShieldCheck size={17}/>예약 관리 링크는 본인만 보관하세요. 링크를 가진 사람은 예약 정보를 확인하거나 변경할 수 있어요.</p>
    </div></main>
  </div>;
}
