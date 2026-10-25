"use client";
import {useCallback,useEffect,useMemo,useState} from "react";
import {BellRing,Smartphone} from "lucide-react";
import {browserDb} from "@/lib/supabase";

type PushConfig={ready:boolean;public_key:string|null};
const message=(e:unknown)=>e instanceof Error?e.message:"알림 설정에 실패했습니다.";

export default function OwnerMobilePushSettings({shopId,isDemo}:{
 shopId:string;isDemo:boolean;
}){
 const db=useMemo(()=>browserDb(),[]);
 const [config,setConfig]=useState<PushConfig|null>(null);
 const [supported,setSupported]=useState(false);
 const [enabled,setEnabled]=useState(false);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState("");
 const [error,setError]=useState("");

 const reload=useCallback(async()=>{
   const capable=typeof window!=="undefined"&&
      "serviceWorker" in navigator&&"PushManager" in window&&"Notification" in window;
   setSupported(capable);
   if(isDemo){setLoading(false);return;}
   try{
     const response=await fetch("/api/owner-push",{cache:"no-store"});
     const config=(await response.json()) as PushConfig;
     setConfig(config);
     if(capable){
       const registration=await navigator.serviceWorker.getRegistration("/");
       const sub=await registration?.pushManager.getSubscription();
       if(sub&&db){
         const {data:registered}=await db.from("owner_push_subscriptions")
           .select("endpoint").eq("shop_id",shopId).limit(8);
         setEnabled(Boolean(registered?.some(row=>row.endpoint===sub.endpoint)));
       }else setEnabled(false);
     }
   }catch{setError("웹 푸시 설정 상태를 확인할 수 없습니다.");}
   finally{setLoading(false);}
 },[db,isDemo,shopId]);
 useEffect(()=>{void reload();},[reload]);

 async function token(){
   if(!db)throw new Error("로그인이 필요합니다.");
   const {data}=await db.auth.getSession();
   if(!data.session?.access_token)throw new Error("세션이 만료됐습니다. 다시 로그인해 주세요.");
   return data.session.access_token;
 }

 function publicKey(raw:string){
   const padded=raw.replace(/-/g,"+").replace(/_/g,"/");
   const bin=atob(padded+"=".repeat((4-padded.length%4)%4));
   return Uint8Array.from(bin,c=>c.charCodeAt(0));
 }

 async function enable(){
   if(!config?.ready||!config.public_key||!supported||isDemo)return;
   setBusy(true);setError("");setNotice("");
   try{
     // Ask permission immediately within the click gesture, before async work.
     const permission=await Notification.requestPermission();
     if(permission!=="granted"){
       throw new Error("휴대전화 브라우저에서 MECA 알림 권한을 허용해 주세요.");
     }
     const registration=await navigator.serviceWorker.register("/sw.js",{scope:"/"});
     await navigator.serviceWorker.ready;
     let subscription=await registration.pushManager.getSubscription();
     const created=!subscription;
     if(!subscription){
       subscription=await registration.pushManager.subscribe({
         userVisibleOnly:true,
         applicationServerKey:publicKey(config.public_key) as unknown as BufferSource
       });
     }
     const json=subscription.toJSON();
     if(!json.endpoint||!json.keys?.p256dh||!json.keys.auth)
       throw new Error("브라우저 알림 키를 확인하지 못했습니다.");
     const response=await fetch("/api/owner-push",{
       method:"POST",headers:{
         Authorization:"Bearer "+await token(),
         "Content-Type":"application/json"
       },cache:"no-store",body:JSON.stringify({
         shop_id:shopId,endpoint:json.endpoint,keys:json.keys
       })
     });
     if(!response.ok){
       const data=await response.json().catch(()=>null) as {error?:string}|null;
       if(created)await subscription.unsubscribe();
       throw new Error(data?.error||"기기 알림 등록에 실패했습니다.");
     }
     setEnabled(true);
     setNotice("휴대전화 웹 푸시를 등록했습니다. 관리자 화면을 닫아도 새 예약 알림을 받을 수 있어요. 기기 절전 모드나 네트워크 상태에 따라 알림이 지연될 수 있습니다.");
   }catch(e){setError(message(e));}
   finally{setBusy(false);}
 }

 async function sendTest(){
   if(isDemo||!enabled||!supported)return;
   setBusy(true);setError("");setNotice("");
   try{
     const reg=await navigator.serviceWorker.getRegistration("/");
     const sub=await reg?.pushManager.getSubscription();
     if(!sub)throw new Error("이 기기에 활성화된 구독이 없습니다. 알림을 다시 등록해 주세요.");
     const res=await fetch("/api/owner-push/test",{
       method:"POST",headers:{
         Authorization:"Bearer "+await token(),
         "Content-Type":"application/json"
       },cache:"no-store",body:JSON.stringify({
         shop_id:shopId,endpoint:sub.endpoint
       })
     });
     const data=await res.json().catch(()=>null) as {error?:string;message?:string}|null;
     if(!res.ok)throw new Error(data?.error||"테스트 알림 전송에 실패했습니다.");
     setNotice(data?.message||"알림 발송 서버가 요청을 접수했습니다. 실제 휴대전화 수신을 확인해 주세요.");
   }catch(e){setError(message(e));}
   finally{setBusy(false);}
 }

 async function disable(){
   if(!supported||isDemo)return;
   setBusy(true);setError("");setNotice("");
   try{
     const registration=await navigator.serviceWorker.getRegistration("/");
     const subscription=await registration?.pushManager.getSubscription();
     if(subscription){
       const response=await fetch("/api/owner-push",{
         method:"DELETE",headers:{
           Authorization:"Bearer "+await token(),
           "Content-Type":"application/json"
         },cache:"no-store",body:JSON.stringify({
           shop_id:shopId,endpoint:subscription.endpoint
         })
       });
       if(!response.ok)throw new Error("서버 알림 등록을 해제하지 못했습니다.");
       await subscription.unsubscribe();
     }
     setEnabled(false);setNotice("이 기기의 휴대전화 푸시 알림을 해제했습니다.");
   }catch(e){setError(message(e));}
   finally{setBusy(false);}
 }

 return <div className="dash-panel" style={{maxWidth:780}}>
   <span className="eyebrow">MOBILE WEB PUSH · FREE</span>
   <h3 style={{display:"flex",alignItems:"center",gap:9}}>
     <BellRing size={21}/> 휴대전화 예약 푸시 알림
   </h3>
   <p className="booking-help">
     고객이 예약을 신청·변경·취소하면 휴대전화에 알림을 보냅니다.
     <strong> 이메일·문자 발송 서비스 비용 없이 사용</strong>하며,
     알림 권한을 허용하면 관리자 화면을 닫아도 받을 수 있습니다.
   </p>
   <div className="resource-item" style={{marginTop:15}}>
     <div><strong>{enabled?"이 기기 웹 푸시 구독 중":"이 기기 웹 푸시 알림 꺼짐"}</strong>
       <small>{loading?"설정 확인 중...":isDemo?"데모에서는 실제 구독하지 않습니다.":
         !supported?"이 브라우저에서는 웹 푸시 기능이 지원되지 않습니다.":
         !config?.ready?"관리자가 웹 푸시 서버 설정을 완료해야 합니다.":
         "이 기기에서 직접 구독하거나 해제할 수 있습니다."}</small>
     </div>
     <Smartphone size={21}/>
   </div>
   <div className="row-between" style={{marginTop:20,gap:10,flexWrap:"wrap"}}>
     <button type="button" className="btn btn-dark"
       disabled={busy||loading||isDemo||!supported||!config?.ready||enabled}
       onClick={()=>void enable()}>{busy?"설정 중...":"이 휴대전화에서 알림 받기"}</button>
     <button type="button" className="btn btn-outline"
       disabled={busy||loading||isDemo||!supported||!enabled}
       onClick={()=>void disable()}>이 기기 알림 끄기</button>
     <button type="button" className="btn btn-outline"
       disabled={busy||loading||isDemo||!enabled}
       onClick={()=>void sendTest()}>테스트 알림 보내기</button>
   </div>
   {notice&&<p className="success" role="status">{notice}</p>}
   {error&&<p className="error" role="alert">{error}</p>}
   <p className="hint" style={{marginTop:14}}>
     안드로이드 Chrome 등에서 지원합니다. iPhone·iPad에서는 Safari의 ‘홈 화면에 추가’로 MECA를 설치한 다음
     홈 화면 아이콘으로 열어 알림을 허용해야 할 수 있습니다.
     알림 권한, 방해 금지 모드, 절전 모드, 네트워크 상태와 브라우저 지원에 따라 실제 수신이 제한될 수 있습니다.
     먼저 ‘테스트 알림 보내기’로 실제 기기 수신을 확인하고, 운영 전에는 고객 예약 흐름도 함께 테스트하세요.
   </p>
 </div>;
}
