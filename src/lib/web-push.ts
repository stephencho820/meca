import "server-only";
import {
  createPrivateKey,sign,randomBytes,createECDH,hkdfSync,createCipheriv
} from "node:crypto";

export type PushRecipient={id:string;endpoint:string;p256dh:string;auth_secret:string};
export type PushOutcome="submitted"|"gone"|"retry"|"failed"|"uncertain";

const urlSafe=(value:Buffer|string)=>Buffer.from(value).toString("base64url");
const hkdf=(key:Buffer,salt:Buffer,info:Buffer,length:number)=>
  Buffer.from(hkdfSync("sha256",key,salt,info,length));

/** Only approved browser push-service origins may receive server-side fetches. */
export function approvedPushEndpoint(endpoint:string){
  if(typeof endpoint!=="string"||endpoint.length<32||endpoint.length>2048)return false;
  try{
    const url=new URL(endpoint);
    if(url.protocol!=="https:"||url.username||url.password||url.port||url.search||url.hash)return false;
    const host=url.hostname.toLowerCase();
    return host==="fcm.googleapis.com"||host==="updates.push.services.mozilla.com"||
      host==="push.services.mozilla.com"||host==="web.push.apple.com"||
      host.endsWith(".push.apple.com")||host.endsWith(".notify.windows.com");
  }catch{return false;}
}

type VapidConfig={publicKey:string;privateJwk:JsonWebKey;subject:string};
function config():VapidConfig|null{
  const pub=process.env.PUSH_VAPID_PUBLIC_KEY;
  const raw=process.env.PUSH_VAPID_PRIVATE_JWK;
  const subject=process.env.PUSH_VAPID_SUBJECT||"https://meca-tominiko.vercel.app";
  if(!pub||!raw||!/^https:\/\/|^mailto:/.test(subject))return null;
  try{
    const parsed=JSON.parse(raw) as JsonWebKey;
    if(parsed.kty!=="EC"||parsed.crv!=="P-256"||!parsed.d||!parsed.x||!parsed.y)return null;
    const calculated=Buffer.concat([
      Buffer.from([4]),Buffer.from(parsed.x,"base64url"),Buffer.from(parsed.y,"base64url")
    ]).toString("base64url");
    if(calculated!==pub||Buffer.from(pub,"base64url").length!==65)return null;
    return {publicKey:pub,privateJwk:parsed,subject};
  }catch{return null;}
}
export const publicPushKey=()=>config()?.publicKey||null;

function vapidJwt(endpoint:string,creds:VapidConfig){
  const header=urlSafe(JSON.stringify({typ:"JWT",alg:"ES256"}));
  const payload=urlSafe(JSON.stringify({
    aud:new URL(endpoint).origin,
    exp:Math.floor(Date.now()/1000)+12*3600,
    sub:creds.subject
  }));
  const input=header+"."+payload;
  const privateKey=createPrivateKey({key:creds.privateJwk,format:"jwk"});
  const signature=sign("sha256",Buffer.from(input),{key:privateKey,dsaEncoding:"ieee-p1363"});
  return input+"."+urlSafe(signature);
}

/** RFC 8291: aes128gcm content encoding, ECDH P-256 + HKDF and record delimiter. */
export function encryptedPushPayload(recipient:PushRecipient,payload:object){
  const receiver=Buffer.from(recipient.p256dh,"base64url");
  const authSecret=Buffer.from(recipient.auth_secret,"base64url");
  if(receiver.length!==65||receiver[0]!==4||authSecret.length!==16)
    throw new Error("PUSH_KEYS_INVALID");
  const ephemeral=createECDH("prime256v1");
  const sender=ephemeral.generateKeys();
  const shared=ephemeral.computeSecret(receiver);
  const info=Buffer.concat([Buffer.from("WebPush: info\0"),receiver,sender]);
  const inputKey=hkdf(shared,authSecret,info,32);
  const salt=randomBytes(16);
  const contentKey=hkdf(inputKey,salt,Buffer.from("Content-Encoding: aes128gcm\0"),16);
  const nonce=hkdf(inputKey,salt,Buffer.from("Content-Encoding: nonce\0"),12);
  const message=Buffer.concat([Buffer.from(JSON.stringify(payload),"utf8"),Buffer.from([2])]);
  if(message.length>3800)throw new Error("PUSH_PAYLOAD_TOO_LARGE");
  const cipher=createCipheriv("aes-128-gcm",contentKey,nonce);
  const ciphertext=Buffer.concat([cipher.update(message),cipher.final(),cipher.getAuthTag()]);
  const recordSize=Buffer.alloc(4);recordSize.writeUInt32BE(4096,0);
  return Buffer.concat([salt,recordSize,Buffer.from([sender.length]),sender,ciphertext]);
}

export async function sendOwnerWebPush(
 recipient:PushRecipient,event:{id:string;event_type:"requested"|"rescheduled"|"cancelled"}
):Promise<PushOutcome>{
  const creds=config();
  if(!creds) return "failed";
  if(!approvedPushEndpoint(recipient.endpoint))return "failed";
  const titles={
    requested:"MECA · 새 예약 승인 대기",
    rescheduled:"MECA · 예약 일정 변경",
    cancelled:"MECA · 예약 취소"
  };
  const bodies={
    requested:"고객 예약이 접수되었습니다. 관리자에서 확인해 주세요.",
    rescheduled:"고객이 예약 일정을 변경했습니다. 관리자에서 확인해 주세요.",
    cancelled:"고객이 예약을 취소했습니다. 관리자에서 확인해 주세요."
  };
  const payload=encryptedPushPayload(recipient,{
    title:titles[event.event_type],body:bodies[event.event_type],tag:"meca-"+event.id,
    url:"/dashboard"
  });
  let response:Response;
  try{
    response=await fetch(recipient.endpoint,{
      method:"POST",headers:{
        "TTL":"14400","Urgency":"high",
        "Content-Encoding":"aes128gcm",
        "Content-Type":"application/octet-stream",
        "Authorization":"vapid t="+vapidJwt(recipient.endpoint,creds)+", k="+creds.publicKey
      },
      body:new Uint8Array(payload),
      signal:AbortSignal.timeout(8000),cache:"no-store"
    });
  }catch{
    // The push gateway may have accepted the request; never blindly duplicate.
    return "uncertain";
  }
  if(response.ok)return "submitted";
  if(response.status===404||response.status===410)return "gone";
  if(response.status===429||response.status>=500)return "retry";
  return "failed";
}
