import { NextResponse } from "next/server";
import { publicDb } from "@/lib/supabase";
export async function GET(_request:Request,{params}:{params:Promise<{slug:string}>}) {
  const {slug}=await params; if(!/^[a-z0-9-]{3,60}$/.test(slug)) return NextResponse.json({error:"올바르지 않은 매장 주소입니다."},{status:400});
  const db=publicDb();if(!db)return NextResponse.json({error:"예약 서버가 아직 연결되지 않았습니다."},{status:503});
  const {data:shop,error}=await db.from("shops").select("id,name,slug,category,phone,address,description,primary_color,slot_capacity,privacy_policy_url").eq("slug",slug).eq("is_active",true).maybeSingle();
  if(error||!shop)return NextResponse.json({error:"예약 가능한 매장을 찾을 수 없습니다."},{status:404});
  const {data:services,error:serviceError}=await db.from("services").select("id,name,description,duration_minutes,price_from,icon,active,sort_order,approval_required").eq("shop_id",shop.id).eq("active",true).order("sort_order");
  if(serviceError)return NextResponse.json({error:"서비스를 불러오지 못했습니다."},{status:500});
  return NextResponse.json({shop,services:services||[]},{headers:{"Cache-Control":"no-store"}});
}
