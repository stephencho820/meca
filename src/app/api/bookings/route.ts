import { NextRequest, NextResponse } from "next/server";
import { publicDb } from "@/lib/supabase";
export async function POST(request:NextRequest) {
  let b:Record<string,unknown>;
  try{b=await request.json();}catch{return NextResponse.json({error:"잘못된 요청 형식입니다."},{status:400});}
  const text=(k:string,max:number)=>typeof b[k]==="string"?(b[k] as string).trim().slice(0,max):"";
  const slug=text("shop_slug",60),id=text("service_id",50),day=text("date",10),time=text("time",5),name=text("customer_name",80),phone=text("customer_phone",20).replace(/\D/g,""),vehicle=text("vehicle_model",100),notes=text("notes",500);
  if(!/^[a-z0-9-]{3,60}$/.test(slug)||!/^\d{4}-\d{2}-\d{2}$/.test(day)||!/^\d{2}:\d{2}$/.test(time)||!name||!/^01\d{8,9}$/.test(phone)||!b.privacy_consent||!id) return NextResponse.json({error:"예약 정보를 다시 확인해 주세요."},{status:400});
  const db=publicDb();if(!db)return NextResponse.json({error:"예약 서버가 연결되지 않았습니다."},{status:503});
  const {data,error}=await db.rpc("create_public_booking",{p_shop_slug:slug,p_service_id:id,p_day:day,p_time:time,p_customer_name:name,p_customer_phone:phone,p_vehicle_model:vehicle,p_notes:notes});
  if(error){const message=error.message==="SLOT_UNAVAILABLE"?"이미 마감된 시간입니다. 다른 시간을 선택해 주세요.":error.message==="INVALID_BOOKING"?"예약 정보를 다시 확인해 주세요.":"예약을 처리하지 못했습니다.";return NextResponse.json({error:message},{status:409});}
  return NextResponse.json({booking_id:data},{status:201});
}
