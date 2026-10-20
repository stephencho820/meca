import BookingFlow from "@/components/BookingFlow";
import Link from "next/link";
import { Wrench } from "lucide-react";
export default async function BookingPage({params}:{params:Promise<{slug:string}>}) {
  const {slug}=await params;
  return <div className="booking-page"><div style={{textAlign:"center",marginBottom:22}}><Link href="/" className="logo"><span className="logo-icon"><Wrench size={19}/></span> meca.</Link></div><main className="booking-shell"><BookingFlow slug={slug}/></main><p style={{textAlign:"center",color:"#8a988d",fontSize:11,marginTop:23}}>MECA — 현장을 이해하는 예약 관리</p></div>;
}
