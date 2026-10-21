"use client";
import { useMemo,useState,type FormEvent } from "react";
import { HardHat, Plus, Warehouse } from "lucide-react";
import { browserDb } from "@/lib/supabase";
import { writeDemoResources } from "@/lib/resources";
import type { Shop, WorkResource, Booking } from "@/lib/types";

export default function ResourcesPanel({shop,isDemo,resources,bookings,onUpdate}:{
  shop:Shop;isDemo:boolean;resources:WorkResource[];bookings:Booking[];onUpdate:(list:WorkResource[])=>void;
}){
 const db=useMemo(()=>browserDb(),[]);
 const [kind,setKind]=useState<WorkResource["kind"]>("technician");
 const [name,setName]=useState("");
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [saving,setSaving]=useState(false);
 const used=(id:string)=>bookings.some(b=>["pending","confirmed"].includes(b.status)
   && new Date(b.ends_at).getTime()>Date.now()
   && (b.assigned_technician_id===id||b.assigned_bay_id===id));
 async function add(e:FormEvent){
   e.preventDefault();
   const input=name.trim();
   if(!input||input.length>80){setError("이름은 1~80자로 입력해 주세요.");return;}
   if(resources.some(r=>r.kind===kind&&r.name===input)){setError("같은 이름의 직원·리프트가 이미 있어요.");return;}
   setSaving(true);setError("");setNotice("");
   if(isDemo){
     const next=[...resources,{id:crypto.randomUUID(),kind,name:input,shop_id:shop.id,active:true}];
     writeDemoResources(next);onUpdate(next);setName("");setNotice("등록했습니다.");setSaving(false);return;
   }
   if(!db){setError("서버 연결을 확인해 주세요.");setSaving(false);return;}
   const {data,error:e1}=await db.from("work_resources").insert({shop_id:shop.id,kind,name:input})
     .select("*").single();
   if(e1){setError(e1.code==="23505"?"중복된 이름입니다.":"등록에 실패했습니다.");}
   else{onUpdate([...resources,data as WorkResource]);setName("");setNotice("등록했습니다.");}
   setSaving(false);
 }
 async function toggle(r:WorkResource){
   setError("");setNotice("");
   if(r.active&&used(r.id)){
     setError("미래 예약에 배정된 직원·리프트는 비활성화할 수 없어요. 예약 배정을 먼저 해제해 주세요.");
     return;
   }
   setSaving(true);
   if(isDemo){
     const next=resources.map(x=>x.id===r.id?{...x,active:!x.active}:x);
     writeDemoResources(next);onUpdate(next);setNotice("상태를 변경했어요.");setSaving(false);return;
   }
   if(!db){setSaving(false);setError("서버 연결이 필요합니다.");return;}
   const {error:e1}=await db.from("work_resources").update({active:!r.active})
     .eq("shop_id",shop.id).eq("id",r.id);
   if(e1){setError(e1.message.includes("RESOURCE_IN_USE")?"배정된 예약을 먼저 해제해 주세요.":"변경에 실패했습니다.");}
   else{onUpdate(resources.map(x=>x.id===r.id?{...x,active:!x.active}:x));setNotice("상태를 변경했어요.");}
   setSaving(false);
 }
 const groups=[
  {kind:"technician" as const,title:"정비사",icon:HardHat,description:"예약마다 담당 정비사 한 명을 배정할 수 있습니다."},
  {kind:"bay" as const,title:"리프트 / 작업 베이",icon:Warehouse,description:"예약마다 사용하는 리프트·작업 공간 한 곳을 배정합니다."}
 ];
 return <div className="dash-panel">
  <span className="eyebrow">WORKSHOP RESOURCES</span>
  <h3 style={{margin:"10px 0 6px"}}>정비사 · 리프트 관리</h3>
  <p className="booking-help">정비사와 리프트를 등록하고 예약 상세에서 배정하세요. 동일 시간 중복 배정은 서버에서 차단합니다.</p>
  <p className="hint">고객 온라인 예약 가능 시간은 현재 매장 전체 수용량을 기준으로 계산합니다. 직원 근무표·리프트 가용 시간을 고객용 예약 슬롯에 반영하는 기능은 다음 단계입니다.</p>
  {error&&<div className="error" role="alert" style={{margin:"12px 0"}}>{error}</div>}
  {notice&&<div className="success" role="status" style={{margin:"12px 0"}}>{notice}</div>}
  <form onSubmit={add} className="resource-form">
    <label className="field-group"><span className="field-label">자원 종류</span>
      <select className="field" value={kind} onChange={e=>setKind(e.target.value as WorkResource["kind"])}>
       <option value="technician">정비사</option><option value="bay">리프트 / 작업 베이</option>
      </select></label>
    <label className="field-group"><span className="field-label">이름</span>
      <input className="field" maxLength={80} value={name} onChange={e=>setName(e.target.value)}
       placeholder={kind==="bay"?"예: 리프트 3":"예: 김정비"} required/></label>
    <button className="btn btn-dark" disabled={saving} type="submit"><Plus size={15}/> 등록</button>
  </form>
  <div className="resource-grid">
    {groups.map(g=><div className="resource-group" key={g.kind}>
      <div className="row-between"><h4 style={{display:"flex",gap:8,alignItems:"center"}}><g.icon size={19}/>{g.title}</h4><small className="muted">{resources.filter(x=>x.kind===g.kind&&x.active).length}명/개 사용 가능</small></div>
      <p className="booking-help">{g.description}</p>
      {resources.filter(x=>x.kind===g.kind).map(r=><div className="resource-item" key={r.id}>
        <div><strong>{r.name}</strong><small>{used(r.id)?"예약 배정 중":r.active?"활성":"비활성"}</small></div>
        <button type="button" className="btn btn-outline" disabled={saving}
          onClick={()=>void toggle(r)}>{r.active?"비활성화":"활성화"}</button>
      </div>)}
      {!resources.some(x=>x.kind===g.kind)&&<p className="hint">아직 등록된 자원이 없어요.</p>}
    </div>)}
  </div>
 </div>;
}
