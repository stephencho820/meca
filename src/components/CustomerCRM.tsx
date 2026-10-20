"use client";
import {useCallback,useEffect,useMemo,useState,type FormEvent} from "react";
import {CarFront,ChevronRight,ClipboardList,Plus,Search,UserRound,Users,X} from "lucide-react";
import {demoBookings,kstDate} from "@/lib/demo";
import {browserDb} from "@/lib/supabase";
import type {Booking,Shop} from "@/lib/types";

type Customer={
 id:string;shop_id:string;name:string;phone:string;internal_note:string|null;
 created_at?:string;updated_at?:string
};
type Vehicle={
 id:string;shop_id:string;customer_id:string;model:string;plate:string|null;
 model_year:number|null;odometer_km:number|null;internal_note:string|null;created_at?:string
};
type CustomerForm={name:string;phone:string;internal_note:string};
type VehicleForm={model:string;plate:string;model_year:string;odometer_km:string;internal_note:string};
const CKEY="meca-demo-customers";
const VKEY="meca-demo-vehicles";
const emptyCustomer=()=>({name:"",phone:"",internal_note:""});
const emptyVehicle=()=>({model:"",plate:"",model_year:"",odometer_km:"",internal_note:""});
const dstr=(iso:string)=>new Date(iso).toLocaleString("ko-KR",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"});
const stage:Record<Booking["status"],string>={pending:"승인 대기",confirmed:"예약 확정",completed:"정비 완료",cancelled:"취소"};
function saved<T>(key:string):T[]{
 try{return JSON.parse(localStorage.getItem(key)||"[]") as T[];}catch{return [];}
}
function demoRecords():{customers:Customer[];vehicles:Vehicle[]}{
 const customers=saved<Customer>(CKEY);
 const vehicles=saved<Vehicle>(VKEY);
 for(const b of demoBookings()){
   const found=customers.find(x=>x.phone===b.customer_phone);
   const id=found?.id||"demo-c-"+b.customer_phone;
   if(!found)customers.push({id,shop_id:"demo-shop",name:b.customer_name,phone:b.customer_phone,internal_note:null});
   const model=b.vehicle_model?.trim();
   if(model&&!vehicles.some(x=>x.customer_id===id&&x.model===model))
     vehicles.push({id:"demo-v-"+id+"-"+model,shop_id:"demo-shop",customer_id:id,model,plate:null,model_year:null,odometer_km:null,internal_note:null});
 }
 return {customers,vehicles};
}
export default function CustomerCRM({shop,isDemo,bookings}:{shop:Shop;isDemo:boolean;bookings:Booking[]}){
 const db=useMemo(()=>browserDb(),[]);
 const [customers,setCustomers]=useState<Customer[]>([]);
 const [vehicles,setVehicles]=useState<Vehicle[]>([]);
 const [history,setHistory]=useState<Booking[]>(bookings);
 const [selected,setSelected]=useState<string|null>(null);
 const [vehicleSelected,setVehicleSelected]=useState<string|null>(null);
 const [search,setSearch]=useState("");
 const [loading,setLoading]=useState(true);
 const [saving,setSaving]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [customerEditor,setCustomerEditor]=useState<Customer|null|true>(null);
 const [vehicleEditor,setVehicleEditor]=useState<Vehicle|null|true>(null);
 const [customerForm,setCustomerForm]=useState<CustomerForm>(emptyCustomer);
 const [vehicleForm,setVehicleForm]=useState<VehicleForm>(emptyVehicle);

 const load=useCallback(async()=>{
   if(isDemo){const data=demoRecords();setCustomers(data.customers);setVehicles(data.vehicles);setHistory(demoBookings());setLoading(false);return;}
   if(!db){setError("데이터베이스에 연결할 수 없습니다.");setLoading(false);return;}
   const results=await Promise.all([
     db.from("customers").select("*").eq("shop_id",shop.id).order("updated_at",{ascending:false}).limit(500),
     db.from("vehicles").select("*").eq("shop_id",shop.id).order("created_at",{ascending:false}).limit(1000),
     db.from("bookings").select("*").eq("shop_id",shop.id).order("starts_at",{ascending:false}).limit(1000)
   ]);
   if(results.some(r=>r.error)){setError("고객·차량 정보를 불러오지 못했습니다.");}
   else{
     setCustomers((results[0].data||[]) as Customer[]);
     setVehicles((results[1].data||[]) as Vehicle[]);
     setHistory((results[2].data||[]) as Booking[]);
   }
   setLoading(false);
 },[db,isDemo,shop.id]);
 useEffect(()=>{void load();},[load]);
 const records=useMemo(()=>customers.filter(c=>{
   const q=search.trim().toLocaleLowerCase();
   if(!q)return true;
   return [c.name,c.phone,...vehicles.filter(v=>v.customer_id===c.id).flatMap(v=>[v.model,v.plate||""])]
      .some(v=>v.toLocaleLowerCase().includes(q));
 }),[customers,vehicles,search]);
 const person=customers.find(c=>c.id===selected)||null;
 const cars=vehicles.filter(v=>v.customer_id===selected);
 const personVisits=useMemo(()=>history.filter(b=>selected&&(
   b.customer_id===selected||(!b.customer_id&&b.customer_phone===person?.phone)
 )).sort((a,b)=>b.starts_at.localeCompare(a.starts_at)),[history,selected,person?.phone]);
 const shown=vehicleSelected?personVisits.filter(b=>
   b.vehicle_id===vehicleSelected||(!b.vehicle_id&&cars.length===1&&b.vehicle_model===cars[0].model)
 ):personVisits;
 const complete=personVisits.filter(b=>b.status==="completed").length;
 const last=personVisits.filter(b=>b.status==="completed")[0];
 function createCustomer(){
   setCustomerForm(emptyCustomer());setCustomerEditor(true);setError("");setNotice("");
 }
 function editCustomer(c:Customer){
   setCustomerForm({name:c.name,phone:c.phone,internal_note:c.internal_note||""});setCustomerEditor(c);setError("");setNotice("");
 }
 function createVehicle(){
   if(!person)return;
   setVehicleForm(emptyVehicle());setVehicleEditor(true);setError("");setNotice("");
 }
 function editVehicle(v:Vehicle){
   setVehicleForm({model:v.model,plate:v.plate||"",model_year:v.model_year?.toString()||"",
     odometer_km:v.odometer_km?.toString()||"",internal_note:v.internal_note||""});
   setVehicleEditor(v);setError("");setNotice("");
 }
 async function saveCustomer(e:FormEvent<HTMLFormElement>){
   e.preventDefault();setError("");
   const input={name:customerForm.name.trim(),phone:customerForm.phone.replace(/\D/g,""),internal_note:customerForm.internal_note.trim()||null};
   if(!input.name||input.name.length>80||!/^01\d{8,9}$/.test(input.phone)||customerForm.internal_note.length>2000){
     setError("고객명, 휴대전화 또는 메모를 확인해 주세요.");return;
   }
   setSaving(true);
   try{
     const existing=customerEditor!==true&&customerEditor?customerEditor:null;
     if(isDemo){
       const list=saved<Customer>(CKEY);
       if(!existing&&demoRecords().customers.some(c=>c.phone===input.phone))throw Error("이미 등록된 휴대전화 번호입니다.");
       const c={id:existing?.id||crypto.randomUUID(),shop_id:shop.id,...input};
       localStorage.setItem(CKEY,JSON.stringify(existing?list.map(x=>x.id===c.id?c:x).concat(list.some(x=>x.id===c.id)?[]:[c]):[...list,c]));
       await load();setSelected(c.id);
     }else{
       if(!db)throw Error("서버 연결 오류");
       const result=existing?
         await db.from("customers").update({name:input.name,internal_note:input.internal_note}).eq("shop_id",shop.id).eq("id",existing.id).select("*").single():
         await db.from("customers").insert({...input,shop_id:shop.id}).select("*").single();
       if(result.error)throw Error(result.error.code==="23505"?"이미 등록된 휴대전화 번호입니다.":"고객 정보를 저장할 수 없습니다.");
       await load();setSelected((result.data as Customer).id);
     }
     setCustomerEditor(null);setNotice("고객 정보를 저장했습니다.");
   }catch(e){setError(e instanceof Error?e.message:"저장에 실패했습니다.");}
   finally{setSaving(false);}
 }
 async function saveVehicle(e:FormEvent<HTMLFormElement>){
   e.preventDefault();setError("");
   if(!person)return;
   const plate=vehicleForm.plate.replace(/\s/g,"")||null;
   const year=vehicleForm.model_year.trim()?Number(vehicleForm.model_year):null;
   const km=vehicleForm.odometer_km.trim()?Number(vehicleForm.odometer_km):null;
   if(!vehicleForm.model.trim()||vehicleForm.model.length>100||
      (plate!==null&&(plate.length<4||plate.length>20))||
      (year!==null&&(!Number.isInteger(year)||year<1950||year>2100))||
      (km!==null&&(!Number.isInteger(km)||km<0||km>5000000))||
      vehicleForm.internal_note.length>2000){setError("차량 모델·번호판·연식·주행거리 입력값을 확인해 주세요.");return;}
   const payload={model:vehicleForm.model.trim(),plate,model_year:year,
     odometer_km:km,internal_note:vehicleForm.internal_note.trim()||null};
   setSaving(true);
   try{
     const existing=vehicleEditor!==true&&vehicleEditor?vehicleEditor:null;
     if(isDemo){
       const list=saved<Vehicle>(VKEY);
       const v:Vehicle={...payload,id:existing?.id||crypto.randomUUID(),shop_id:shop.id,customer_id:person.id};
       if(plate&&demoRecords().vehicles.some(x=>x.plate===plate&&x.id!==v.id))throw Error("이미 등록된 차량번호입니다.");
       if(!plate&&demoRecords().vehicles.some(x=>x.customer_id===person.id&&x.model===payload.model&&!x.plate&&x.id!==v.id))
         throw Error("이 모델의 차량이 이미 등록돼 있습니다. 기존 차량을 수정하거나 차량번호를 입력해 주세요.");
       localStorage.setItem(VKEY,JSON.stringify(existing?list.map(x=>x.id===v.id?v:x).concat(list.some(x=>x.id===v.id)?[]:[v]):[...list,v]));
     }else{
       if(!db)throw Error("서버 연결 오류");
       const r=existing?
         await db.from("vehicles").update(payload).eq("shop_id",shop.id).eq("customer_id",person.id).eq("id",existing.id):
         await db.from("vehicles").insert({...payload,shop_id:shop.id,customer_id:person.id});
       if(r.error)throw Error(r.error.code==="23505"?"이미 등록된 차량입니다. 차량번호나 모델을 확인해 주세요.":"차량 정보를 저장하지 못했습니다.");
     }
     await load();setVehicleEditor(null);setNotice("차량 정보를 저장했습니다.");
   }catch(e){setError(e instanceof Error?e.message:"차량 저장에 실패했습니다.");}
   finally{setSaving(false);}
 }
 if(loading)return <div className="dash-panel">고객·차량 정보를 불러오는 중...</div>;
 return <div className="dash-panel crm-panel">
   <div className="row-between crm-heading">
     <div><span className="eyebrow">CUSTOMER & VEHICLE CRM</span><h3 style={{margin:"9px 0 4px"}}>고객·차량 관리</h3>
      <p className="booking-help">한 고객의 여러 차량과 예약·정비 이력을 한곳에서 확인해요. 전화번호로 고객을 구분합니다.</p></div>
     <button className="btn btn-dark" onClick={createCustomer}><Plus size={16}/> 고객 추가</button>
   </div>
   {error&&<div className="error" role="alert" style={{marginBottom:15}}>{error}</div>}
   {notice&&<div className="success" role="status" style={{marginBottom:15}}>{notice}</div>}
   {isDemo&&<p className="hint">체험 정보는 현재 브라우저에만 저장됩니다. 실제 고객 데이터가 아닙니다.</p>}
   <div className="crm-layout">
     <div className="crm-list">
       <div className="crm-search"><Search size={18}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="이름 · 전화 · 차량번호 검색" aria-label="고객 검색"/></div>
       <div className="crm-list-scroll">
        {records.map(c=>{
          const v=vehicles.filter(x=>x.customer_id===c.id),visits=history.filter(b=>b.customer_id===c.id||(!b.customer_id&&b.customer_phone===c.phone));
          return <button key={c.id} className={"crm-person"+(selected===c.id?" active":"")} onClick={()=>{setSelected(c.id);setVehicleSelected(null);setNotice("");}}>
            <span className="crm-avatar"><UserRound size={19}/></span><span className="crm-person-info"><strong>{c.name}</strong><small>{c.phone}</small><small>차량 {v.length}대 · 방문 {visits.length}건</small></span><ChevronRight size={16}/>
          </button>;
        })}
        {records.length===0&&<div className="dash-empty">고객이 없습니다. 고객을 추가하거나 첫 예약을 접수해 보세요.</div>}
       </div>
     </div>
     <div className="crm-detail">
       {!person?<div className="crm-blank"><Users size={33}/><h3>고객을 선택해 주세요</h3><p>고객별 차량·예약·정비 이력이 여기에 표시됩니다.</p></div>:<>
         <div className="row-between crm-person-header" style={{gap:15,flexWrap:"wrap"}}>
           <div><span className="eyebrow">CUSTOMER PROFILE</span><h2 style={{margin:"8px 0"}}>{person.name}</h2><span className="muted">{person.phone}</span></div>
           <button className="btn btn-outline" onClick={()=>editCustomer(person)}>고객 정보 수정</button>
         </div>
         {person.internal_note&&<div className="crm-note"><strong>내부 메모</strong><p>{person.internal_note}</p></div>}
         <div className="crm-stats">
           <div><span>등록 차량</span><strong>{cars.length}<small>대</small></strong></div>
           <div><span>총 예약</span><strong>{personVisits.length}<small>건</small></strong></div>
           <div><span>정비 완료</span><strong>{complete}<small>건</small></strong></div>
         </div>
         {last&&<p className="hint">최근 정비 완료: {dstr(last.starts_at)} · {last.service_name}</p>}
         <div className="row-between" style={{margin:"25px 0 10px"}}><h3 style={{margin:0}}>보유 차량</h3>
           <button className="btn btn-outline" onClick={createVehicle}><Plus size={15}/> 차량 추가</button></div>
         <div className="crm-cars">
          {cars.map(v=><div className={"crm-car"+(vehicleSelected===v.id?" selected":"")} key={v.id}>
            <button type="button" onClick={()=>setVehicleSelected(vehicleSelected===v.id?null:v.id)}>
              <CarFront size={23}/><strong>{v.model}</strong><small>{v.plate||"번호판 미등록"}</small>
              {v.model_year&&<small>{v.model_year}년식</small>}
              {v.odometer_km!=null&&<small>{v.odometer_km.toLocaleString("ko-KR")} km</small>}
            </button><button type="button" className="crm-edit-link" onClick={()=>editVehicle(v)}>수정</button>
          </div>)}
          {!cars.length&&<div className="crm-no-car">등록된 차량이 없어요. 예약에 차량 모델이 입력되면 자동으로 연결됩니다.</div>}
         </div>
         {vehicleSelected&&<button className="btn btn-ghost" onClick={()=>setVehicleSelected(null)}>전체 차량 이력 보기</button>}
         <div className="row-between" style={{margin:"24px 0 10px"}}>
           <h3 style={{margin:0}}><ClipboardList size={18} style={{verticalAlign:"middle",marginRight:6}}/>예약·정비 이력</h3><small className="muted">{shown.length}건</small>
         </div>
         {shown.length?<div className="crm-history">{shown.slice(0,80).map(b=><div className="crm-history-row" key={b.id}>
           <div><strong>{b.service_name}</strong><span>{dstr(b.starts_at)}</span>
              {b.vehicle_model&&<span>{b.vehicle_model}</span>}
           </div><span className={"pill "+b.status}>{stage[b.status]}</span>
         </div>)}</div>:<div className="crm-no-car">예약·정비 이력이 없습니다.</div>}
         <p className="hint" style={{marginTop:12}}>이력은 최대 최근 1,000건을 조회합니다. 작업 상세정보는 예약 관리에서 확인할 수 있어요.</p>
       </>}
     </div>
   </div>
   {customerEditor&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setCustomerEditor(null);}}>
     <div className="modal-card crm-modal" role="dialog" aria-modal="true" aria-label="고객 정보">
       <form className="booking-inner" onSubmit={saveCustomer}>
         <div className="row-between"><h2>{customerEditor===true?"고객 추가":"고객 정보 수정"}</h2><button className="btn btn-ghost" type="button" onClick={()=>setCustomerEditor(null)} aria-label="닫기"><X size={18}/></button></div>
         <label className="field-group"><span className="field-label">고객 이름</span><input className="field" required maxLength={80} value={customerForm.name} onChange={e=>setCustomerForm({...customerForm,name:e.target.value})}/></label>
         <label className="field-group"><span className="field-label">휴대전화 (고객 식별 기준)</span><input className="field" type="tel" required disabled={customerEditor!==true} maxLength={14} value={customerForm.phone} onChange={e=>setCustomerForm({...customerForm,phone:e.target.value})}/></label>
         {customerEditor!==true&&<p className="hint">연락처는 기존 예약과 연결되어 있어 직접 변경할 수 없습니다. 정정이 필요한 경우 예약 상세에서 수정해 주세요.</p>}
         <label className="field-group"><span className="field-label">정비소 내부 고객 메모</span><textarea className="field" rows={3} maxLength={2000} value={customerForm.internal_note} onChange={e=>setCustomerForm({...customerForm,internal_note:e.target.value})}/></label>
         {error&&<p className="error">{error}</p>}
         <button className="btn btn-dark btn-wide" type="submit" disabled={saving}>{saving?"저장 중...":"고객 저장"}</button>
       </form>
     </div>
   </div>}
   {vehicleEditor&&person&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setVehicleEditor(null);}}>
     <div className="modal-card crm-modal" role="dialog" aria-modal="true" aria-label="차량 정보">
       <form className="booking-inner" onSubmit={saveVehicle}>
         <div className="row-between"><h2>{vehicleEditor===true?"차량 추가":"차량 정보 수정"}</h2><button className="btn btn-ghost" type="button" onClick={()=>setVehicleEditor(null)} aria-label="닫기"><X size={18}/></button></div>
         <p className="booking-help">차량 소유 고객: <strong>{person.name}</strong></p>
         <label className="field-group"><span className="field-label">차량 모델</span><input className="field" maxLength={100} required placeholder="예: 현대 싼타페" value={vehicleForm.model} onChange={e=>setVehicleForm({...vehicleForm,model:e.target.value})}/></label>
         <label className="field-group"><span className="field-label">차량 번호 (선택)</span><input className="field" maxLength={20} placeholder="예: 123가4567" value={vehicleForm.plate} onChange={e=>setVehicleForm({...vehicleForm,plate:e.target.value})}/></label>
         <div className="ops-form-grid">
           <label className="field-group"><span className="field-label">연식</span><input className="field" type="number" min={1950} max={2100} value={vehicleForm.model_year} onChange={e=>setVehicleForm({...vehicleForm,model_year:e.target.value})}/></label>
           <label className="field-group"><span className="field-label">주행거리 (km)</span><input className="field" type="number" min={0} max={5000000} value={vehicleForm.odometer_km} onChange={e=>setVehicleForm({...vehicleForm,odometer_km:e.target.value})}/></label>
         </div>
         <label className="field-group"><span className="field-label">차량 정비소 내부 메모</span><textarea className="field" rows={3} maxLength={2000} value={vehicleForm.internal_note} onChange={e=>setVehicleForm({...vehicleForm,internal_note:e.target.value})}/></label>
         {error&&<p className="error">{error}</p>}
         <button className="btn btn-dark btn-wide" type="submit" disabled={saving}>{saving?"저장 중...":"차량 저장"}</button>
       </form>
     </div>
   </div>}
 </div>;
}
