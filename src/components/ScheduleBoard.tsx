"use client";
import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3 } from "lucide-react";
import { kstDate } from "@/lib/demo";
import type { Booking } from "@/lib/types";

type Mode="day"|"week"|"month";
const days=["일","월","화","수","목","금","토"];
const pad=(n:number)=>String(n).padStart(2,"0");
const parse=(day:string)=>new Date(day+"T12:00:00+09:00");
const add=(day:string,count:number)=>{
  const d=parse(day);d.setUTCDate(d.getUTCDate()+count);return kstDate(d);
};
const weekday=(day:string)=>parse(day).getUTCDay();
const time=(iso:string)=>new Intl.DateTimeFormat("ko-KR",{timeZone:"Asia/Seoul",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date(iso));
const localMinutes=(iso:string)=>{
  const t=time(iso).split(":").map(Number);return t[0]*60+t[1];
};
const workText:Record<string,string>={scheduled:"예약",checked_in:"입고",working:"정비 중",ready:"출고 대기",handed_over:"출고"};
function dayEvents(day:string,bookings:Booking[]){
  const scheduled=bookings.filter(b=>b.status!=="cancelled"&&kstDate(new Date(b.starts_at))===day)
    .sort((a,b)=>a.starts_at.localeCompare(b.starts_at));
  const lanes:number[]=[];
  const items=scheduled.map(b=>{
    const start=Math.max(480,localMinutes(b.starts_at));
    const end=Math.min(1200,localMinutes(b.ends_at));
    let lane=lanes.findIndex(until=>until<=start);
    if(lane===-1){lane=lanes.length;lanes.push(end);}
    else lanes[lane]=end;
    return {booking:b,start,end,lane};
  });
  return {items,lanes:Math.max(1,lanes.length)};
}
export default function ScheduleBoard({
  bookings,onSelect
}: {bookings:Booking[];onSelect:(booking:Booking)=>void}){
  const [mode,setMode]=useState<Mode>("day");
  const [day,setDay]=useState(()=>kstDate(new Date()));
  const monday=useMemo(()=>add(day,-((weekday(day)+6)%7)),[day]);
  const week=useMemo(()=>Array.from({length:7},(_,i)=>add(monday,i)),[monday]);
  const month=day.slice(0,7);
  const monthStart=month+"-01";
  const firstDay=weekday(monthStart);
  const count=new Date(Number(month.slice(0,4)),Number(month.slice(5,7)),0).getDate();
  const items=Array.from({length:firstDay},()=>null as string|null)
    .concat(Array.from({length:count},(_,i)=>month+"-"+pad(i+1)));
  const columns=mode==="day"?[day]:week;
  const prevNext=(delta:number)=>{
    if(mode==="month"){
      const d=parse(monthStart);d.setUTCMonth(d.getUTCMonth()+delta);
      setDay(kstDate(d));return;
    }
    setDay(add(day,delta*(mode==="week"?7:1)));
  };
  return <div className="dash-panel schedule-panel">
    <div className="schedule-toolbar">
      <div><span className="eyebrow">WORKSHOP SCHEDULE</span><h3 style={{margin:"7px 0 4px"}}>
        {mode==="month"?month.replace("-","년 ")+"월":mode==="week"?monday+" ~ "+add(monday,6):day}
      </h3><p className="booking-help" style={{margin:"3px 0"}}>시간별 예약을 선택하면 고객 정보와 정비 진행 상황을 수정할 수 있어요.</p></div>
      <div className="schedule-controls">
        <div className="schedule-switch" role="group" aria-label="캘린더 보기">
          {([["day","일간"],["week","주간"],["month","월간"]] as const).map(([id,label])=>
            <button key={id} type="button" aria-pressed={mode===id} className={mode===id?"selected":""} onClick={()=>setMode(id)}>{label}</button>)}
        </div>
        <button className="btn btn-outline" type="button" onClick={()=>setDay(kstDate(new Date()))}>오늘</button>
        <button className="btn btn-outline" aria-label="이전 기간" type="button" onClick={()=>prevNext(-1)}><ChevronLeft size={17}/></button>
        <button className="btn btn-outline" aria-label="다음 기간" type="button" onClick={()=>prevNext(1)}><ChevronRight size={17}/></button>
      </div>
    </div>
    {mode==="month"?<div className="calendar-grid schedule-month">
      {days.map(d=><div key={d} className="schedule-month-heading">{d}</div>)}
      {items.map((d,i)=>{
        const list=bookings.filter(b=>d&&b.status!=="cancelled"&&kstDate(new Date(b.starts_at))===d);
        return <button type="button" key={i} className={"cal-cell schedule-month-cell"+(d===kstDate(new Date())?" today":"")} disabled={!d}
          onClick={()=>{if(d){setDay(d);setMode("day");}}}>
          <strong>{d?Number(d.slice(-2)):""}</strong>
          {list.slice(0,3).map(b=><div key={b.id} className="cal-item">{time(b.starts_at)} {b.customer_name}</div>)}
          {list.length>3&&<small>+{list.length-3}건</small>}
        </button>;
      })}
    </div>:<div className="schedule-overflow">
      <div className={"schedule-board"+(mode==="week"?" is-week":" is-day")}>
        <div className="schedule-left">
          <div className="schedule-dayhead"><Clock3 size={16}/></div>
          <div className="schedule-time-axis">{Array.from({length:13},(_,h)=><div key={h} className="schedule-hour" style={{top:h*60}}>{pad(h+8)}:00</div>)}</div>
        </div>
        {columns.map(d=>{
          const {items:events,lanes}=dayEvents(d,bookings);
          return <div key={d} className="schedule-day">
            <button className={"schedule-dayhead"+(d===kstDate(new Date())?" current":"")} type="button"
              onClick={()=>{setDay(d);setMode("day");}}>{days[weekday(d)]} · {d.slice(5)}</button>
            <div className="schedule-track">
              {Array.from({length:13},(_,h)=><span key={h} className="schedule-line" style={{top:h*60}}/>)}
              {events.map(({booking:b,start,end,lane})=><button type="button" key={b.id}
                className={"schedule-event "+b.status}
                title={b.customer_name+" · "+b.service_name}
                style={{top:Math.max(0,start-480)+2,height:Math.max(34,end-start-4),
                  left:`calc(${lane/lanes*100}% + 3px)`,
                  width:`calc(${100/lanes}% - 6px)`}}
                onClick={()=>onSelect(b)}>
                <strong>{time(b.starts_at)} {b.customer_name}</strong>
                <span>{b.service_name}</span><small>{workText[b.work_stage||"scheduled"]}</small>
              </button>)}
              {events.length===0&&<span className="schedule-empty">예약 없음</span>}
            </div>
          </div>;
        })}
      </div>
    </div>}
    <p style={{fontSize:12,color:"#7a897b",marginTop:17}}><CalendarDays size={14} style={{verticalAlign:"middle",marginRight:5}}/>일간·주간은 오전 8시부터 오후 8시까지 표시합니다. 다른 시간의 예약은 예약 목록에서 볼 수 있어요.</p>
  </div>;
}
