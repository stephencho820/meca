"use client";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Activity, ArrowRight, BarChart3, CalendarDays, Check, ChevronLeft, ChevronRight, ClipboardList, Copy, ExternalLink, LayoutDashboard, LogOut, Plus, Search, Settings, Users, Wrench, X } from "lucide-react";
import { addDemoBooking, demoBookings, demoServices, demoShop, kstDate, money, updateDemoBooking } from "@/lib/demo";
import { browserDb } from "@/lib/supabase";
import type { Booking, Service, Shop } from "@/lib/types";
type Tab="overview"|"calendar"|"bookings"|"customers"|"services"|"notifications"|"settings";
const tabs:{id:Tab;label:string;icon:typeof LayoutDashboard}[]=[{id:"overview",label:"대시보드",icon:LayoutDashboard},{id:"calendar",label:"예약 캘린더",icon:CalendarDays},{id:"bookings",label:"예약 관리",icon:ClipboardList},{id:"customers",label:"고객 관리",icon:Users},{id:"services",label:"서비스 관리",icon:Wrench},{id:"notifications",label:"알림 내역",icon:Activity},{id:"settings",label:"매장 설정",icon:Settings}];
const statusText:Record<Booking["status"],string>={pending:"승인 대기",confirmed:"예약 확정",completed:"정비 완료",cancelled:"취소"};
const koDate=(date:string)=>new Date(date).toLocaleString("ko-KR",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false});
function Dashboard(){
  const router=useRouter(),search=useSearchParams(),isDemo=search.get("demo")==="1";
  const db=useMemo(()=>browserDb(),[]);
  type NotificationRow={id:string;event_type:string;status:string;created_at:string;attempts:number;last_error:string|null};
  const [notificationRows,setNotificationRows]=useState<NotificationRow[]>([]);
  const [notificationsLoading,setNotificationsLoading]=useState(false);

  const [tab,setTab]=useState<Tab>("overview"),[shop,setShop]=useState<Shop|null>(isDemo?demoShop:null),[bookings,setBookings]=useState<Booking[]>([]),[services,setServices]=useState<Service[]>(isDemo?demoServices:[]),[loading,setLoading]=useState(!isDemo),[error,setError]=useState(""),[notice,setNotice]=useState("");
  const [filter,setFilter]=useState("all"),[query,setQuery]=useState(""),[month,setMonth]=useState(()=>{const d=kstDate(new Date());return d.slice(0,7);}),[showAdd,setShowAdd]=useState(false),[addForm,setAddForm]=useState({name:"",phone:"",vehicle:"",service:demoServices[0].id,day:kstDate(new Date()),time:"10:00"});
  type Hours = {shop_id:string;day_of_week:number;open_time:string;close_time:string;is_closed:boolean};
  type Blocked = {shop_id:string;blocked_date:string;reason:string|null};
  const [hours,setHours]=useState<Hours[]>(Array.from({length:7},(_,i)=>({shop_id:"demo-shop",day_of_week:i,open_time:"09:00",close_time:i===6?"16:00":"18:00",is_closed:i===0})));
  const [blocked,setBlocked]=useState<Blocked[]>([]),[newBlocked,setNewBlocked]=useState("");
  const [editService,setEditService]=useState<Service|null>(null),[saving,setSaving]=useState(false),[shopForm,setShopForm]=useState<Shop|null>(isDemo?demoShop:null);
  const refresh=useCallback(async(s:Shop)=>{
    if(isDemo){setBookings(demoBookings());return;}
    if(!db)return;
    const [{data:b,error:be},{data:svc,error:se},{data:h,error:he},{data:dates,error:de}]=await Promise.all([
      db.from("bookings").select("*").eq("shop_id",s.id).order("starts_at",{ascending:false}).limit(500),
      db.from("services").select("*").eq("shop_id",s.id).order("sort_order",{ascending:true}),
      db.from("business_hours").select("*").eq("shop_id",s.id).order("day_of_week"),
      db.from("blocked_dates").select("*").eq("shop_id",s.id).order("blocked_date")
    ]);
    if(be||se||he||de){setError("예약 정보를 불러오는 중 문제가 발생했습니다.");return;}
    setBookings((b||[]) as Booking[]);setServices((svc||[]) as Service[]);
    setHours((h||[]) as Hours[]);setBlocked((dates||[]) as Blocked[]);
  },[db,isDemo]);
  const refreshNotifications=useCallback(async(s:Shop)=>{
    if(isDemo||!db)return;
    setNotificationsLoading(true);
    const {data,error}=await db.from("notification_outbox")
      .select("id,event_type,status,created_at,attempts,last_error")
      .eq("shop_id",s.id).order("created_at",{ascending:false}).limit(100);
    if(error)setError("알림 내역을 불러오지 못했습니다.");
    else setNotificationRows((data||[]) as NotificationRow[]);
    setNotificationsLoading(false);
  },[db,isDemo]);
  useEffect(()=>{
    if(tab==="notifications"&&shop&&!isDemo)void refreshNotifications(shop);
  },[tab,shop,isDemo,refreshNotifications]);
  const dispatchFor=useCallback(async(id:string)=>{
    if(!db||isDemo)return;
    const {data}=await db.auth.getSession();
    const token=data.session?.access_token;
    if(!token)return;
    try{await fetch("/api/notifications/dispatch",{
        method:"POST",
        headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json"},
        body:JSON.stringify({booking_id:id})
      });}catch{/* Outbox remains queued. */}
  },[db,isDemo]);

  const syncBookings=useCallback(async(s:Shop)=>{
    if(!db||isDemo)return;
    const {data,error:readError}=await db.from("bookings")
      .select("*").eq("shop_id",s.id)
      .order("starts_at",{ascending:false}).limit(500);
    if(readError){setError("최신 예약 목록을 불러오지 못했습니다.");return;}
    setBookings((data||[]) as Booking[]);
  },[db,isDemo]);
  useEffect(()=>{
    if(isDemo||!db||!shop)return;
    let active=true;
    const sync=()=>{if(active&&document.visibilityState==="visible")void syncBookings(shop);};
    // Owner-only RLS policies are enforced for every row delivered by Realtime.
    const channel=db.channel("meca-bookings-"+shop.id)
      .on("postgres_changes",{event:"*",schema:"public",table:"bookings",filter:"shop_id=eq."+shop.id},
          ()=>{if(active)void syncBookings(shop);})
      .subscribe();
    const timer=window.setInterval(sync,20000); // reconnect/poll fallback
    window.addEventListener("focus",sync);
    document.addEventListener("visibilitychange",sync);
    return ()=>{
      active=false;window.clearInterval(timer);window.removeEventListener("focus",sync);
      document.removeEventListener("visibilitychange",sync);void db.removeChannel(channel);
    };
  },[shop,db,isDemo,syncBookings]);

  useEffect(()=>{
    if(isDemo){setBookings(demoBookings());setLoading(false);return;}
    if(!db){setLoading(false);setError("Supabase 연결이 필요합니다. 환경 변수를 설정한 후 다시 시도해 주세요.");return;}
    let live=true;
    (async()=>{
      const {data:{user}}=await db.auth.getUser();
      if(!live)return;
      if(!user){router.replace("/login");return;}
      const {data:shops,error:e}=await db.from("shops").select("*").eq("owner_id",user.id).order("created_at",{ascending:true}).limit(1);
      if(!live)return;
      if(e){setError("매장 정보를 불러오지 못했습니다.");setLoading(false);return;}
      let s=(shops||[])[0] as Shop|undefined;
      if(!s){
        const metadataName=typeof user.user_metadata?.shop_name==="string"?user.user_metadata.shop_name.trim().slice(0,70):"";
        const pending=metadataName||localStorage.getItem("meca-pending-shop")||"나의 정비소";
        const slug="shop-"+crypto.randomUUID().slice(0,8);
        const {data:created,error:ce}=await db.from("shops").insert({owner_id:user.id,name:pending,slug,category:"자동차 정비"}).select("*").single();
        if(!live)return;
        if(ce){setError("매장 생성에 실패했습니다. 데이터베이스 스키마와 권한을 확인해 주세요.");setLoading(false);return;}
        s=created as Shop;localStorage.removeItem("meca-pending-shop");
      }
      setShop(s);setShopForm(s);await refresh(s);if(live)setLoading(false);
    })();
    return()=>{live=false;};
  },[db,router,isDemo,refresh]);
  const today=kstDate(new Date());
  const todayBookings=bookings.filter(b=>kstDate(new Date(b.starts_at))===today && b.status!=="cancelled");
  const pending=bookings.filter(b=>b.status==="pending");
  const done=bookings.filter(b=>b.status==="completed");
  const customers=useMemo(()=>{
    const map=new Map<string,{name:string;phone:string;vehicle:string;count:number;last:string}>();
    bookings.filter(b=>b.status!=="cancelled").forEach(b=>{const x=map.get(b.customer_phone);if(x){x.count++;if(x.last<b.starts_at){x.last=b.starts_at;x.name=b.customer_name;x.vehicle=b.vehicle_model||"";}}else map.set(b.customer_phone,{name:b.customer_name,phone:b.customer_phone,vehicle:b.vehicle_model||"",count:1,last:b.starts_at});});
    return Array.from(map.values()).sort((a,b)=>b.last.localeCompare(a.last));
  },[bookings]);
  const copy=async()=>{if(!shop)return;const url=window.location.origin+"/book/"+shop.slug;try{await navigator.clipboard.writeText(url);setNotice("예약 링크를 복사했습니다.");}catch{setNotice(url);}setTimeout(()=>setNotice(""),3500);};
  const setStatus=async(b:Booking,status:Booking["status"])=>{
    if(isDemo){updateDemoBooking(b.id,status);setBookings(demoBookings());return;}
    if(!db||!shop)return;setError("");
    const {error}=await db.from("bookings").update({status}).eq("id",b.id).eq("shop_id",shop.id);
    if(error){setError(error.message.includes("SLOT_UNAVAILABLE")?"이미 다른 예약이 있어 다시 확정할 수 없습니다.":"예약 상태 변경에 실패했습니다.");return;}
    await syncBookings(shop);
    void dispatchFor(b.id);
  };
  const addManual=async(e:React.FormEvent)=>{e.preventDefault();if(!shop)return;const svc=services.find(s=>s.id===addForm.service);if(!svc){setError("서비스를 선택해 주세요.");return;}
    if(!/^01\d{8,9}$/.test(addForm.phone.replace(/\D/g,""))){setError("휴대전화 번호를 확인해 주세요.");return;}
    const start=new Date(addForm.day+"T"+addForm.time+":00+09:00");const end=new Date(start.getTime()+svc.duration_minutes*60000);
    const item:Booking={id:crypto.randomUUID(),shop_id:shop.id,service_id:svc.id,service_name:svc.name,customer_name:addForm.name,customer_phone:addForm.phone.replace(/\D/g,""),vehicle_model:addForm.vehicle,notes:"전화·방문 접수",starts_at:start.toISOString(),ends_at:end.toISOString(),status:"confirmed",source:"manual"};
    setSaving(true);setError("");
    if(isDemo){addDemoBooking(item);setBookings(demoBookings());}
    else if(db){
      const {data:created,error}=await db.from("bookings").insert({...item,id:undefined}).select("id").single();
      if(error){
        const conflict=error.message.includes("SLOT_UNAVAILABLE");
        setError(conflict?"해당 시간은 예약이 가득 찼거나 휴무일입니다. 영업시간 및 예약 현황을 확인해 주세요.":"예약 추가에 실패했습니다. 고객 정보와 정비 항목을 확인해 주세요.");
        setSaving(false);return;
      }
      await syncBookings(shop);
      if(created?.id)void dispatchFor(created.id);
    }
    setSaving(false);setShowAdd(false);setNotice("예약을 추가했습니다.");setTimeout(()=>setNotice(""),3500);
  };
  const saveService=async(e:React.FormEvent)=>{e.preventDefault();if(!editService||!shop)return;setSaving(true);
    if(isDemo){setServices(old=>editService.id.startsWith("new-")?[...old,{...editService,id:"demo-"+crypto.randomUUID().slice(0,7)}]:old.map(s=>s.id===editService.id?editService:s));}
    else if(db){
      const payload={shop_id:shop.id,name:editService.name,description:editService.description||"",duration_minutes:Number(editService.duration_minutes),price_from:editService.price_from==null?null:Number(editService.price_from),icon:editService.icon||"🔧",approval_required:Boolean(editService.approval_required),active:true,sort_order:services.length};
      const res=editService.id.startsWith("new-")?await db.from("services").insert(payload):await db.from("services").update(payload).eq("id",editService.id).eq("shop_id",shop.id);
      if(res.error){setError("서비스 저장에 실패했습니다.");setSaving(false);return;}await refresh(shop);
    }
    setSaving(false);setEditService(null);
  };
  const saveShop=async(e:React.FormEvent)=>{e.preventDefault();if(!shopForm||!shop)return;
    if(isDemo){setShop(shopForm);setNotice("데모 모드에서는 변경사항이 영구 저장되지 않습니다.");return;}
    if(!db)return;setSaving(true);const payload={name:shopForm.name,phone:shopForm.phone,address:shopForm.address,description:shopForm.description,slot_capacity:Number(shopForm.slot_capacity)||1};
    const {error}=await db.from("shops").update(payload).eq("id",shop.id);setSaving(false);if(error)setError("매장 설정을 저장하지 못했습니다.");else{setShop({...shop,...payload});setNotice("매장 설정을 저장했습니다.");}
  };
  const saveHours=async()=>{
    if(!shop)return;
    setSaving(true);setError("");
    if(isDemo){setNotice("데모 영업시간을 변경했습니다. 새로고침하면 초기화됩니다.");}
    else if(db){const {error:e}=await db.from("business_hours").upsert(hours.map(h=>({...h,shop_id:shop.id,open_time:h.open_time.slice(0,5),close_time:h.close_time.slice(0,5)})),{onConflict:"shop_id,day_of_week"});if(e)setError("영업시간을 저장하지 못했습니다.");else setNotice("영업시간을 저장했습니다.");}
    setSaving(false);
  };
  const addBlocked=async()=>{
    if(!shop||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(newBlocked))return;
    if(blocked.some(b=>b.blocked_date===newBlocked)){setError("이미 등록된 휴무일입니다.");return;}
    const row:Blocked={shop_id:shop.id,blocked_date:newBlocked,reason:null};
    if(isDemo)setBlocked(x=>[...x,row].sort((a,b)=>a.blocked_date.localeCompare(b.blocked_date)));
    else if(db){const {error:e}=await db.from("blocked_dates").insert(row);if(e){setError("휴무일 등록에 실패했습니다.");return;}setBlocked(x=>[...x,row].sort((a,b)=>a.blocked_date.localeCompare(b.blocked_date)));}
    setNewBlocked("");setNotice("휴무일을 등록했습니다.");
  };
  const removeBlocked=async(date:string)=>{
    if(!shop)return;
    if(!isDemo&&db){const {error:e}=await db.from("blocked_dates").delete().eq("shop_id",shop.id).eq("blocked_date",date);if(e){setError("휴무일 삭제에 실패했습니다.");return;}}
    setBlocked(x=>x.filter(b=>b.blocked_date!==date));setNotice("휴무일을 삭제했습니다.");
  };
  const logout=async()=>{if(db)await db.auth.signOut();router.push("/");};
  const filtered=bookings.filter(b=>(filter==="all"||b.status===filter)&&(b.customer_name.includes(query)||b.customer_phone.includes(query)||b.service_name.includes(query)));
  const navigateMonth=(delta:number)=>{const d=new Date(month+"-01T12:00:00+09:00");d.setUTCMonth(d.getUTCMonth()+delta);setMonth(kstDate(d).slice(0,7));};
  const calendarDays=useMemo(()=>{
    const [y,m]=month.split("-").map(Number);const first=new Date(Date.UTC(y,m-1,1));const offset=first.getUTCDay();const count=new Date(Date.UTC(y,m,0)).getUTCDate();
    return [...Array(offset).fill(null),...Array.from({length:count},(_,i)=>i+1)] as (number|null)[];
  },[month]);
  if(loading)return <div className="auth-layout"><div>매장 정보를 불러오는 중...</div></div>;
  if(!shop)return <div className="auth-layout"><div className="auth-card"><h2>매장에 연결하지 못했습니다.</h2><p>{error}</p><Link className="btn btn-dark" href="/login">로그인</Link> <Link className="btn btn-outline" href="/dashboard?demo=1">데모 보기</Link></div></div>;
  return <div className="dash-shell">
    <aside className="dash-sidebar"><Link href="/" className="logo dash-logo"><span className="logo-icon"><Wrench size={20}/></span>meca.</Link><nav className="dash-nav">{tabs.map(t=><button key={t.id} className={"dash-item"+(tab===t.id?" active":"")} onClick={()=>{setTab(t.id);setError("");}}><t.icon size={18}/>{t.label}</button>)}</nav><div className="dash-side-bottom"><div style={{fontSize:12,color:"#8f9b92",padding:"0 9px 15px"}}>{shop.name}{isDemo&&<div>체험용 데이터</div>}</div><button className="dash-item" onClick={isDemo?()=>router.push("/"):logout}><LogOut size={17}/>{isDemo?"홈으로":"로그아웃"}</button></div></aside>
    <div className="dash-main"><header className="dash-top"><div><strong style={{fontSize:16}}>{shop.name}</strong><br/><small>매장 관리 워크스페이스 {isDemo&&"· DEMO"}</small></div><div className="row-between"><button className="btn btn-outline" onClick={copy}><Copy size={15}/><span className="hide-mobile">예약 링크 복사</span></button><a className="btn btn-dark" href={"/book/"+shop.slug} target="_blank" rel="noopener noreferrer">예약 페이지 <ExternalLink size={15}/></a></div></header>
      <main className="dash-content">
        <div className="row-between"><div><span className="eyebrow">MECA WORKSPACE</span><h1 className="dash-h1">{tabs.find(t=>t.id===tab)?.label}</h1><p className="dash-sub">{isDemo?"이 화면은 체험용으로, 데모 예약은 현재 브라우저에만 저장됩니다.":"우리 매장의 예약과 고객을 관리하세요."}</p></div>{(["overview","calendar","bookings"].includes(tab))&&<button className="btn btn-dark" onClick={()=>{setAddForm({...addForm,service:services[0]?.id||""});setShowAdd(true);}}><Plus size={17}/> 예약 추가</button>}</div>
        {notice&&<div className="success" style={{marginTop:20}}>{notice}</div>}{error&&<div className="error" style={{marginTop:20}}>{error}</div>}
        {tab==="overview"&&<><div className="dash-cards">{[{label:"오늘의 예약",value:todayBookings.length,extra:"오늘 예정된 방문"},{label:"확정 대기",value:pending.length,extra:"승인이 필요한 예약"},{label:"전체 고객",value:customers.length,extra:"예약한 고객 수"},{label:"정비 완료",value:done.length,extra:"누적 완료 건수"}].map(k=><div className="stat-card" key={k.label}><span>{k.label}</span><strong>{k.value}<small style={{fontSize:14,color:"#93a096"}}> 건</small></strong><small>{k.extra}</small></div>)}</div><div className="dash-panel"><div className="row-between"><h3>다가오는 예약</h3><button className="btn btn-ghost" onClick={()=>setTab("bookings")}>전체 보기 <ArrowRight size={15}/></button></div><BookingTable bookings={bookings.filter(b=>b.status!=="cancelled"&&b.status!=="completed"&&new Date(b.starts_at)>=new Date()).sort((a,b)=>a.starts_at.localeCompare(b.starts_at)).slice(0,7)} setStatus={setStatus}/></div><div className="dash-panel"><h3>빠른 시작</h3><div style={{display:"flex",gap:12,flexWrap:"wrap"}}><button className="btn btn-outline" onClick={copy}><Copy size={16}/> 예약 링크 공유하기</button><button className="btn btn-outline" onClick={()=>setTab("services")}><Wrench size={16}/> 정비 항목 설정하기</button><button className="btn btn-outline" onClick={()=>setTab("settings")}><Settings size={16}/> 매장 정보 입력하기</button></div></div></>}
        {tab==="calendar"&&<div className="dash-panel"><div className="row-between" style={{marginBottom:18}}><h3 style={{margin:0}}>{month.replace("-","년 ")}월 예약</h3><div className="row-between"><button className="btn btn-outline" aria-label="이전 달" onClick={()=>navigateMonth(-1)}><ChevronLeft size={17}/></button><button className="btn btn-outline" onClick={()=>setMonth(kstDate(new Date()).slice(0,7))}>이번 달</button><button className="btn btn-outline" aria-label="다음 달" onClick={()=>navigateMonth(1)}><ChevronRight size={17}/></button></div></div><div className="calendar-grid">{["일","월","화","수","목","금","토"].map(d=><div key={d} style={{textAlign:"center",padding:12,fontSize:12,fontWeight:800,borderRight:"1px solid #eee",background:"#f8faf6"}}>{d}</div>)}{calendarDays.map((d,i)=>{const day=d?month+"-"+String(d).padStart(2,"0"):"";const items=bookings.filter(b=>d&&kstDate(new Date(b.starts_at))===day&&b.status!=="cancelled");return <div key={i} className={"cal-cell"+(day===today?" today":"")}><strong>{d||""}</strong>{items.slice(0,3).map(b=><div key={b.id} className="cal-item" title={b.customer_name+" · "+b.service_name}>{new Date(b.starts_at).toLocaleTimeString("ko-KR",{timeZone:"Asia/Seoul",hour:"2-digit",minute:"2-digit",hour12:false})} {b.customer_name}</div>)}{items.length>3&&<div style={{fontSize:10}}>+{items.length-3}건</div>}</div>;})}</div></div>}
        {tab==="bookings"&&<div className="dash-panel"><div className="row-between" style={{flexWrap:"wrap"}}><h3>예약 목록 · {filtered.length}건</h3><div className="row-between" style={{gap:7}}><Search size={17} color="#809088"/><input className="field" style={{minHeight:36,width:180}} value={query} onChange={e=>setQuery(e.target.value)} placeholder="고객명 / 연락처 / 정비"/></div></div><div className="dash-tabbar">{[["all","전체"],["pending","승인 대기"],["confirmed","확정"],["completed","완료"],["cancelled","취소"]].map(([id,label])=><button key={id} className={"dash-tab"+(filter===id?" active":"")} onClick={()=>setFilter(id)}>{label}</button>)}</div><BookingTable bookings={filtered} setStatus={setStatus}/></div>}
        {tab==="customers"&&<div className="dash-panel"><h3>고객 목록 · {customers.length}명</h3><div className="table-wrap">{customers.length?<table className="data-table"><thead><tr><th>이름</th><th>연락처</th><th>차량</th><th>예약 횟수</th><th>최근 예약</th></tr></thead><tbody>{customers.map(c=><tr key={c.phone}><td><strong>{c.name}</strong></td><td>{c.phone}</td><td>{c.vehicle||"—"}</td><td>{c.count}회</td><td>{koDate(c.last)}</td></tr>)}</tbody></table>:<div className="dash-empty">아직 고객이 없습니다. 첫 예약이 접수되면 이곳에서 확인할 수 있어요.</div>}</div></div>}
        {tab==="notifications"&&<div className="dash-panel">
          <div className="row-between" style={{alignItems:"flex-start",flexWrap:"wrap"}}>
            <div><h3>카카오 알림톡 처리 내역</h3><p className="booking-help">
              예약 접수·확정·변경·취소와 방문 하루 전 알림을 기록합니다.
              '접수 완료'는 발송 업체의 요청 수락이며 최종 전달 성공을 의미하지 않습니다.
            </p></div>
            <button className="btn btn-outline" onClick={()=>shop&&void refreshNotifications(shop)}>새로고침</button>
          </div>
          <div style={{background:"#f1f7e9",padding:15,borderRadius:12,fontSize:13,lineHeight:1.8,marginBottom:19}}>
            <strong>연동 준비 상태</strong><br/>
            실제 전송에는 SOLAPI 계정, 카카오 비즈니스 채널과 승인된 알림톡 템플릿,
            Vercel의 서버 비밀 환경변수가 필요합니다. 연동 전에는 예약 이벤트만 기록됩니다.
          </div>
          {isDemo?<div className="dash-empty">데모에서는 실제 알림톡을 전송하지 않습니다.</div>:
          notificationsLoading?<div className="dash-empty">불러오는 중...</div>:
          notificationRows.length===0?<div className="dash-empty">알림 이력이 없습니다. 새 예약이 접수되면 기록됩니다.</div>:
          <div className="table-wrap"><table className="data-table"><thead><tr>
            <th>생성 일시</th><th>유형</th><th>상태</th><th>시도</th>
          </tr></thead><tbody>{notificationRows.map(n=><tr key={n.id}>
            <td>{koDate(n.created_at)}</td>
            <td>{({requested:"예약 요청",confirmed:"예약 확정",rescheduled:"일정 변경",cancelled:"예약 취소",reminder:"방문 전 알림"} as Record<string,string>)[n.event_type]||n.event_type}</td>
            <td><span className={"pill "+(n.status==="submitted"?"confirmed":n.status==="failed"?"cancelled":"pending")}>{({pending:"대기 중",processing:"처리 중",submitted:"발송사 접수 완료",skipped:"건너뜀",failed:"처리 오류"} as Record<string,string>)[n.status]||n.status}</span>
            {n.last_error&&<small className="muted" style={{display:"block",marginTop:4}}>{n.last_error}</small>}</td>
            <td>{n.attempts}</td>
          </tr>)}</tbody></table></div>}
        </div>}
        {tab==="services"&&<div className="dash-panel"><div className="row-between"><h3>예약 가능 정비 항목</h3><button className="btn btn-dark" onClick={()=>setEditService({id:"new-"+crypto.randomUUID().slice(0,5),name:"",description:"",duration_minutes:60,price_from:null,icon:"🔧",approval_required:false})}><Plus size={16}/> 항목 추가</button></div><div className="service-options">{services.map(s=><button className="service-option" key={s.id} onClick={()=>setEditService(s)}><div className="service-emoji">{s.icon||"🔧"}</div><div><strong>{s.name}</strong><small>소요 {s.duration_minutes}분 · {money(s.price_from)} · {s.approval_required?"승인 후 확정":"자동 확정"}</small></div><Settings style={{marginLeft:"auto",color:"#809084"}} size={17}/></button>)}</div></div>}
        {tab==="settings"&&<div className="dash-panel" style={{maxWidth:680}}><h3>매장 기본 정보</h3><form onSubmit={saveShop}>{[["매장명","name"],["전화번호","phone"],["주소","address"],["매장 소개","description"]].map(([label,key])=><div className="field-group" key={key}><label className="field-label">{label}</label><input className="field" value={String(shopForm?.[key as keyof Shop]||"")} onChange={e=>setShopForm(old=>old?{...old,[key]:e.target.value}:old)} required={key==="name"}/></div>)}<div className="field-group"><label className="field-label">동시 예약 수용 건수</label><input className="field" type="number" min={1} max={10} value={shopForm?.slot_capacity||1} onChange={e=>setShopForm(old=>old?{...old,slot_capacity:Number(e.target.value)}:old)}/></div><div className="field-group"><label className="field-label">예약 페이지 주소</label><input className="field" readOnly value={"/book/"+shop.slug}/><small className="hint">매장 주소는 예약 링크 안정성을 위해 자동 발급되고 고정됩니다.</small></div><button className="btn btn-dark" disabled={saving} type="submit">{saving?"저장 중":"설정 저장"}</button></form></div>}
        {tab==="settings"&&<div className="dash-panel" style={{maxWidth:680}}><h3>영업시간 및 예약 가능 시간</h3><p className="booking-help">매일의 예약 가능 시간을 설정합니다. 선택한 시간과 정비 소요 시간을 기준으로 고객에게 예약 슬롯이 제공됩니다.</p>
          {["일","월","화","수","목","금","토"].map((label,i)=>{const h=hours.find(x=>x.day_of_week===i);if(!h)return null;return <div key={i} className="row-between" style={{borderBottom:"1px solid #edf1ea",padding:"12px 0",flexWrap:"wrap"}}><strong style={{width:38,fontSize:13}}>{label}요일</strong><label className="checkbox" style={{margin:0}}><input type="checkbox" checked={!h.is_closed} onChange={e=>setHours(old=>old.map(x=>x.day_of_week===i?{...x,is_closed:!e.target.checked}:x))}/> 영업</label><div className="row-between" style={{gap:8,marginLeft:"auto"}}><input aria-label={label+"요일 시작 시간"} type="time" className="field" style={{width:122}} value={h.open_time.slice(0,5)} disabled={h.is_closed} onChange={e=>setHours(old=>old.map(x=>x.day_of_week===i?{...x,open_time:e.target.value}:x))}/><span className="muted">~</span><input aria-label={label+"요일 종료 시간"} type="time" className="field" style={{width:122}} value={h.close_time.slice(0,5)} disabled={h.is_closed} onChange={e=>setHours(old=>old.map(x=>x.day_of_week===i?{...x,close_time:e.target.value}:x))}/></div></div>;})}
          <button className="btn btn-dark" type="button" disabled={saving} style={{marginTop:20}} onClick={saveHours}>영업시간 저장</button>
          <div style={{marginTop:32,borderTop:"1px solid #eef1ea",paddingTop:25}}><h3>휴무일 차단</h3><p className="booking-help">공휴일, 휴가 등 예약을 받지 않을 날짜를 지정하세요.</p><div className="row-between" style={{justifyContent:"flex-start",flexWrap:"wrap"}}><input aria-label="차단할 날짜" className="field" style={{width:200}} type="date" min={today} value={newBlocked} onChange={e=>setNewBlocked(e.target.value)}/><button type="button" className="btn btn-outline" disabled={!newBlocked} onClick={addBlocked}><Plus size={15}/> 추가</button></div><div style={{display:"grid",gap:9,marginTop:17}}>{blocked.map(b=><div className="row-between" style={{background:"#f8faf6",padding:"10px 15px",borderRadius:9}} key={b.blocked_date}><span style={{fontSize:13}}>{b.blocked_date}</span><button className="btn btn-ghost" type="button" onClick={()=>removeBlocked(b.blocked_date)} aria-label="휴무일 제거"><X size={16}/></button></div>)}{blocked.length===0&&<span className="hint">현재 지정된 휴무일이 없습니다.</span>}</div></div>
        </div>}
      </main></div>
    {showAdd&&<div className="modal-backdrop" onClick={()=>setShowAdd(false)}><div className="modal-card" onClick={e=>e.stopPropagation()}><button className="modal-close" aria-label="닫기" onClick={()=>setShowAdd(false)}><X size={17}/></button><div className="booking-inner"><h2>전화·방문 예약 추가</h2><p className="booking-help">직접 추가한 예약은 캘린더에 표시됩니다.</p><form onSubmit={addManual}><div className="field-group"><label className="field-label">고객 이름</label><input className="field" required maxLength={80} value={addForm.name} onChange={e=>setAddForm({...addForm,name:e.target.value})}/></div><div className="field-group"><label className="field-label">휴대전화</label><input type="tel" className="field" required value={addForm.phone} onChange={e=>setAddForm({...addForm,phone:e.target.value})}/></div><div className="field-group"><label className="field-label">차량 모델</label><input className="field" value={addForm.vehicle} onChange={e=>setAddForm({...addForm,vehicle:e.target.value})}/></div><div className="field-group"><label className="field-label">정비 항목</label><select className="field" required value={addForm.service} onChange={e=>setAddForm({...addForm,service:e.target.value})}>{services.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}><div className="field-group"><label className="field-label">날짜</label><input type="date" className="field" required value={addForm.day} onChange={e=>setAddForm({...addForm,day:e.target.value})}/></div><div className="field-group"><label className="field-label">시간</label><input type="time" className="field" required value={addForm.time} onChange={e=>setAddForm({...addForm,time:e.target.value})}/></div></div><button disabled={saving} className="btn btn-dark btn-wide" type="submit">예약 추가</button></form></div></div></div>}
    {editService&&<div className="modal-backdrop" onClick={()=>setEditService(null)}><div className="modal-card" onClick={e=>e.stopPropagation()}><button className="modal-close" aria-label="닫기" onClick={()=>setEditService(null)}><X size={17}/></button><form className="booking-inner" onSubmit={saveService}><h2>{editService.id.startsWith("new-")?"정비 항목 추가":"정비 항목 수정"}</h2><div className="field-group"><label className="field-label">서비스명</label><input className="field" required maxLength={80} value={editService.name} onChange={e=>setEditService({...editService,name:e.target.value})}/></div><div className="field-group"><label className="field-label">설명</label><input className="field" maxLength={200} value={editService.description||""} onChange={e=>setEditService({...editService,description:e.target.value})}/></div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}><div className="field-group"><label className="field-label">소요 시간 (분)</label><input className="field" type="number" min={30} max={480} step={10} required value={editService.duration_minutes} onChange={e=>setEditService({...editService,duration_minutes:Number(e.target.value)})}/></div><div className="field-group"><label className="field-label">시작 가격 (원)</label><input className="field" type="number" min={0} value={editService.price_from??""} onChange={e=>setEditService({...editService,price_from:e.target.value===""?null:Number(e.target.value)})}/></div></div><div className="field-group"><label className="field-label">아이콘 (이모지)</label><input className="field" value={editService.icon} onChange={e=>setEditService({...editService,icon:e.target.value})}/></div><label className="checkbox" style={{marginBottom:21}}><input type="checkbox" checked={Boolean(editService.approval_required)} onChange={e=>setEditService({...editService,approval_required:e.target.checked})}/> 관리자 승인 후 예약 확정</label><button disabled={saving} className="btn btn-dark btn-wide" type="submit">{saving?"저장 중...":"저장하기"}</button></form></div></div>}
  </div>;
}
function BookingTable({bookings,setStatus}:{bookings:Booking[],setStatus:(b:Booking,status:Booking["status"])=>void}){
  if(bookings.length===0)return <div className="dash-empty">표시할 예약이 없습니다. 예약 페이지에서 테스트 예약을 생성해 보세요.</div>;
  return <div className="table-wrap"><table className="data-table"><thead><tr><th>예약 일시</th><th>고객</th><th>정비 항목</th><th>상태</th><th>관리</th></tr></thead><tbody>{bookings.map(b=><tr key={b.id}><td><strong>{koDate(b.starts_at)}</strong></td><td>{b.customer_name}<br/><small className="muted">{b.customer_phone}</small></td><td>{b.service_name}<br/><small className="muted">{b.vehicle_model||"—"}</small></td><td><span className={"pill "+b.status}>{statusText[b.status]}</span></td><td><select aria-label="예약 상태 변경" className="field" style={{padding:"7px",minHeight:34,width:112,fontSize:11}} value={b.status} onChange={e=>setStatus(b,e.target.value as Booking["status"])}>{Object.entries(statusText).map(([key,value])=><option key={key} value={key}>{value}</option>)}</select></td></tr>)}</tbody></table></div>;
}
export default function DashboardPage(){return <Suspense fallback={<div className="auth-layout">로딩 중...</div>}><Dashboard/></Suspense>;}
