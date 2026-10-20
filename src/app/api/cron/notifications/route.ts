import { NextRequest,NextResponse } from "next/server";
import { processNotificationQueue,runDailyReminders } from "@/lib/notifications";
export const dynamic="force-dynamic";
export const runtime="nodejs";
export async function GET(request:NextRequest){
 const secret=process.env.CRON_SECRET;
 if(!secret||request.headers.get("authorization")!==`Bearer ${secret}`)
   return NextResponse.json({error:"Unauthorized"},{status:401});
 try {return NextResponse.json(await runDailyReminders(),{headers:{"Cache-Control":"no-store"}});}
 catch{return NextResponse.json({error:"Cron worker failed"},{status:500});}
}
