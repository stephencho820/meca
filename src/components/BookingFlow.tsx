"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import HumanCheck from "@/components/HumanCheck";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Clock3, Loader2, MapPin, ShieldCheck, Wrench } from "lucide-react";
import { addDemoBooking, demoServices, demoShop, demoSlots, getDays, money, phoneFormat } from "@/lib/demo";
import type { Booking, PublicShop, Service, TimeSlot } from "@/lib/types";
export default function BookingFlow({slug,embedded=false}:{slug:string; embedded?:boolean}) {
  const isDemo = slug === "demo-garage";
  const siteKey=isDemo?"":process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY||"";
  const days = useMemo(()=>getDays(),[]);
  const [data,setData] = useState<PublicShop|null>(isDemo?{shop:demoShop,services:demoServices}:null);
  const [loadError,setLoadError] = useState("");
  const [step,setStep] = useState(0);
  const [service,setService] = useState<Service|null>(null);
  const [day,setDay] = useState("");
  const [time,setTime] = useState("");
  const [slots,setSlots] = useState<TimeSlot[]>([]);
  const [loadingSlots,setLoadingSlots] = useState(false);
  const [customer,setCustomer] = useState({name:"",phone:"",vehicle:"",notes:""});
  const [consent,setConsent] = useState(false);
  const [captchaToken,setCaptchaToken] = useState("");
  const [captchaCycle,setCaptchaCycle] = useState(0);
  const verified=useCallback((token:string)=>setCaptchaToken(token),[]);
  const [submitting,setSubmitting] = useState(false);
  const [bookingId,setBookingId] = useState("");
  const [manageToken,setManageToken] = useState("");
  const [copyMessage,setCopyMessage] = useState("");
  const [submitError,setSubmitError] = useState("");
  useEffect(()=>{if(isDemo)return;let live=true;fetch("/api/shops/"+encodeURIComponent(slug)).then(r=>r.json().then(j=>({ok:r.ok,json:j}))).then(r=>{if(!live)return;if(r.ok)setData(r.json);else setLoadError(r.json.error||"가게를 찾을 수 없습니다.");}).catch(()=>{if(live)setLoadError("매장 정보를 불러오지 못했습니다.");});return()=>{live=false;};},[slug,isDemo]);
  useEffect(()=>{
    if(!service||!day) return;
    let live=true;
    setTime("");setLoadingSlots(true);setSlots([]);
    if(isDemo){setSlots(demoSlots(day,service));setLoadingSlots(false);return;}
    const url="/api/availability?shop="+encodeURIComponent(slug)+"&service="+encodeURIComponent(service.id)+"&date="+day;
    fetch(url).then(r=>r.json().then(j=>({ok:r.ok,json:j}))).then(r=>{if(live){if(r.ok)setSlots(r.json.slots||[]);else setSubmitError(r.json.error||"예약 시간을 불러오지 못했습니다.");}}).catch(()=>{if(live)setSubmitError("시간을 불러오는 데 실패했습니다.");}).finally(()=>{if(live)setLoadingSlots(false);});
    return()=>{live=false;};
  },[service,day,slug,isDemo]);
  const submit=async()=>{
    if(!data||!service||!day||!time)return;
    const phone=customer.phone.replace(/\D/g,"");
    if(!customer.name.trim() || customer.name.length>80){setSubmitError("이름을 입력해 주세요.");return;}
    if(!/^01\d{8,9}$/.test(phone)){setSubmitError("올바른 휴대전화 번호를 입력해 주세요.");return;}
    if(!consent){setSubmitError("예약을 위한 개인정보 수집·이용에 동의해 주세요.");return;}
    if(siteKey&&!captchaToken){setSubmitError("자동 예약 방지 확인을 완료해 주세요.");return;}
    setSubmitting(true);setSubmitError("");
    try{
      if(isDemo){
        const starts = new Date(day+"T"+time+":00+09:00");const ends=new Date(starts.getTime()+service.duration_minutes*60000);
        const b:Booking={id:crypto.randomUUID(),shop_id:demoShop.id,service_id:service.id,service_name:service.name,customer_name:customer.name.trim(),customer_phone:phone,vehicle_model:customer.vehicle.trim(),notes:customer.notes.trim(),starts_at:starts.toISOString(),ends_at:ends.toISOString(),status:service.approval_required?"pending":"confirmed",source:"web"};
        if(!demoSlots(day,service).some(slot=>slot.time===time && slot.available)){
          setSubmitError("선택한 시간이 마감됐어요. 다른 시간을 선택해 주세요.");
          setDay("");setTime("");setStep(1);return;
        }
        addDemoBooking(b);setBookingId(b.id);setManageToken("demo-"+b.id);setStep(3);
      }else{
        const res=await fetch("/api/bookings",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({shop_slug:slug,service_id:service.id,date:day,time,customer_name:customer.name.trim(),customer_phone:phone,vehicle_model:customer.vehicle.trim(),notes:customer.notes.trim(),privacy_consent:consent,turnstile_token:captchaToken})});
        const j=await res.json();if(!res.ok){
          if(j.code==="SLOT_UNAVAILABLE"){
            setDay("");setTime("");setStep(1);
            throw new Error("선택한 시간이 방금 마감되었어요. 다른 날짜와 시간을 골라주세요.");
          }
          throw new Error(j.error||"예약에 실패했습니다.");
        }
        setBookingId(j.booking_id);setManageToken(j.manage_token||"");setStep(3);
      }
    }catch(e){setSubmitError(e instanceof Error?e.message:"예약 도중 오류가 발생했습니다.");
      if(siteKey){setCaptchaToken("");setCaptchaCycle(n=>n+1);}}
    finally{setSubmitting(false);}
  };
  if(!data)return <div className="booking-inner" style={{minHeight:350,display:"grid",placeItems:"center"}}>{loadError?<div className="error">{loadError}</div>:<Loader2 className="spin" size={30}/>}</div>;
  const {shop,services}=data;
  return <div className="booking-inner">
    <div className="booking-brand"><div className="booking-brand-icon"><Wrench size={24}/></div><div><strong style={{display:"block",fontSize:17}}>{shop.name}</strong><small style={{color:"#879486"}}>{shop.category} · 온라인 예약</small></div></div>
    {isDemo&&<div style={{fontSize:12,padding:"9px 12px",background:"#f0f6e9",color:"#447349",borderRadius:9,marginBottom:18}}>체험 모드 · 실제 매장으로 예약이 전송되지 않습니다.</div>}
    {!isDemo&&<div style={{fontSize:12,padding:"10px 12px",background:"#f5f8f3",color:"#607368",borderRadius:9,marginBottom:18}}>예약이 접수되면 매장 관리자 화면에 반영됩니다. 현재 카카오톡·문자 자동 알림은 제공되지 않습니다.</div>}

    {step<3&&<><span className="eyebrow">STEP {step+1} / 3</span><div className="step-track">{[0,1,2].map(s=><span key={s} className={step>=s?"active":""}/>)}</div></>}
    {step===0&&<><h2 className="booking-h2">어떤 서비스가 필요하세요?</h2><p className="booking-help">원하는 정비 항목을 선택해 주세요.</p>
      <div className="service-options">{services.filter(s=>s.active!==false).map(s=><button key={s.id} className={"service-option"+(service?.id===s.id?" selected":"")} onClick={()=>{setService(s);setDay("");setTime("");}}><div className="service-emoji">{s.icon||"🔧"}</div><div><strong>{s.name}</strong><small>{s.description || (s.duration_minutes+"분 소요")}</small><small style={{color:"#4f8b55"}}>{money(s.price_from)}</small></div>{service?.id===s.id&&<CheckCircle2 className="end" size={21}/>}</button>)}</div>
      <div className="booking-bottom"><button className="btn btn-dark btn-wide" disabled={!service} onClick={()=>setStep(1)}>날짜 선택하기 <ArrowRight size={16}/></button></div>
    </>}
    {step===1&&<><h2 className="booking-h2">언제 방문하시겠어요?</h2><p className="booking-help">{service?.name} · 예상 소요 {service?.duration_minutes}분</p>
      <label className="field-label">방문 날짜</label><div className="day-scroll">{days.map(d=><button key={d.iso} className={"day-pill"+(day===d.iso?" active":"")} onClick={()=>{setDay(d.iso);setSubmitError("");}}><span>{d.dayName}</span><strong>{d.label}</strong></button>)}</div>
      <label className="field-label">예약 가능 시간</label>{!day?<p className="booking-help" style={{marginTop:15}}>날짜를 먼저 선택해 주세요.</p>:loadingSlots?<p className="booking-help" style={{marginTop:15}}>시간을 확인하는 중...</p>:slots.length===0?<p className="booking-help" style={{marginTop:15}}>선택한 날짜에 예약 가능한 시간이 없습니다. 다른 날짜를 선택해 주세요.</p>:<div className="time-grid">{slots.map(s=><button key={s.time} className={"time-pill"+(time===s.time?" active":"")} disabled={!s.available} onClick={()=>setTime(s.time)}>{s.time}</button>)}</div>}
      {submitError&&<p className="error">{submitError}</p>}
      <div className="booking-bottom"><button className="btn btn-outline" onClick={()=>setStep(0)}><ArrowLeft size={16}/> 이전</button><button className="btn btn-dark" disabled={!time} onClick={()=>setStep(2)}>다음 <ArrowRight size={16}/></button></div>
    </>}
    {step===2&&<><h2 className="booking-h2">예약 정보를 입력해 주세요.</h2><p className="booking-help">예약 확정을 위해 필요한 정보를 입력합니다.</p>
      <div className="booking-summary"><div>서비스 <strong>{service?.name}</strong></div><div>방문일 <strong>{day} {time}</strong></div><div>예약 방식 <strong>{service?.approval_required?"매장 승인 후 확정":"즉시 확정"}</strong></div></div>
      <div className="field-group"><label className="field-label" htmlFor="customer-name">이름 *</label><input id="customer-name" className="field" maxLength={80} autoComplete="name" value={customer.name} onChange={e=>setCustomer({...customer,name:e.target.value})} placeholder="홍길동"/></div>
      <div className="field-group"><label className="field-label" htmlFor="customer-phone">휴대전화 번호 *</label><input id="customer-phone" className="field" maxLength={13} type="tel" autoComplete="tel" value={customer.phone} onChange={e=>setCustomer({...customer,phone:phoneFormat(e.target.value)})} placeholder="010-1234-5678"/></div>
      <div className="field-group"><label className="field-label" htmlFor="customer-vehicle">차량 모델 (선택)</label><input id="customer-vehicle" className="field" maxLength={100} value={customer.vehicle} onChange={e=>setCustomer({...customer,vehicle:e.target.value})} placeholder="예: 쏘렌토 2023"/></div>
      <div className="field-group"><label className="field-label" htmlFor="customer-notes">요청사항 (선택)</label><textarea id="customer-notes" className="field" rows={3} maxLength={500} value={customer.notes} onChange={e=>setCustomer({...customer,notes:e.target.value})} placeholder="차량 증상이나 필요한 사항을 알려주세요."/></div>
      <label className="checkbox"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/><span>[필수] 예약 접수·관리를 위해 이름, 연락처, 차량 정보(입력 시)를 해당 매장에 제공합니다. 정보는 예약 관리 목적으로 이용됩니다. 서비스 이용 및 보관 정책은 운영 전 확정해야 합니다.</span></label>
      {siteKey&&<HumanCheck key={captchaCycle} siteKey={siteKey} onVerified={verified}/>}
      {submitError&&<p className="error" style={{marginTop:16}}>{submitError}</p>}
      <div className="booking-bottom"><button className="btn btn-outline" onClick={()=>setStep(1)}><ArrowLeft size={16}/> 이전</button><button className="btn btn-dark" disabled={submitting||!consent||!!siteKey&&!captchaToken||!customer.name.trim()||!customer.phone.trim()} onClick={submit}>{submitting?<Loader2 size={16} className="spin"/>:<Check size={16}/>} {submitting?"예약 접수 중":"예약 접수하기"}</button></div>
    </>}
    {step===3&&<div className="booking-done"><div className="booking-done-icon"><Check size={38}/></div><span className="eyebrow">BOOKING RECEIVED</span><h2>{service?.approval_required?"예약 요청이 접수됐어요!":"예약이 접수됐어요!"}</h2><p className="booking-help"> {service?.approval_required?"가게에서 확인 후 확정됩니다.":"아래 예약 정보를 확인해 주세요."}<br/>{isDemo?"데모 예약은 이 브라우저의 관리자 데모에만 저장됩니다.":"실제 알림 메시지는 아직 연결되지 않았습니다."}</p><div className="booking-summary" style={{textAlign:"left"}}><div>매장 <strong>{shop.name}</strong></div><div>서비스 <strong>{service?.name}</strong></div><div>일시 <strong>{day} {time}</strong></div><div>예약번호 <strong>{bookingId.slice(0,8).toUpperCase()}</strong></div></div>{manageToken&&<div style={{padding:"15px",background:"#eff8e7",borderRadius:13,margin:"16px 0",textAlign:"left"}}>
        <strong style={{fontSize:14}}>예약 관리 링크를 보관하세요</strong>
        <p style={{fontSize:12,color:"#667968",lineHeight:1.8,margin:"9px 0"}}>별도 회원가입 없이 방문 날짜를 변경하거나 예약을 취소할 수 있습니다. 이 링크는 예약자 본인만 보관하세요.</p>
        <a className="btn btn-dark btn-wide" href={"/manage#token="+manageToken}>내 예약 확인 · 변경하기 <ArrowRight size={15}/></a>
        <button className="btn btn-outline btn-wide" style={{marginTop:8}} onClick={async()=>{try{await navigator.clipboard.writeText(window.location.origin+"/manage#token="+manageToken);setCopyMessage("예약 관리 링크를 복사했어요.");}catch{setCopyMessage("복사할 수 없습니다. 위 링크를 직접 열어 저장해 주세요.");}}}>예약 관리 링크 복사</button>
        {copyMessage&&<p role="status" style={{fontSize:12,marginBottom:0}}>{copyMessage}</p>}
      </div>}
      <button className="btn btn-outline btn-wide" onClick={()=>{setManageToken("");setCopyMessage("");setStep(0);setService(null);setDay("");setTime("");setCustomer({name:"",phone:"",vehicle:"",notes:""});setConsent(false);}}>다른 예약하기</button>{isDemo&&<a className="btn btn-dark btn-wide" style={{marginTop:10}} href="/dashboard?demo=1">관리자 화면에서 확인하기 <ArrowRight size={15}/></a>}</div>}
    {step<3&&<p style={{display:"flex",alignItems:"center",justifyContent:"center",gap:7,color:"#a3aea5",fontSize:11,marginTop:30}}><ShieldCheck size={13}/> Powered by MECA · 간편한 정비 예약</p>}
  </div>;
}
