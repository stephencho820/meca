"use client";
import {useEffect,useRef,useState} from "react";
import {Bell} from "lucide-react";
import type {Booking} from "@/lib/types";

/** No paid provider required; browser notifications work only while owner has
 * this dashboard open and the browser granted notification permission. */
export default function OwnerBrowserAlerts({shopId,bookings,showSettings,isDemo}:{
 shopId:string;bookings:Booking[];showSettings:boolean;isDemo:boolean
}){
 const key="meca-browser-alerts:"+shopId;
 const seen=useRef<Set<string>|null>(null);
 const [enabled,setEnabled]=useState(false);
 const [notice,setNotice]=useState("");
 useEffect(()=>{
   setEnabled(!isDemo&&localStorage.getItem(key)==="1");
   seen.current=null;
 },[key,isDemo]);
 useEffect(()=>{
   if(seen.current===null){
     if(bookings.length)seen.current=new Set(bookings.map(b=>b.id));
     return;
   }
   const fresh=bookings.filter(b=>!seen.current!.has(b.id)&&b.source==="web"
     &&b.status==="pending"&&b.created_at
     &&Date.now()-new Date(b.created_at).getTime()<180_000);
   bookings.forEach(b=>seen.current!.add(b.id));
   if(!fresh.length||!enabled||isDemo||!("Notification" in window)||Notification.permission!=="granted")return;
   void (async()=>{
     try{
       // Avoid duplicate phone + in-tab notifications on the same device.
       if("serviceWorker" in navigator){
         const registration=await navigator.serviceWorker.getRegistration("/");
         if(registration?.pushManager&&await registration.pushManager.getSubscription())return;
       }
       const alert=new Notification("MECA · 새 예약 승인 대기",{
         body:"새 고객 예약이 접수되었습니다. 관리자에서 확인해 주세요.",
         tag:"meca-new-"+fresh[0].id
       });
       alert.onclick=()=>{window.focus();alert.close();};
     }catch{/* Safari/private mode can restrict notifications. */}
   })();
 },[bookings,enabled,isDemo]);
 async function enable(){
   if(!("Notification" in window)){setNotice("이 브라우저는 알림을 지원하지 않습니다.");return;}
   try{
     const permission=await Notification.requestPermission();
     if(permission!=="granted"){setNotice("브라우저 설정에서 알림 권한을 허용해야 합니다.");return;}
     localStorage.setItem(key,"1");setEnabled(true);setNotice("관리자 화면을 열어둔 동안 신규 예약 브라우저 알림을 받습니다.");
   }catch{setNotice("알림 권한을 허용하지 못했습니다.");}
 }
 function disable(){localStorage.removeItem(key);setEnabled(false);setNotice("브라우저 알림을 껐습니다.");}
 if(!showSettings)return null;
 return <div className="dash-panel" style={{maxWidth:780}}>
   <h3><Bell size={20} style={{verticalAlign:"middle",marginRight:7}}/>브라우저 새 예약 알림</h3>
   <p className="booking-help">외부 이메일 서비스 없이 사용할 수 있어요. 관리자 화면을 열어둔 동안 새 예약이 들어오면 브라우저 알림을 띄웁니다. <strong>브라우저를 닫으면 알림이 오지 않습니다.</strong></p>
   <div className="row-between"><strong>{enabled?"알림 켜짐":"알림 꺼짐"}</strong>
     <button className="btn btn-outline" type="button" disabled={isDemo}
       onClick={()=>{if(enabled)disable();else void enable();}}>
       {enabled?"끄기":"알림 켜기"}</button></div>
   {notice&&<p className="success" role="status">{notice}</p>}
 </div>;
}
