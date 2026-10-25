import {NextRequest,NextResponse} from "next/server";
import {createHash,randomUUID} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
import {publicDb} from "@/lib/supabase";
import {approvedPushEndpoint,sendOwnerWebPush,type PushRecipient} from "@/lib/web-push";
import {ownerPushReady} from "@/lib/owner-push";

export const runtime="nodejs";
const headers={"Cache-Control":"no-store","Referrer-Policy":"no-referrer"};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;
const err=(status:number,message:string)=>NextResponse.json({error:message},{status,headers});

export async function POST(req:NextRequest){
 if(req.headers.get("origin")&&req.headers.get("origin")!==req.nextUrl.origin)
   return err(403,"허용되지 않은 요청입니다.");
 if(!await ownerPushReady())return err(503,"푸시 서버 설정을 확인해 주세요.");
 let body:{shop_id?:unknown;endpoint?:unknown};
 try{
  const raw=await req.text();
  if(raw.length>2500)return err(413,"요청이 너무 큽니다.");
  body=JSON.parse(raw);
 }catch{return err(400,"잘못된 요청입니다.");}
 if(!body||typeof body!=="object"||Array.isArray(body)||
    typeof body.shop_id!=="string"||!uuid.test(body.shop_id)||
    typeof body.endpoint!=="string"||!approvedPushEndpoint(body.endpoint))
   return err(400,"알림 구독 정보를 확인해 주세요.");
 const token=req.headers.get("authorization")?.replace(/^Bearer /,"")||"";
 const anon=publicDb();
 if(!token||!anon)return err(401,"로그인이 필요합니다.");
 const {data:auth,error:authError}=await anon.auth.getUser(token);
 if(authError||!auth.user)return err(401,"로그인이 필요합니다.");
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,anonKey=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!url||!anonKey)return err(503,"인증 서버를 사용할 수 없습니다.");
 const db=createClient(url,anonKey,{
  global:{headers:{Authorization:"Bearer "+token}},
  auth:{persistSession:false,autoRefreshToken:false}
 });
 const {data:shop}=await db.from("shops").select("id")
  .eq("id",body.shop_id).eq("owner_id",auth.user.id).maybeSingle();
 if(!shop)return err(403,"이 매장에 대한 권한이 없습니다.");
 const hashed=createHash("sha256").update(body.endpoint).digest("hex");
 const {data:subscription,error:subError}=await db.from("owner_push_subscriptions")
  .select("id,endpoint,p256dh,auth_secret")
  .eq("shop_id",body.shop_id).eq("endpoint_hash",hashed).maybeSingle();
 if(subError||!subscription)return err(404,"먼저 이 기기의 알림을 활성화해 주세요.");
 const {data:allowed,error:allowError}=await db.rpc("claim_owner_push_test",{p_shop_id:body.shop_id});
 if(allowError)return err(503,"테스트 알림을 준비하지 못했습니다.");
 if(!allowed)return err(429,"테스트 알림은 매장별 2분에 한 번 보낼 수 있습니다.");
 const result=await sendOwnerWebPush(subscription as PushRecipient,{
  id:randomUUID(),event_type:"test"
 });
 if(result==="gone"){
  await db.from("owner_push_subscriptions").delete().eq("id",subscription.id);
  return err(410,"기존 구독이 만료됐습니다. 알림을 다시 활성화해 주세요.");
 }
 if(result==="submitted")return NextResponse.json({
   accepted:true,message:"푸시 발송 서버가 요청을 접수했습니다. 휴대전화 알림이 실제로 표시되는지 확인해 주세요."
 },{headers});
 return err(503,"휴대전화 푸시 서버가 요청을 수락하지 않았습니다. 네트워크와 알림 설정을 확인해 주세요.");
}
