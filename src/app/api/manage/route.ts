import { processNotificationQueue } from "@/lib/notifications";
import {deliverOwnerEmailJobs} from "@/lib/owner-email";
import {processOwnerPushQueue} from "@/lib/owner-push";
import { NextRequest, NextResponse, after } from "next/server";
import { publicDb } from "@/lib/supabase";
export const dynamic = "force-dynamic";

const tokenPattern = /^[0-9a-f]{64}$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^([01][0-9]|2[0-3]):(00|30)$/;
const noStore = {"Cache-Control":"no-store, max-age=0","Referrer-Policy":"no-referrer"};

// Token is an unguessable 256-bit capability. We deliberately do NOT
// accept booking-ID + telephone-only searches without OTP verification.
export async function POST(request:NextRequest){
  let body:unknown;
  try{body=await request.json();}catch{
    return NextResponse.json({error:"잘못된 요청입니다."},{status:400,headers:noStore});
  }
  if(!body||typeof body!=="object"||Array.isArray(body))
    return NextResponse.json({error:"잘못된 요청입니다."},{status:400,headers:noStore});
  const data=body as Record<string,unknown>;
  const token=typeof data.token==="string"?data.token.trim():"";
  const action=typeof data.action==="string"?data.action:"";
  if(!tokenPattern.test(token)||!["lookup","slots","cancel","reschedule"].includes(action))
    return NextResponse.json({error:"예약 관리 링크가 올바르지 않습니다."},{status:400,headers:noStore});

  const db=publicDb();
  if(!db)return NextResponse.json({error:"예약 서버 연결이 필요합니다."},{status:503,headers:noStore});
  let name="",args:Record<string,unknown>={p_token:token};
  if(action==="lookup")name="lookup_customer_booking";
  if(action==="slots"||action==="reschedule"){
    const date=typeof data.date==="string"?data.date:"";
    if(!datePattern.test(date)||Number.isNaN(new Date(date+"T12:00:00+09:00").getTime()))
      return NextResponse.json({error:"날짜를 확인해 주세요."},{status:400,headers:noStore});
    args.p_day=date;
  }
  if(action==="slots")name="customer_manage_slots";
  if(action==="cancel"){name="manage_customer_booking";args.p_action="cancel";}
  if(action==="reschedule"){
    const time=typeof data.time==="string"?data.time:"";
    if(!timePattern.test(time))return NextResponse.json({error:"시간을 확인해 주세요."},{status:400,headers:noStore});
    name="manage_customer_booking";
    args.p_action="reschedule";args.p_time=time;
  }
  const {data:result,error}=await db.rpc(name,args);
  if(error){
    const message=error.message;
    let code="MANAGE_FAILED";
    if(message.includes("INVALID_MANAGEMENT_LINK"))code="NOT_FOUND";
    else if(message.includes("BOOKING_NOT_EDITABLE"))code="NOT_EDITABLE";
    else if(message.includes("EDIT_CUTOFF"))code="TOO_LATE";
    else if(message.includes("SLOT_UNAVAILABLE"))code="SLOT_UNAVAILABLE";
    const msg:Record<string,string>={
      NOT_FOUND:"예약 관리 링크를 찾을 수 없습니다.",
      NOT_EDITABLE:"이미 취소 또는 완료된 예약입니다.",
      TOO_LATE:"방문 1시간 전부터는 온라인 변경·취소가 어렵습니다. 매장에 직접 연락해 주세요.",
      SLOT_UNAVAILABLE:"선택한 시간이 마감됐거나 예약할 수 없습니다.",
      MANAGE_FAILED:"예약을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요."
    };
    return NextResponse.json({error:msg[code],code},{status:code==="NOT_FOUND"?404:code==="MANAGE_FAILED"?500:409,headers:noStore});
  }
  if(action==="lookup"&&result==null)
    return NextResponse.json({error:"예약 관리 링크를 찾을 수 없습니다.",code:"NOT_FOUND"},{status:404,headers:noStore});
  if(["cancel","reschedule"].includes(action) && result?.booking_id){
    after(async()=>{
      await Promise.allSettled([
        processOwnerPushQueue(result.booking_id),
        deliverOwnerEmailJobs(result.booking_id),
        processNotificationQueue(result.booking_id)
      ]);
    });
  }
  return NextResponse.json(action==="slots"?{slots:(result||[]).map((s:{time_label:string;available:boolean})=>({time:s.time_label,available:s.available}))}:{booking:result},{headers:noStore});
}
