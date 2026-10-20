import Link from "next/link";
import BookingFlow from "@/components/BookingFlow";
import { LayoutDashboard, Wrench } from "lucide-react";
export default function DemoPage() {
  return <div className="booking-page"><div className="container row-between" style={{maxWidth:900,marginBottom:30}}><Link href="/" className="logo"><span className="logo-icon"><Wrench size={20}/></span> meca.</Link><Link className="btn btn-outline" href="/dashboard?demo=1"><LayoutDashboard size={17}/> 관리자 데모</Link></div><div className="booking-shell"><BookingFlow slug="demo-garage"/></div></div>;
}
