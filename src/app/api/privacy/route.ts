import {NextRequest,NextResponse} from "next/server";
import {publicDb} from "@/lib/supabase";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"no-store","Referrer-Policy":"no-referrer"};
export async function POST(req:NextRequest){
  const origin=req.headers.get("origin");
  if(origin&&origin!==req.nextUrl.origin)return NextResponse.json({error:"Unauthorized origin"},{status:403,headers});
  if(!(req.headers.get("content-type")||"").startsWith("application/json"))
    return NextResponse.json({error:"JSON 요청만 가능합니다."},{status:415,headers});
  const len=Number(req.headers.get("content-length")||"0");
  if(len>2100)return NextResponse.json({error:"요청 크기를 확인해 주세요."},{status:413,headers});
  let raw:string;
  try{raw=await req.text();}catch{return NextResponse.json({error:"요청 읽기에 실패했습니다."},{status:400,headers});}
  if(raw.length>2100)return NextResponse.json({error:"요청 크기를 확인해 주세요."},{status:413,headers});
  let data:unknown;
  try{data=JSON.parse(raw);}catch{return NextResponse.json({error:"잘못된 요청입니다."},{status:400,headers});}
  if(!data||typeof data!=="object"||Array.isArray(data))
    return NextResponse.json({error:"잘못된 요청입니다."},{status:400,headers});
  const obj=data as Record<string,unknown>;
  const token=typeof obj.token==="string"?obj.token:"";
  const kind=typeof obj.kind==="string"?obj.kind:"";
  if(!/^[0-9a-f]{64}$/.test(token)||!["access","rectify","erase"].includes(kind))
    return NextResponse.json({error:"예약 관리 링크 또는 요청 종류가 올바르지 않습니다."},{status:400,headers});
  const db=publicDb();
  if(!db)return NextResponse.json({error:"서버 연결이 필요합니다."},{status:503,headers});
  const {data:requestId,error}=await db.rpc("request_booking_privacy_action",{p_token:token,p_kind:kind});
  if(error){
    const limited=error.message.includes("PRIVACY_REQUEST_LIMIT");
    return NextResponse.json({
      error:limited?"요청이 많습니다. 하루 후 다시 시도하거나 정비소에 연락해 주세요.":"요청을 접수하지 못했습니다. 예약 관리 링크를 확인해 주세요."
    },{status:limited?429:400,headers});
  }
  return NextResponse.json({request_id:requestId,message:"요청이 접수되었습니다. 매장 담당자가 확인합니다."},{status:201,headers});
}
