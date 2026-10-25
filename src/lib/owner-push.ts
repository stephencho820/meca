import "server-only";
import {publicDb} from "@/lib/supabase";
import {publicPushKey,sendOwnerWebPush,type PushRecipient,type PushOutcome} from "@/lib/web-push";

type Job={
  id:string;shop_id:string;booking_id:string;
  event_type:"requested"|"rescheduled"|"cancelled";
  status:string;created_at:string;attempts:number
};
type Status="submitted"|"skipped"|"retry"|"failed"|"uncertain";

const workerKey=()=>process.env.MECA_PUSH_WORKER_TOKEN||"";
export const pushConfigured=()=>Boolean(publicPushKey()&&/^[a-f0-9]{64}$/.test(workerKey()));

/** Only the server ever knows the narrow worker credential. */
export async function ownerPushReady(){
  if(!pushConfigured())return false;
  const db=publicDb();if(!db)return false;
  const {data,error}=await db.rpc("owner_push_worker_ready",{p_token:workerKey()});
  return !error&&data===true;
}

/** Never surfaces customer information or subscription addresses to the caller. */
export async function processOwnerPushQueue(bookingId?:string){
  const db=publicDb(),token=workerKey();
  if(!db||!pushConfigured())return {configured:false,processed:0,submitted:0,skipped:0,failed:0};
  const {data:jobs,error:claimError}=await db.rpc("claim_owner_push_jobs",{
    p_token:token,p_booking_id:bookingId||null,p_limit:bookingId?5:10
  });
  if(claimError)throw Error("OWNER_PUSH_CLAIM_FAILED");
  let submitted=0,skipped=0,failed=0;
  for(const job of (jobs||[]) as Job[]){
    let status:Status="skipped",reason:string|null=null;
    try{
      if(Date.now()-new Date(job.created_at).getTime()>12*60*60*1000){
        reason="EVENT_EXPIRED";
      }else{
        const {data:targets,error}=await db.rpc("owner_push_targets",{
          p_token:token,p_shop_id:job.shop_id
        });
        if(error)throw Error("PUSH_TARGETS_UNAVAILABLE");
        const subs=(targets||[]) as PushRecipient[];
        if(!subs.length){
          reason="NO_SUBSCRIBERS";
        }else{
          const results:PushOutcome[]=[];
          for(const sub of subs){
            const result=await sendOwnerWebPush(sub,{id:job.id,event_type:job.event_type});
            results.push(result);
            if(result==="gone"){
              await db.rpc("prune_owner_push_subscription",{
                p_token:token,p_subscription_id:sub.id
              });
            }
          }
          if(results.includes("submitted")){
            status="submitted";reason=results.some(r=>r!=="submitted")?"PARTIAL_GATEWAY_ACCEPTANCE":null;
          }else if(results.every(r=>r==="gone")){
            status="skipped";reason="EXPIRED_SUBSCRIPTIONS";
          }else if(results.includes("uncertain")){
            status="uncertain";reason="PUSH_OUTCOME_UNKNOWN";
          }else if(results.includes("retry")){
            status="retry";reason="GATEWAY_RETRY";
          }else{
            status="failed";reason="GATEWAY_REJECTED";
          }
        }
      }
    }catch{
      status="uncertain";reason="PROCESSING_OUTCOME_UNKNOWN";
    }
    const {data:finished,error:finishError}=await db.rpc("finish_owner_push_job",{
      p_token:token,p_job_id:job.id,p_status:status,p_error:reason
    });
    if(finishError||finished!==true)throw Error("OWNER_PUSH_FINISH_FAILED");
    if(status==="submitted")submitted++;
    else if(status==="skipped")skipped++;
    else failed++;
  }
  return {configured:true,processed:(jobs||[]).length,submitted,skipped,failed};
}
