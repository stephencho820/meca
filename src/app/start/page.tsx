import Onboarding from "@/components/Onboarding";
import Link from "next/link";
import { Wrench } from "lucide-react";
export default function StartPage() {
  return <><header className="navbar"><div className="container nav-inner"><Link href="/" className="logo"><span className="logo-icon"><Wrench size={20}/></span> meca.</Link><Link href="/login" className="btn btn-ghost" style={{marginLeft:"auto"}}>로그인</Link></div></header><div className="auth-layout"><Onboarding/></div></>;
}
