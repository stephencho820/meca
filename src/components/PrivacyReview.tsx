"use client";
import {useCallback,useEffect,useMemo,useState} from "react";
import {ShieldCheck} from "lucide-react";
import {browserDb} from "@/lib/supabase";
import type {Shop} from "@/lib/types";
type RequestRow={
  id:string;booking_id:string;kind:"access"|"rectify"|"erase";
  status:"pending"|"reviewing"|"closed";created_at:string;
  owner_note:string|null;closed_at:string|null
};
const labels:Record<RequestRow["kind"],string>={access:"열람",rectify:"정정",erase:"삭제"};
const statuses:Record<RequestRow["status"],string>={pending:"접수",reviewing:"검토 중",closed:"처리 종료"};
export default function PrivacyReview({shop,isDemo}:{shop:Shop;isDemo:boolean}){
 const db=useMemo(()=>browserDb(),[]);
 const [rows,setRows]=useState<RequestRow[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [busy,setBusy]=useState<string|null>(null);
 const fetchRows=useCallback(async()=>{
   if(isDemo){setRows([]);setLoading(false);return;}
   if(!db){setError("서버 연결을 확인해 주세요.");setLoading(false);return;}
   const {data,error:e}=await db.from("privacy_requests")
      .select("id,booking_id,kind,status,created_at,owner_note,closed_at")
      .eq("shop_id",shop.id).order("created_at",{ascending:false}).limit(200);
   if(e)setError("개인정보 요청을 조회하지 못했습니다.");
   else setRows((data||[]) as RequestRow[]);
   setLoading(false);
 },[db,isDemo,shop.id]);
 useEffect(()=>{void fetchRows();},[fetchRows]);
 async function update(row:RequestRow,next:"reviewing"|"closed"){
   if(!db||isDemo)return;
   if(next==="closed"&&!window.confirm("이 요청에 대한 실무 처리와 법적 보관 요건 확인을 완료했나요? 여기서 닫는 작업은 개인정보를 자동으로 삭제하지 않습니다."))return;
   setBusy(row.id);setError("");setNotice("");
   const {error:e}=await db.from("privacy_requests").update({status:next})
     .eq("shop_id",shop.id).eq("id",row.id).eq("status",row.status);
   if(e)setError("변경하지 못했습니다. 다시 시도해 주세요.");
   else{setNotice(next==="closed"?"요청을 종료했습니다. 데이터는 자동 삭제되지 않았습니다.":"검토 중으로 표시했습니다.");await fetchRows();}
   setBusy(null);
 }
 return <div className="dash-panel">
   <span className="eyebrow">PRIVACY REQUESTS</span><h3>개인정보 요청 관리</h3>
   <p className="booking-help">예약자 본인이 관리 링크로 제출한 열람·정정·삭제 요청을 확인합니다. 삭제 요청이 들어와도 예약·정비 기록은 즉시 삭제되지 않아요. 신원, 법정 보존기간, 증빙 필요 여부를 먼저 확인하고 운영자가 별도로 처리해야 합니다.</p>
   <div className="success" style={{margin:"14px 0",lineHeight:1.8}}>실제 삭제 기능이나 자동 파기 작업은 아직 연결되어 있지 않습니다. ‘처리 종료’는 담당자가 필요한 조치를 직접 수행했음을 확인한 뒤 사용하세요.</div>
   {error&&<div className="error" role="alert">{error}</div>}
   {notice&&<div className="success" role="status">{notice}</div>}
   <button type="button" className="btn btn-outline" onClick={()=>void fetchRows()}>새로고침</button>
   {loading?<p className="dash-empty">요청을 확인하는 중...</p>:rows.length===0?<p className="dash-empty">{isDemo?"체험 모드에는 실제 요청이 없습니다.":"접수된 개인정보 요청이 없습니다."}</p>:
   <div className="table-wrap" style={{marginTop:18}}><table className="data-table"><thead><tr><th>접수일</th><th>요청</th><th>예약 ID</th><th>상태</th><th>처리</th></tr></thead>
   <tbody>{rows.map(row=><tr key={row.id}>
    <td>{new Date(row.created_at).toLocaleString("ko-KR",{timeZone:"Asia/Seoul"})}</td>
    <td>{labels[row.kind]}</td><td title={row.booking_id}>{row.booking_id.slice(0,8).toUpperCase()}</td>
    <td>{statuses[row.status]}</td>
    <td>{row.status==="pending"?<button type="button" className="btn btn-outline" disabled={busy===row.id} onClick={()=>void update(row,"reviewing")}>검토 시작</button>:
        row.status==="reviewing"?<button type="button" className="btn btn-outline" disabled={busy===row.id} onClick={()=>void update(row,"closed")}>처리 종료</button>:"종료"}</td>
   </tr>)}</tbody></table></div>}
   <p className="booking-help" style={{marginTop:17}}><ShieldCheck size={15} style={{verticalAlign:"middle",marginRight:6}}/>개인정보 요청 정보는 해당 정비소 관리 계정에만 표시됩니다.</p>
 </div>;
}
