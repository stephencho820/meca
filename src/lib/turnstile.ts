import type { NextRequest } from "next/server";

type VerifyResponse={
  success?:boolean; hostname?:string; "error-codes"?:string[];
};
export type BotCheckResult="ok"|"missing"|"invalid"|"unavailable";

/**
 * Cloudflare Turnstile opt-in. Never accept client claims of success.
 * When either credential is configured, both must be present (fail closed).
 * Turnstile is a deployment-side protective layer; callers with direct
 * access to the public Supabase RPC still need DB-level quotas and WAF.
 */
export async function verifyHuman(request:NextRequest,token:unknown):Promise<BotCheckResult>{
 const secret=process.env.TURNSTILE_SECRET_KEY;
 const siteKey=process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
 if(!secret&&!siteKey)return "ok"; // explicitly not configured
 if(!secret||!siteKey)return "unavailable";
 if(typeof token!=="string"||token.length<10||token.length>2048)return "missing";
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),7000);
 try{
   const form=new URLSearchParams({secret,response:token});
   const res=await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify",{
     method:"POST",
     headers:{"Content-Type":"application/x-www-form-urlencoded"},
     body:form,
     signal:controller.signal,
     cache:"no-store"
   });
   if(!res.ok)return "unavailable";
   const json=await res.json() as VerifyResponse;
   if(!json.success||!json.hostname||json.hostname!==request.nextUrl.hostname)return "invalid";
   return "ok";
 }catch{return "unavailable";}
 finally{clearTimeout(timeout);}
}
