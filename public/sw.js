/* MECA owner mobile Web Push: no personal booking data in the notification. */
self.addEventListener("install",()=>self.skipWaiting());
self.addEventListener("activate",event=>event.waitUntil(self.clients.claim()));
self.addEventListener("push",event=>{
  if(!event.data)return;
  let payload={};
  try{payload=event.data.json()||{};}catch{return;}
  const title=typeof payload.title==="string"?payload.title.slice(0,70):"MECA 예약 알림";
  const body=typeof payload.body==="string"?payload.body.slice(0,180):"새로운 예약 정보가 있습니다.";
  const tag=typeof payload.tag==="string"&&/^[a-zA-Z0-9_-]{1,90}$/.test(payload.tag)
    ?payload.tag:"meca-booking";
  event.waitUntil(self.registration.showNotification(title,{
    body,tag,renotify:true,icon:"/icon.svg",badge:"/icon.svg",
    data:{url:"/dashboard"}
  }));
});
self.addEventListener("notificationclick",event=>{
  event.notification.close();
  event.waitUntil((async()=>{
    const url=new URL("/dashboard",self.location.origin).href;
    const clients=await self.clients.matchAll({type:"window",includeUncontrolled:true});
    const existing=clients.find(client=>{
      try{return new URL(client.url).origin===self.location.origin;}catch{return false;}
    });
    if(existing){await existing.navigate(url);return existing.focus();}
    return self.clients.openWindow(url);
  })());
});
