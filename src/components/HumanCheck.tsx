"use client";
import {useEffect,useRef,useState} from "react";
import Script from "next/script";

declare global{
 interface Window{
   turnstile?:{
     render:(element:HTMLElement,config:{
       sitekey:string;
       callback:(token:string)=>void;
       "expired-callback":()=>void;
       "error-callback":()=>void;
     })=>string;
     remove:(id:string)=>void;
   };
 }
}
export default function HumanCheck({siteKey,onVerified}:{siteKey:string;onVerified:(token:string)=>void}){
 const container=useRef<HTMLDivElement|null>(null);
 const widget=useRef<string|null>(null);
 const [loaded,setLoaded]=useState(false);
 const [failed,setFailed]=useState(false);
 useEffect(()=>{
   const host=container.current;
   if(!host||!loaded||!window.turnstile)return;
   try{
     const id=window.turnstile.render(host,{
       sitekey:siteKey,
       callback:(token)=>{setFailed(false);onVerified(token);},
       "expired-callback":()=>{onVerified("");},
       "error-callback":()=>{onVerified("");setFailed(true);}
     });
     widget.current=id;
   }catch{setFailed(true);onVerified("");}
   return()=>{
     if(widget.current&&window.turnstile){
       try{window.turnstile.remove(widget.current);}catch{/* widget already removed */}
       widget.current=null;
     }
   };
 },[loaded,siteKey,onVerified]);
 return <div>
   <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
     strategy="afterInteractive" onReady={()=>setLoaded(true)} onError={()=>setFailed(true)}/>
   <div ref={container} aria-label="자동 예약 방지 확인"/>
   {failed&&<p className="error">자동 예약 방지 확인에 문제가 생겼어요. 페이지를 새로고침해 주세요.</p>}
 </div>;
}
