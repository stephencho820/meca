import {createClient} from "@supabase/supabase-js";

/**
 * Signup-confirmation emails are commonly opened in a different mobile browser
 * from the one where signup began. A PKCE callback requires the original
 * browser-local verifier; an implicit EMAIL confirmation can be completed in
 * the recipient browser instead. This client is used ONLY for email signup
 * and confirmation resend, never for the long-lived dashboard session.
 */
export function emailConfirmationClient(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!url||!key)return null;
 return createClient(url,key,{
  auth:{flowType:"implicit",persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}
 });
}
export async function resendSignupConfirmation(email:string){
 const client=emailConfirmationClient();
 if(!client)return {error:"인증 서버에 연결할 수 없습니다."};
 const {error}=await client.auth.resend({
  type:"signup",email:email.trim().toLowerCase(),
  options:{emailRedirectTo:window.location.origin+"/auth/callback"}
 });
 if(error)return {error:error.status===429?"요청이 많습니다. 잠시 후 다시 시도해 주세요.":"인증 메일을 보내지 못했습니다. 잠시 후 다시 시도해 주세요."};
 return {error:null};
}
