"use client";
import { useEffect, useState } from "react";
import { Check, Clock3, Wrench, X } from "lucide-react";
import { kstDate } from "@/lib/demo";
import type { Booking, Service } from "@/lib/types";

const labels:Record<string,string>={
 scheduled:"예약 접수",checked_in:"차량 입고",working:"정비 진행",ready:"출고 대기",handed_over:"출고 완료"
};
const stages=["scheduled","checked_in","working","ready","handed_over"] as const;
type Stage=typeof stages[number];
type Patch=Partial<Pick<Booking,"customer_name"|"customer_phone"|"vehicle_model"|"notes"|
  "internal_note"|"starts_at"|"ends_at"|"service_id"|"work_stage">>;

const fmt=(date:string)=>{
  const parts=new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Seoul",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date(date));
  return parts;
};
const phoneOk=/^01[0-9]{8,9}$/;
const err=(e:unknown)=>e instanceof Error?e.message:"요청을 처리하지 못했습니다.";

export default function BookingOperations({
 booking,services,busy,onClose,onSave
}:{
 booking:Booking;services:Service[];busy:boolean;onClose:()=>void;
 onSave:(patch:Patch)=>Promise<void>;
}){
 const [name,setName]=useState(booking.customer_name);
 const [phone,setPhone]=useState(booking.customer_phone);
 const [vehicle,setVehicle]=useState(booking.vehicle_model||"");
 const [notes,setNotes]=useState(booking.notes||"");
 const [internalNote,setInternalNote]=useState(booking.internal_note||"");
 const [service,setService]=useState(booking.service_id||"");
 const [day,setDay]=useState(kstDate(new Date(booking.starts_at)));
 const [time,setTime]=useState(fmt(booking.starts_at));
 const [message,setMessage]=useState("");
 const [localBusy,setLocalBusy]=useState(false);
 const currentStage=(booking.work_stage||"scheduled") as Stage;
 const closed=booking.status==="cancelled"||booking.status==="completed";
 const selected=services.find(s=>s.id===service)||services.find(s=>s.id===booking.service_id);
 const duration=selected?.duration_minutes??Math.round((new Date(booking.ends_at).getTime()-new Date(booking.starts_at).getTime())/60000);
 // Changing a selection after booking has already started should remain read-only.
 const editableSchedule=!closed;
 useEffect(()=>{setMessage("");},[booking.id]);
 const save=async(e:React.FormEvent)=>{
   e.preventDefault();setMessage("");
   const digits=phone.replace(/[^0-9]/g,"");
   if(!name.trim()||name.length>80||!phoneOk.test(digits)){setMessage("고객명 또는 휴대전화 번호를 확인해 주세요.");return;}
   if(!service||!selected){setMessage("정비 항목을 선택해 주세요.");return;}
   if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!/^([01]\d|2[0-3]):(00|30)$/.test(time)){
     setMessage("예약 날짜와 시간은 30분 단위로 입력해 주세요.");return;
   }
   if(internalNote.length>2000||notes.length>500||vehicle.length>100){setMessage("입력 가능한 글자 수를 확인해 주세요.");return;}
   const start=new Date(day+"T"+time+":00+09:00");
   if(Number.isNaN(start.getTime())){setMessage("날짜가 올바르지 않습니다.");return;}
   const starts_at=start.toISOString(),ends_at=new Date(start.getTime()+duration*60000).toISOString();
   const patch:Patch={
     customer_name:name.trim(),customer_phone:digits,vehicle_model:vehicle.trim(),
     notes:notes.trim(),internal_note:internalNote.trim()
   };
   if(editableSchedule){
     patch.service_id=service;patch.starts_at=starts_at;patch.ends_at=ends_at;
   }
   setLocalBusy(true);
   try{await onSave(patch);onClose();}
   catch(e){setMessage(err(e));}
   finally{setLocalBusy(false);}
 };
 const nextStage=stages[Math.min(stages.indexOf(currentStage)+1,stages.length-1)];
 const advance=async()=>{
   if(closed||nextStage===currentStage)return;
   const stageText=labels[nextStage];
   if(nextStage==="handed_over"&&!window.confirm("차량 출고를 완료하고 정비 기록을 종료할까요?"))return;
   setLocalBusy(true);setMessage("");
   try{await onSave({work_stage:nextStage});setMessage(stageText+" 처리 완료");}
   catch(e){setMessage(err(e));}
   finally{setLocalBusy(false);}
 };
 return <div className="modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
   <section className="modal-card booking-edit-modal" role="dialog" aria-modal="true" aria-label="예약 상세 및 수정">
    <div className="booking-inner">
     <div className="row-between"><div><span className="eyebrow">RESERVATION DETAIL</span><h2 style={{margin:"7px 0"}}>예약 상세 · 정비 관리</h2></div>
       <button className="btn btn-ghost" type="button" aria-label="닫기" onClick={onClose}><X size={19}/></button>
     </div>
     <div className="booking-summary" style={{marginTop:16}}>
       <div>예약번호 <strong>{booking.id.slice(0,8).toUpperCase()}</strong></div>
       <div>예약 상태 <strong>{({pending:"승인 대기",confirmed:"예약 확정",completed:"정비 완료",cancelled:"취소됨"} as Record<string,string>)[booking.status]}</strong></div>
       <div>접수 경로 <strong>{booking.source==="manual"?"전화·방문":"온라인"}</strong></div>
     </div>
     <div className="workflow-section"><div className="row-between">
       <h3 style={{margin:"0 0 14px"}}><Wrench size={17} style={{verticalAlign:"middle",marginRight:6}}/>정비 진행 상황</h3>
       <small className="muted">예약 상태와 별도 관리</small>
     </div>
     <div className="workflow-steps">
       {stages.map((stage,i)=><div className={"workflow-step"+(stages.indexOf(currentStage)>=i?" done":"")} key={stage}>
         <span className="workflow-dot">{stages.indexOf(currentStage)>=i?<Check size={13}/>:i+1}</span>
         <span>{labels[stage]}</span>
       </div>)}
     </div>
     <div className="row-between" style={{marginTop:18,gap:12,flexWrap:"wrap"}}>
       <span className="hint">현재 단계: <strong>{labels[currentStage]}</strong></span>
       <button type="button" className="btn btn-dark" disabled={busy||localBusy||closed||currentStage==="handed_over"} onClick={advance}>
         <Clock3 size={16}/>{currentStage==="handed_over"?"출고 완료":labels[nextStage]+" 처리"}
       </button>
     </div>
     </div>
     <form onSubmit={save} className="booking-edit-form">
       <h3>예약 및 고객 정보 수정</h3>
       <div className="ops-form-grid">
         <label className="field-group"><span className="field-label">고객 이름</span><input className="field" required maxLength={80} value={name} onChange={e=>setName(e.target.value)}/></label>
         <label className="field-group"><span className="field-label">휴대전화</span><input className="field" required type="tel" value={phone} maxLength={14} onChange={e=>setPhone(e.target.value)}/></label>
       </div>
       <label className="field-group"><span className="field-label">차량 모델</span><input className="field" maxLength={100} value={vehicle} onChange={e=>setVehicle(e.target.value)}/></label>
       <label className="field-group"><span className="field-label">정비 항목</span>
         <select className="field" value={service} disabled={!editableSchedule} onChange={e=>setService(e.target.value)}>
          {services.map(s=><option key={s.id} value={s.id}>{s.name} · {s.duration_minutes}분</option>)}
         </select>
       </label>
       <div className="ops-form-grid">
         <label className="field-group"><span className="field-label">방문 날짜</span><input className="field" type="date" disabled={!editableSchedule} required value={day} onChange={e=>setDay(e.target.value)}/></label>
         <label className="field-group"><span className="field-label">방문 시간 (30분 단위)</span><input className="field" type="time" step={1800} disabled={!editableSchedule} required value={time} onChange={e=>setTime(e.target.value)}/></label>
       </div>
       <p className="hint" style={{marginTop:0}}>예약 시간을 변경하면 영업시간·휴무일·다른 예약과의 충돌을 서버에서 확인합니다. 작업 완료 또는 취소된 예약은 일정 변경이 불가능해요.</p>
       <label className="field-group"><span className="field-label">고객 요청사항</span><textarea className="field" rows={2} maxLength={500} value={notes} onChange={e=>setNotes(e.target.value)}/></label>
       <label className="field-group"><span className="field-label">정비소 내부 메모 (고객 비공개)</span><textarea className="field" rows={3} maxLength={2000} placeholder="점검 결과, 부품 준비 사항 등을 기록하세요." value={internalNote} onChange={e=>setInternalNote(e.target.value)}/></label>
       {message&&<div className={message.includes("완료")?"success":"error"} role="alert">{message}</div>}
       <div className="booking-bottom" style={{marginTop:22}}><button className="btn btn-outline" type="button" onClick={onClose}>닫기</button>
         <button className="btn btn-dark" type="submit" disabled={busy||localBusy}>{busy||localBusy?"저장 중...":"변경 사항 저장"}</button>
       </div>
     </form>
    </div>
   </section>
 </div>;
}
