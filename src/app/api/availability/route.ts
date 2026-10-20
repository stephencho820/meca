import { NextRequest, NextResponse } from "next/server";
import { publicDb } from "@/lib/supabase";
export async function GET(request:NextRequest) {
  const q=request.nextUrl.searchParams;const shop=q.get("shop")||"";const service=q.get("service")||"";const day=q.get("date")||"";
  if(!/^[a-z0-9-]{3,60}$/.test(shop)||!/^\d{4}-\d{2}-\d{2}$/.test(day)||service.length>100||!service) return NextResponse.json({error:"잘못된 요청입니다."},{status:400});
  const db=publicDb();if(!db)return NextResponse.json({error:"예약 서버가 연결되지 않았습니다."},{status:503});
  const {data,error}=await db.rpc("get_available_slots",{p_shop_slug:shop,p_service_id:service,p_day:day});
  if(error)return NextResponse.json({error:"예약 가능 시간을 확인하지 못했습니다."},{status:500});
  return NextResponse.json({slots:(data||[]).map((x:{time_label:string,available:boolean})=>({time:x.time_label,available:x.available}))},{headers:{"Cache-Control":"no-store"}});
}
