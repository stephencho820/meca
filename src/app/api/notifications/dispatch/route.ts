import { NextRequest,NextResponse } from "next/server";
import {publicDb} from "@/lib/supabase";
import {processNotificationQueue} from "@/lib/notifications";
import {processOwnerPushQueue} from "@/lib/owner-push";
export const runtime="nodejs";
const uuid=/^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
export async function POST(request:NextRequest){
 const token=request.headers.get("authorization")?.replace(/^Bearer /,"")||"";
 if(!token)return NextResponse.json({error:"Unauthorized"},{status:401});
 const db=publicDb();
 if(!db)return NextResponse.json({error:"Unavailable"},{status:503});
 const {data:userData,error:authError}=await db.auth.getUser(token);
 if(authError||!userData.user)return NextResponse.json({error:"Unauthorized"},{status:401});
 let body:unknown;try{body=await request.json();}catch{return NextResponse.json({error:"Invalid"},{status:400});}
 if(!body||typeof body!=="object"||Array.isArray(body))return NextResponse.json({error:"Invalid"},{status:400});
 const bookingId=(body as Record<string,unknown>).booking_id;
 if(typeof bookingId!=="string"||!uuid.test(bookingId))return NextResponse.json({error:"Invalid"},{status:400});
 // Use the caller's JWT so RLS verifies shop ownership, before admin client is used.
 const {createClient}=await import("@supabase/supabase-js");
 const owner=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{
   global:{headers:{Authorization:`Bearer ${token}`}},
   auth:{persistSession:false}
 });
 const {data:booking,error}=await owner.from("bookings").select("id")
   .eq("id",bookingId).maybeSingle();
 if(error||!booking)return NextResponse.json({error:"Forbidden"},{status:403});
 try{
   const push=await processOwnerPushQueue(bookingId);
   const kakao=await processNotificationQueue(bookingId);
   return NextResponse.json({push,kakao});
 }
 catch{return NextResponse.json({error:"Dispatch unavailable"},{status:500});}
}
