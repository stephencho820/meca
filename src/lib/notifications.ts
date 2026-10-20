import { createHmac, randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type EventType = "requested"|"confirmed"|"rescheduled"|"cancelled"|"reminder";
type Job={id:string;booking_id:string;shop_id:string;event_type:EventType;
  booking_starts_at:string;created_at:string;status:string};
type Booking={id:string;customer_name:string;customer_phone:string;
  starts_at:string;service_name:string;status:string};
type Shop={id:string;name:string};

export const notificationConfig=()=>{
 const templateIds={
   requested:process.env.SOLAPI_TEMPLATE_REQUESTED,
   confirmed:process.env.SOLAPI_TEMPLATE_CONFIRMED,
   rescheduled:process.env.SOLAPI_TEMPLATE_RESCHEDULED,
   cancelled:process.env.SOLAPI_TEMPLATE_CANCELLED,
   reminder:process.env.SOLAPI_TEMPLATE_REMINDER
 };
 const required=[
   process.env.NEXT_PUBLIC_SUPABASE_URL,
   process.env.SUPABASE_SERVICE_ROLE_KEY,
   process.env.SOLAPI_API_KEY,
   process.env.SOLAPI_API_SECRET,
   process.env.SOLAPI_PF_ID,
   ...Object.values(templateIds)
 ];
 return {enabled:process.env.MECA_NOTIFICATIONS_ENABLED==="true" && required.every(Boolean),
         templateIds};
};

function adminDb():SupabaseClient|null{
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)return null;
 return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
function eligible(job:Job,b:Booking):boolean{
 if(job.event_type==="cancelled")return b.status==="cancelled";
 if(job.event_type==="requested")return b.status==="pending"&&b.starts_at===job.booking_starts_at;
 if(job.event_type==="confirmed")return b.status==="confirmed"&&b.starts_at===job.booking_starts_at;
 if(job.event_type==="rescheduled")return ["pending","confirmed"].includes(b.status)&&b.starts_at===job.booking_starts_at;
 if(job.event_type==="reminder"){
   const visit=new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(b.starts_at));
   const next=new Date();
   next.setUTCDate(next.getUTCDate()+1);
   const tomorrow=new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit"}).format(next);
   return b.status==="confirmed"&&b.starts_at===job.booking_starts_at&&visit===tomorrow;
 }
 return false;
}
function templateValues(b:Booking,shop:Shop){
 const date=new Intl.DateTimeFormat("ko-KR",{timeZone:"Asia/Seoul",year:"numeric",month:"long",day:"numeric",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date(b.starts_at));
 return {
   "#{매장명}":shop.name,
   "#{고객명}":b.customer_name,
   "#{예약일시}":date,
   "#{서비스명}":b.service_name,
   "#{예약번호}":b.id.slice(0,8).toUpperCase()
 };
}
async function sendKakao(job:Job,b:Booking,shop:Shop):Promise<string>{
 const config=notificationConfig();
 const pfId=process.env.SOLAPI_PF_ID!,templateId=config.templateIds[job.event_type]!;
 if(!templateId)throw Error("TEMPLATE_MISSING");
 const date=new Date().toISOString(),salt=randomBytes(16).toString("hex");
 const signature=createHmac("sha256",process.env.SOLAPI_API_SECRET!).update(date+salt).digest("hex");
 const authorization=`HMAC-SHA256 apiKey=${process.env.SOLAPI_API_KEY}, date=${date}, salt=${salt}, signature=${signature}`;
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),8000);
 try{
   const response=await fetch("https://api.solapi.com/messages/v4/send-many/detail",{
     method:"POST",
     headers:{"Authorization":authorization,"Content-Type":"application/json"},
     body:JSON.stringify({messages:[{
       to:b.customer_phone,
       type:"ATA",
       kakaoOptions:{pfId,templateId,variables:templateValues(b,shop),disableSms:true},
       strict:true
     }]}),
     signal:controller.signal,
     cache:"no-store"
   });
   if(!response.ok)throw Error("PROVIDER_HTTP_"+response.status);
   const result=await response.json() as {
     failedMessageList?:unknown[];
     groupInfo?:{groupId?:string;count?:{registeredSuccess?:number;registeredFailed?:number}};
   };
   const failures=result.failedMessageList?.length||0;
   // Solapi accepts an async send request; do not imply delivery.
   if(failures>0 || !result.groupInfo?.groupId ||
     (result.groupInfo?.count?.registeredSuccess??0)<1)throw Error("PROVIDER_REJECTED");
   return result.groupInfo.groupId;
 }finally{clearTimeout(timeout);}
}
export async function processNotificationQueue(bookingId?:string){
 const config=notificationConfig(),db=adminDb();
 if(!config.enabled||!db)return {configured:false,processed:0,submitted:0,skipped:0,failed:0};
 const {data,error}=await db.rpc("claim_meca_notifications",{
   p_booking_id:bookingId||null,p_limit:bookingId?8:25
 });
 if(error)throw Error("QUEUE_CLAIM_FAILED");
 let submitted=0,skipped=0,failed=0;
 for(const job of (data||[]) as Job[]){
   let status:"submitted"|"skipped"|"failed"="skipped";
   let groupId:string|null=null,issue:string|null=null;
   try{
     const {data:booking,error:be}=await db.from("bookings")
       .select("id,customer_name,customer_phone,starts_at,service_name,status")
       .eq("id",job.booking_id).single();
     const {data:shop,error:se}=await db.from("shops").select("id,name")
       .eq("id",job.shop_id).single();
     if(be||se||!booking||!shop)throw Error("MISSING_RECORD");
     // Avoid delayed confirmations that could confuse customers when credentials
     // are added long after the original bookings were created.
     const old=Date.now()-new Date(job.created_at).getTime()>12*60*60*1000;
     if(old&&job.event_type!=="reminder"){status="skipped";issue="STALE_EVENT";}
     else if(!eligible(job,booking as Booking)){status="skipped";issue="SUPERSEDED_EVENT";}
     else {
       groupId=await sendKakao(job,booking as Booking,shop as Shop);
       status="submitted"; // Provider API accepted, not recipient delivered.
     }
   }catch(e){
     status="failed";
     const raw=e instanceof Error?e.message:"UNKNOWN";
     // Never persist PII or provider response bodies.
     issue=/^(MISSING_RECORD|TEMPLATE_MISSING|PROVIDER_REJECTED|PROVIDER_HTTP_\d+)$/.test(raw)?raw:"SEND_UNCERTAIN_CHECK_PROVIDER";
   }
   const {error:finishError}=await db.rpc("finish_meca_notification",{
     p_id:job.id,p_status:status,p_group_id:groupId,p_error:issue
   });
   if(finishError)throw Error("QUEUE_FINALIZATION_FAILED");
   if(status==="submitted")submitted++;
   else if(status==="skipped")skipped++;
   else failed++;
 }
 return {configured:true,processed:(data||[]).length,submitted,skipped,failed};
}
export async function runDailyReminders(){
 const db=adminDb();
 if(!db||!notificationConfig().enabled)return {configured:false,scheduled:0,processed:0};
 const {data,error}=await db.rpc("schedule_meca_reminders");
 if(error)throw Error("REMINDER_SCHEDULING_FAILED");
 return {...await processNotificationQueue(),scheduled:data||0};
}
