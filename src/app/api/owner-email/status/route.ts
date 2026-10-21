import {NextRequest,NextResponse} from "next/server";
import {publicDb} from "@/lib/supabase";
import {ownerEmailConfigured} from "@/lib/owner-email";
export const dynamic="force-dynamic";
export async function GET(req:NextRequest){
 const token=req.headers.get("authorization")?.replace(/^Bearer /,"")||"";
 if(!token)return NextResponse.json({error:"Unauthorized"},{status:401});
 const db=publicDb();
 if(!db)return NextResponse.json({error:"Unavailable"},{status:503});
 const {data,error}=await db.auth.getUser(token);
 if(error||!data.user)return NextResponse.json({error:"Unauthorized"},{status:401});
 return NextResponse.json({
  configured:ownerEmailConfigured(),
  email_verified:Boolean(data.user.email_confirmed_at),
  recipient:data.user.email_confirmed_at?data.user.email:null
 },{headers:{"Cache-Control":"no-store","Referrer-Policy":"no-referrer"}});
}
