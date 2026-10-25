import {NextRequest,NextResponse} from "next/server";
import {createHash} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
import {publicDb} from "@/lib/supabase";
import {approvedPushEndpoint} from "@/lib/web-push";
import {ownerPushReady} from "@/lib/owner-push";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const noStore={"Cache-Control":"no-store","Referrer-Policy":"no-referrer"};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Payload={shop_id?:unknown;endpoint?:unknown;keys?:{p256dh?:unknown;auth?:unknown}};
const error=(message:string,status:number)=>
  NextResponse.json({error:message},{status,headers:noStore});

export async function GET(){
  const ready=await ownerPushReady();
  return NextResponse.json({
    ready,
    public_key:ready?process.env.PUSH_VAPID_PUBLIC_KEY:null
  },{headers:noStore});
}

async function ownerFor(req:NextRequest,shopId:string){
 const token=req.headers.get("authorization")?.replace(/^Bearer /,"")||"";
 const db=publicDb();
 if(!token||!db)return null;
 const {data,error}=await db.auth.getUser(token);
 if(error||!data.user)return null;
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!url||!anon)return null;
 const owner=createClient(url,anon,{
   global:{headers:{Authorization:"Bearer "+token}},
   auth:{persistSession:false,autoRefreshToken:false}
 });
 const {data:shop, error:shopError}=await owner.from("shops")
   .select("id").eq("id",shopId).eq("owner_id",data.user.id).maybeSingle();
 if(shopError||!shop)return null;
 return {owner,ownerId:data.user.id};
}
async function payload(req:NextRequest){
 if(Number(req.headers.get("content-length")||0)>3600)return null;
 try{
   const raw=await req.text();
   if(raw.length>3600)return null;
   const obj=JSON.parse(raw);
   if(!obj||typeof obj!=="object"||Array.isArray(obj))return null;
   return obj as Payload;
 }catch{return null;}
}
const validKeys=(input:Payload)=>{
 const p=input.keys?.p256dh,a=input.keys?.auth;
 if(typeof p!=="string"||typeof a!=="string"||!/^[A-Za-z0-9_-]+$/.test(p)||!/^[A-Za-z0-9_-]+$/.test(a))return false;
 try{
   const raw=Buffer.from(p,"base64url"),auth=Buffer.from(a,"base64url");
   return raw.length===65&&raw[0]===4&&auth.length===16;
 }catch{return false;}
};
const sameOrigin=(req:NextRequest)=>
 !req.headers.get("origin")||req.headers.get("origin")===req.nextUrl.origin;

export async function POST(req:NextRequest){
 if(!sameOrigin(req))return error("요청 출처를 확인해 주세요.",403);
 if(!await ownerPushReady())return error("웹 푸시 발송 준비가 완료되지 않았습니다.",503);
 const body=await payload(req);
 const shopId=body?.shop_id,endpoint=body?.endpoint;
 if(typeof shopId!=="string"||!uuid.test(shopId)||typeof endpoint!=="string"||
    !approvedPushEndpoint(endpoint)||!body||!validKeys(body))
   return error("휴대전화 알림 정보를 확인해 주세요.",400);
 const session=await ownerFor(req,shopId);
 if(!session)return error("로그인한 매장 관리자만 알림을 등록할 수 있습니다.",403);
 const hashed=createHash("sha256").update(endpoint).digest("hex");
 const {data:existing,error:readError}=await session.owner.from("owner_push_subscriptions")
   .select("id,endpoint_hash").eq("shop_id",shopId);
 if(readError)return error("기존 알림 설정을 확인하지 못했습니다.",500);
 if((existing||[]).length>=8 && !(existing||[]).some(x=>x.endpoint_hash===hashed))
   return error("한 매장에서는 최대 8개 기기까지 알림을 등록할 수 있습니다.",409);
 const {error:writeError}=await session.owner.from("owner_push_subscriptions").upsert({
   shop_id:shopId,owner_id:session.ownerId,
   endpoint,endpoint_hash:hashed,p256dh:body.keys!.p256dh,auth_secret:body.keys!.auth,
   updated_at:new Date().toISOString()
 },{onConflict:"shop_id,endpoint_hash"});
 if(writeError)return error("알림 등록을 완료하지 못했습니다.",500);
 return NextResponse.json({enabled:true},{headers:noStore});
}

export async function DELETE(req:NextRequest){
 if(!sameOrigin(req))return error("요청 출처를 확인해 주세요.",403);
 const body=await payload(req);
 const shopId=body?.shop_id,endpoint=body?.endpoint;
 if(typeof shopId!=="string"||!uuid.test(shopId)||typeof endpoint!=="string"||
    !approvedPushEndpoint(endpoint))return error("알림 정보를 확인해 주세요.",400);
 const session=await ownerFor(req,shopId);
 if(!session)return error("로그인한 매장 관리자만 알림을 끌 수 있습니다.",403);
 const hashed=createHash("sha256").update(endpoint).digest("hex");
 const {error:deleteError}=await session.owner.from("owner_push_subscriptions")
   .delete().eq("shop_id",shopId).eq("endpoint_hash",hashed);
 if(deleteError)return error("알림 설정을 해제하지 못했습니다.",500);
 return NextResponse.json({enabled:false},{headers:noStore});
}
