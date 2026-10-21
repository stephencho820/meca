import { processNotificationQueue } from "@/lib/notifications";
import { NextRequest, NextResponse } from "next/server";
import { publicDb } from "@/lib/supabase";

const validUuid=(s:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
const validDate=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(s+"T00:00:00+09:00").getTime());
export async function POST(request:NextRequest){
  const source=request.headers.get("origin");
  if(source&&source!==request.nextUrl.origin)
    return NextResponse.json({error:"허용되지 않은 요청입니다."},{status:403});
  const contentType=request.headers.get("content-type")||"";
  if(!contentType.toLowerCase().startsWith("application/json"))
    return NextResponse.json({error:"JSON 요청만 지원합니다."},{status:415});
  const length=Number(request.headers.get("content-length")||"0");
  if(length>6000)return NextResponse.json({error:"요청이 너무 큽니다."},{status:413});
  let body:Record<string,unknown>;
  try{
    const raw=await request.text();
    if(raw.length>6000)return NextResponse.json({error:"요청이 너무 큽니다."},{status:413});
    body=JSON.parse(raw);
  }catch{return NextResponse.json({error:"잘못된 요청 형식입니다."},{status:400});}
  if(typeof body!=="object"||body===null||Array.isArray(body))return NextResponse.json({error:"잘못된 요청입니다."},{status:400});
  const value=(k:string,max:number)=>typeof body[k]==="string"?(body[k] as string).trim().slice(0,max):"";
  const shop=value("shop_slug",60),service=value("service_id",64),date=value("date",10),
        time=value("time",5),customer=value("customer_name",80),
        phone=value("customer_phone",20).replace(/\D/g,""),
        vehicle=value("vehicle_model",100),notes=value("notes",500);
  if(!/^[a-z0-9-]{3,60}$/.test(shop)||!validUuid(service)||!validDate(date)
     ||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)||!customer||!/^01\d{8,9}$/.test(phone)
     ||body.privacy_consent!==true)
    return NextResponse.json({error:"예약 정보를 다시 확인해 주세요.",code:"INVALID_BOOKING"},{status:400});

  const db=publicDb();
  if(!db)return NextResponse.json({error:"예약 서버가 연결되지 않았습니다."},{status:503});
  const {data,error}=await db.rpc("create_public_booking_v2",{
    p_shop_slug:shop,p_service_id:service,p_day:date,p_time:time,
    p_customer_name:customer,p_customer_phone:phone,
    p_vehicle_model:vehicle,p_notes:notes
  });
  if(error){
    const code=error.message.includes("BOOKING_RATE_LIMIT")?"RATE_LIMITED":
      error.message.includes("SLOT_UNAVAILABLE")?"SLOT_UNAVAILABLE":
      error.message.includes("INVALID_BOOKING")?"INVALID_BOOKING":"BOOKING_FAILED";
    const message=code==="RATE_LIMITED"?"짧은 시간 동안 예약 요청이 많았습니다. 1시간 후 다시 시도하거나 매장에 문의해 주세요.":
      code==="SLOT_UNAVAILABLE"?"이미 마감된 시간입니다. 다른 시간을 선택해 주세요.":
      code==="INVALID_BOOKING"?"예약 정보를 다시 확인해 주세요.":"예약을 접수하지 못했습니다. 잠시 후 다시 시도해 주세요.";
    return NextResponse.json({error:message,code},{status:code==="RATE_LIMITED"?429:code==="SLOT_UNAVAILABLE"?409:code==="INVALID_BOOKING"?400:500,headers:code==="RATE_LIMITED"?{"Retry-After":"3600","Cache-Control":"no-store"}:{"Cache-Control":"no-store"}});
  }
  // Transactional outbox is already committed by the booking trigger. Sending
  // is best-effort and never makes the successfully created booking fail.
  try{await processNotificationQueue(data.booking_id);}catch{/* outbox retained for operators */}
  return NextResponse.json({booking_id:data.booking_id,manage_token:data.manage_token},
    {status:201,headers:{"Cache-Control":"no-store","Referrer-Policy":"no-referrer"}});
}
