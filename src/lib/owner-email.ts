import "server-only";
import {createClient} from "@supabase/supabase-js";

type Job={id:string;shop_id:string;booking_id:string;
  event_type:"requested"|"rescheduled"|"cancelled";starts_at:string;
  created_at:string;attempts:number};
type Booking={id:string;shop_id:string;customer_name:string;service_name:string;starts_at:string;status:string};
type Shop={id:string;name:string;owner_id:string};
type EndStatus="submitted"|"skipped"|"retry"|"failed"|"uncertain";

export function ownerEmailConfigured(){
 return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY&&
   process.env.NEXT_PUBLIC_SUPABASE_URL&&process.env.RESEND_API_KEY&&
   process.env.MECA_OWNER_EMAIL_FROM);
}
function admin(){
 if(!process.env.SUPABASE_SERVICE_ROLE_KEY||!process.env.NEXT_PUBLIC_SUPABASE_URL)return null;
 return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{
   auth:{persistSession:false,autoRefreshToken:false}
 });
}
const encode=(s:string)=>s.replace(/[&<>"']/g,c=>({
 "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
})[c]||c);
const eventTitle:Record<Job["event_type"],string>={
 requested:"신규 예약 접수",rescheduled:"예약 일정 변경",cancelled:"예약 취소"
};
function message(job:Job,booking:Booking,shop:Shop){
 const when=new Intl.DateTimeFormat("ko-KR",{
  timeZone:"Asia/Seoul",year:"numeric",month:"long",day:"numeric",
  weekday:"short",hour:"2-digit",minute:"2-digit",hour12:false
 }).format(new Date(job.starts_at));
 const title=eventTitle[job.event_type];
 const status=job.event_type==="requested"
  ?booking.status==="pending"?"사장님 승인 대기":"예약 확정":title;
 const site=(process.env.NEXT_PUBLIC_SITE_URL||"https://meca-tominiko.vercel.app")
  .replace(/\/$/,"");
 const dashboard=site+"/dashboard";
 const html=`<div style="max-width:520px;font-family:Arial,sans-serif;line-height:1.7;color:#213b2a">
  <h2>MECA · ${encode(title)}</h2>
  <p><strong>${encode(shop.name)}</strong>에 고객 예약 알림이 있습니다.</p>
  <p>방문: ${encode(when)}<br/>정비: ${encode(booking.service_name)}<br/>
  고객: ${encode(booking.customer_name)}<br/>상태: ${encode(status)}</p>
  <p><a href="${encode(dashboard)}" style="color:#286139">관리자 예약 화면에서 확인하기</a></p>
  <small>이 알림은 정비소 사장님 계정의 확인된 이메일로 발송한 운영 알림입니다.
  고객에게 알림톡·문자는 발송되지 않습니다.</small></div>`;
 return {from:process.env.MECA_OWNER_EMAIL_FROM!,
   subject:`[MECA] ${shop.name} · ${title}`,html};
}
function eligible(j:Job,b:Booking):boolean{
 if(j.event_type==="cancelled")return b.status==="cancelled";
 return ["pending","confirmed"].includes(b.status)&&b.starts_at===j.starts_at;
}

/** Provider accepts an email; it does not mean the recipient read or received it. */
export async function deliverOwnerEmailJobs(bookingId?:string){
 const db=admin();
 if(!db||!ownerEmailConfigured())return {configured:false,processed:0,accepted:0,skipped:0,failed:0};
 const {data,error}=await db.rpc("claim_owner_email_jobs",{
   p_booking_id:bookingId||null,p_limit:bookingId?5:15
 });
 if(error)throw new Error("OWNER_EMAIL_CLAIM_FAILED");
 let accepted=0,skipped=0,failed=0;
 for(const job of (data||[]) as Job[]){
   let status:EndStatus="skipped",providerId:string|null=null,errorCode:string|null=null;
   try{
     if(Date.now()-new Date(job.created_at).getTime()>12*60*60*1000){
       status="skipped";errorCode="STALE_EVENT";
     }else{
       const [{data:booking,error:be},{data:shop,error:se},{data:pref,error:pe}]=await Promise.all([
         db.from("bookings").select("id,shop_id,customer_name,service_name,starts_at,status")
           .eq("id",job.booking_id).eq("shop_id",job.shop_id).single(),
         db.from("shops").select("id,name,owner_id").eq("id",job.shop_id).single(),
         db.from("owner_email_preferences").select("enabled").eq("shop_id",job.shop_id).single()
       ]);
       if(be||se||pe||!booking||!shop||!pref)throw new Error("RECORD_MISSING");
       if(!pref.enabled||!eligible(job,booking as Booking)){
         status="skipped";errorCode="UNSUBSCRIBED_OR_SUPERSEDED";
       }else{
         const {data:owner,error:oe}=await db.auth.admin.getUserById((shop as Shop).owner_id);
         if(oe||!owner.user?.email||!owner.user.email_confirmed_at){
           status="skipped";errorCode="OWNER_EMAIL_NOT_VERIFIED";
         }else{
           const {from,subject,html}=message(job,booking as Booking,shop as Shop);
           const ctrl=new AbortController();
           const timer=setTimeout(()=>ctrl.abort(),7000);
           let res:Response;
           try{
             res=await fetch("https://api.resend.com/emails",{
               method:"POST",
               headers:{"Authorization":`Bearer ${process.env.RESEND_API_KEY}`,
                 "Content-Type":"application/json",
                 "Idempotency-Key":`meca-owner-${job.id}`},
               body:JSON.stringify({from,to:[owner.user.email],subject,html}),
               signal:ctrl.signal,cache:"no-store"
             });
           }catch{
             // A timed-out request may already have been accepted. Do not
             // auto-resend ambiguous network outcomes.
             status="uncertain";errorCode="NETWORK_SEND_UNCERTAIN";
             res=null as unknown as Response;
           }finally{clearTimeout(timer);}
           if(res){
             if(res.ok){
               const answer=await res.json().catch(()=>null) as {id?:string}|null;
               providerId=answer?.id||null;
               status=providerId?"submitted":"uncertain";
               errorCode=providerId?null:"RESPONSE_NO_MESSAGE_ID";
             }else if(res.status===429||res.status>=500){
               status="retry";errorCode=`PROVIDER_${res.status}`;
             }else{
               status="failed";errorCode=`PROVIDER_${res.status}`;
             }
           }
         }
       }
     }
   }catch{
     // Unknown failures can happen after the provider accepts a message.
     status="uncertain";errorCode="PROCESSING_UNCERTAIN";
   }
   const {data:finished,error:fe}=await db.rpc("finish_owner_email_job",{
      p_id:job.id,p_status:status,p_provider_id:providerId,p_error:errorCode
   });
   if(fe||finished!==true)throw new Error("OWNER_EMAIL_FINISH_FAILED");
   if(status==="submitted")accepted++;
   else if(status==="skipped")skipped++;
   else failed++;
 }
 return {configured:true,processed:(data||[]).length,accepted,skipped,failed};
}
