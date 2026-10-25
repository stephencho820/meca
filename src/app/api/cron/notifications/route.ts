import { NextRequest,NextResponse } from "next/server";
import { processNotificationQueue,runDailyReminders } from "@/lib/notifications";
import {deliverOwnerEmailJobs} from "@/lib/owner-email";
import {processOwnerPushQueue} from "@/lib/owner-push";
export const dynamic="force-dynamic";
export const runtime="nodejs";
export async function GET(request:NextRequest){
 const secret=process.env.CRON_SECRET;
 if(!secret||request.headers.get("authorization")!==`Bearer ${secret}`)
   return NextResponse.json({error:"Unauthorized"},{status:401});
 try {
   const ownerPush=await processOwnerPushQueue();
   const ownerEmail=await deliverOwnerEmailJobs();
   const kakao=await runDailyReminders();
   return NextResponse.json({owner_push:ownerPush,owner_email:ownerEmail,customer_kakao:kakao},{headers:{"Cache-Control":"no-store"}});
 }
 catch{return NextResponse.json({error:"Cron worker failed"},{status:500});}
}
