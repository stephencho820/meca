"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, CalendarDays, Check, CheckCircle2, ChevronRight, Clock3, ClipboardList, Headphones, LayoutDashboard, Link2, Menu, MessageCircleMore, PhoneOff, ShieldCheck, Sparkles, TrendingUp, Wrench, X } from "lucide-react";
import BookingFlow from "./BookingFlow";
const features = [
  { icon: CalendarDays, title: "24시간 온라인 예약", body: "영업시간이 끝나도 예약은 계속됩니다. 고객은 실제 가능한 날짜와 시간만 보고 바로 예약할 수 있어요." },
  { icon: LayoutDashboard, title: "한눈에 보는 예약 현황", body: "온라인 예약과 전화·방문 예약을 한 캘린더에서 관리하세요. 더 이상 수첩을 뒤적일 필요가 없습니다." },
  { icon: MessageCircleMore, title: "고객과의 연결", body: "예약 안내, 방문 리마인더, 재방문 메시지까지. 국내 문자·알림톡 연동을 위한 구조로 확장합니다." },
  { icon: Link2, title: "우리 가게만의 예약 링크", body: "별도 홈페이지가 없어도 괜찮아요. 공유 가능한 예약 페이지로 고객을 맞이하세요." },
  { icon: ClipboardList, title: "업무에 맞춘 예약 항목", body: "서비스별 작업 시간, 예상 가격, 예약 승인 방식을 정비소 상황에 맞게 관리할 수 있어요." },
  { icon: TrendingUp, title: "매출 기회를 놓치지 않게", body: "예약·방문·재방문 데이터를 한곳에 모아 운영을 개선할 기반을 만들어 드립니다." }
];
export default function Landing() {
  const [business, setBusiness] = useState("");
  const [showDemo, setShowDemo] = useState(false);
  const [menu, setMenu] = useState(false);
  const start = () => { window.location.href = "/start?name=" + encodeURIComponent(business.trim()); };
  return <>
    <header className="navbar"><div className="container nav-inner">
      <Link href="/" className="logo"><span className="logo-icon"><Wrench size={20}/></span> meca<span style={{color:"#6eaa52"}}>.</span></Link>
      <nav className="nav-links"><a href="#features">서비스 소개</a><a href="#how">이용 방법</a><a href="#pricing">요금제</a><Link href="/demo">데모 체험</Link></nav>
      <div className="nav-actions"><Link className="btn btn-ghost" href="/login">로그인</Link><button className="btn btn-dark" onClick={start}>무료로 시작하기 <ArrowUpRight size={15}/></button><button className="mobile-menu" onClick={()=>setMenu(!menu)} aria-label="메뉴 열기">{menu?<X/>:<Menu/>}</button></div>
    </div>{menu&&<div style={{padding:"12px 20px",background:"#fff",display:"grid",gap:15}}><a href="#features" onClick={()=>setMenu(false)}>서비스 소개</a><a href="#pricing" onClick={()=>setMenu(false)}>요금제</a><Link href="/demo">데모 체험</Link></div>}</header>
    <main>
      <section className="hero"><div className="container hero-grid">
        <div><span className="tag"><Sparkles size={14}/> 우리 가게를 위한 스마트 예약 솔루션</span>
          <h1>정비에만 집중하세요.<br/><em>예약은 메카가</em><br/>챙길게요.</h1>
          <p>전화받느라 작업을 멈추지 마세요.<br/>고객은 편하게 예약하고, 사장님은 한눈에 관리하는<br className="hide-mobile"/> 새로운 정비소 운영 방식.</p>
          <form className="hero-input" onSubmit={e=>{e.preventDefault();start();}}><Wrench size={18} color="#8b998d"/><input aria-label="업체명" value={business} onChange={e=>setBusiness(e.target.value)} placeholder="정비소 이름을 입력해 보세요"/><button className="btn btn-dark" type="submit">예약 페이지 만들기 <ArrowRight size={16}/></button></form>
          <div className="hero-foot"><span><Check size={14}/> 시작은 무료</span><span><Check size={14}/> 카드 등록 없이</span><span><Check size={14}/> 모바일 최적화</span></div>
        </div>
        <div className="hero-visual"><div className="hero-orb"/>
          <div className="preview-floating preview-top"><span className="dot"/> 새로운 예약이 접수됐어요! <strong style={{display:"block",marginTop:5}}>오전 10:30 · 엔진오일 교환</strong></div>
          <div className="preview-card">
            <div className="preview-header"><span className="preview-avatar"><Wrench size={23}/></span><div><strong style={{display:"block",fontSize:16}}>메카 모터스</strong><span className="tiny">간편한 온라인 정비 예약</span></div><CheckCircle2 size={20} color="#5ca36d" style={{marginLeft:"auto"}}/></div>
            <p style={{fontSize:12,color:"#7a877d",fontWeight:700,margin:"23px 0 13px"}}>어떤 정비가 필요하세요?</p>
            {[["🛢️","엔진오일 교환","약 60분"],["🛞","타이어 점검 / 교체","약 60분"],["🔧","브레이크 점검","약 90분"]].map(([emoji,title,time],i)=><div className="preview-service" key={title} style={i===0?{borderColor:"#b5d99d",background:"#f3faee"}:{}}><span className="preview-emoji">{emoji}</span><div><strong style={{display:"block",fontSize:12}}>{title}</strong><span className="tiny">{time}</span></div><ChevronRight size={15} style={{marginLeft:"auto",color:"#8c978d"}}/></div>)}
            <button className="btn btn-dark btn-wide" style={{marginTop:13}} onClick={()=>setShowDemo(true)}>예약 체험하기 <ArrowRight size={15}/></button>
          </div>
          <div className="preview-floating preview-bottom"><div style={{display:"flex",alignItems:"center",gap:8}}><span style={{background:"#edfae1",padding:9,borderRadius:8}}><CalendarDays size={18} color="#378349"/></span><div><strong style={{fontSize:14}}>예약 일정 한눈에</strong><div className="tiny">오늘의 예약 8건</div></div></div></div>
        </div>
      </div></section>
      <div className="category-strip"><div className="container category-row"><span>메카와 함께하는 다양한 현장</span><strong>⚙ 자동차 정비</strong><strong>◉ 타이어 전문점</strong><strong>✧ 디테일링 · 세차</strong><strong>⌁ 각종 수리 서비스</strong></div></div>
      <section className="section" id="features"><div className="container"><div style={{maxWidth:720}}><span className="eyebrow">BUILT FOR YOUR WORKSHOP</span><h2 className="section-title">예약부터 고객관리까지,<br/>더 간편해지는 우리 가게.</h2><p className="section-desc">복잡한 프로그램은 필요 없어요. 메카 하나면 고객의 예약을 받고 정비 일정을 관리할 수 있습니다.</p></div><div className="feature-grid">{features.map(f=><article className="feature-card" key={f.title}><div className="feature-icon"><f.icon size={23}/></div><h3>{f.title}</h3><p>{f.body}</p></article>)}</div></div></section>
      <section className="section-alt section" style={{paddingTop:70,paddingBottom:70}}><div className="container"><div className="dark-band"><div><span className="tag" style={{background:"#294839",borderColor:"#496c4d",color:"#d3ffb7"}}>한눈에 보는 MECA</span><h2>예약을 받는 데 쓰는 시간,<br/>이제 고객을 위해 쓰세요.</h2><p>메카는 바쁜 작업 현장에 맞춰 설계된 간편 예약 도구입니다.<br/>고객은 직접 시간을 고르고, 사장님은 업무 흐름에 집중하세요.</p><Link href="/demo" className="btn btn-lime">직접 체험하기 <ArrowRight size={16}/></Link></div><div className="dark-metric"><CalendarDays color="#c5f48a" size={30}/><strong>24 / 7</strong><span>언제든 접수 가능한 온라인 예약 페이지</span><hr style={{border:0,borderTop:"1px solid #486554",margin:"24px 0"}}/><ShieldCheck color="#c5f48a"/><p style={{fontSize:13,marginBottom:0}}>고객과 가게 데이터는 구분해서 안전하게 관리하도록 설계했습니다.</p></div></div></div></section>
      <section className="section" id="how"><div className="container"><span className="eyebrow">HOW IT WORKS</span><h2 className="section-title">시작도, 사용도 간단하게.</h2><div className="steps">{[["01","우리 가게 등록","가게 이름과 기본 정보를 입력해 예약 페이지를 만드세요."],["02","예약 항목 설정","정비 항목과 작업 시간을 등록하면 고객에게 예약 가능 시간이 표시됩니다."],["03","예약 받고 관리하기","예약 링크를 공유하고 캘린더에서 예약과 고객을 관리하세요."]].map(s=><article className="step" key={s[0]}><span className="step-num">STEP {s[0]}</span><h3>{s[1]}</h3><p>{s[2]}</p></article>)}</div></div></section>
      <section className="section section-alt" id="pricing"><div className="container" style={{textAlign:"center"}}><span className="eyebrow">PRICING</span><h2 className="section-title">우리 가게에 맞는 요금제로.</h2><p className="section-desc">현재 초기 베타 서비스 준비 중이며, 아래 요금은 제안안입니다. 유료 결제는 아직 연결되지 않았습니다.</p><div className="pricing-grid" style={{textAlign:"left"}}>{[
        {title:"Starter",cost:"무료",desc:"예약 도입을 시작하는 가게",items:["전용 예약 페이지","기본 예약 캘린더","기본 고객 목록"],popular:false},
        {title:"Pro",cost:"39,000원",desc:"예약과 고객관리를 함께",items:["Starter 모든 기능","예약·고객 통합 관리","예약 현황 통계","문자·알림톡 연동 예정"],popular:true},
        {title:"AI",cost:"99,000원",desc:"놓치는 전화까지 줄이고 싶다면",items:["Pro 모든 기능","AI 전화 응대 연동 예정","통화 요약 및 예약 안내 예정","사용량별 요금 추후 확정"],popular:false}
      ].map(p=><article key={p.title} className={"price-card"+(p.popular?" highlight":"")}>{p.popular&&<span className="tag" style={{position:"absolute",right:22,top:-18}}>추천</span>}<h3>{p.title}</h3><p className="muted" style={{fontSize:13}}>{p.desc}</p><div className="price">{p.cost}<small>{p.cost==="무료"?"":" / 월"}</small></div><Link href="/start" className={"btn btn-wide "+(p.popular?"btn-dark":"btn-outline")}>시작하기 <ArrowRight size={15}/></Link><ul>{p.items.map(i=><li key={i}><Check size={17}/>{i}</li>)}</ul></article>)}</div></div></section>
      <section className="section"><div className="container"><div style={{maxWidth:810,margin:"0 auto"}}><span className="eyebrow">FAQ</span><h2 className="section-title">자주 묻는 질문</h2><div className="faq-list">{[
        ["별도의 홈페이지가 없어도 사용할 수 있나요?","네. 메카는 각 가게에 고유한 예약 주소를 제공하며, 문자나 SNS 프로필에 링크를 공유할 수 있습니다."],
        ["고객은 회원가입을 해야 하나요?","아니요. 예약 페이지에서 서비스와 시간을 선택한 다음 이름과 연락처를 입력하면 됩니다."],
        ["예약은 무조건 자동 확정되나요?","서비스 항목별로 자동 확정 또는 사장님 승인 후 확정 중 하나를 선택할 수 있게 설계했습니다."],
        ["카카오톡과 AI 전화 상담도 사용 가능한가요?","해당 기능은 한국형 서비스 출시 단계에서 연동할 예정이며, 현재 초기 버전에서는 실제 자동 발송·전화 응대가 동작하지 않습니다."]
      ].map(([q,a])=><details key={q}><summary>{q}</summary><p>{a}</p></details>)}</div></div></div></section>
      <section style={{background:"#dbf5c5",padding:"70px 0",textAlign:"center"}}><div className="container"><h2 className="section-title">우리 가게 예약, 이제 메카로 시작하세요.</h2><p className="section-desc">고객에게는 더 쉬운 예약, 사장님에게는 더 여유로운 하루.</p><Link href="/start" className="btn btn-dark" style={{marginTop:14}}>무료로 시작하기 <ArrowRight size={16}/></Link></div></section>
    </main>
    <footer className="footer"><div className="container"><div className="footer-row"><div><Link href="/" className="logo"><span className="logo-icon"><Wrench size={20}/></span> meca.</Link><p style={{color:"#b4c7bb",fontSize:13,lineHeight:1.9}}>현장을 이해하는 예약 관리.<br/>Made for better workshops.</p></div><div style={{display:"flex",gap:55,fontSize:13}}><div style={{display:"grid",gap:13}}><strong>서비스</strong><a href="#features">주요 기능</a><a href="#pricing">요금제</a><Link href="/demo">예약 데모</Link></div><div style={{display:"grid",gap:13}}><strong>계정</strong><Link href="/login">로그인</Link><Link href="/start">가입하기</Link><Link href="/dashboard?demo=1">관리자 데모</Link></div></div></div><div className="footer-bottom">© 2026 MECA. 본 서비스는 독자적으로 개발된 제품으로 Avenue와 제휴·관련이 없습니다.</div></div></footer>
    {showDemo&&<div className="modal-backdrop" onClick={()=>setShowDemo(false)}><div className="modal-card" onClick={e=>e.stopPropagation()}><button className="modal-close" onClick={()=>setShowDemo(false)} aria-label="닫기"><X size={18}/></button><BookingFlow slug="demo-garage" embedded/></div></div>}
  </>;
}
