import type { WorkResource } from "./types";
const KEY="meca-demo-work-resources";
const initial:WorkResource[]=[
  {id:"demo-tech-1",shop_id:"demo-shop",kind:"technician",name:"정비사 A",active:true},
  {id:"demo-tech-2",shop_id:"demo-shop",kind:"technician",name:"정비사 B",active:true},
  {id:"demo-bay-1",shop_id:"demo-shop",kind:"bay",name:"리프트 1",active:true},
  {id:"demo-bay-2",shop_id:"demo-shop",kind:"bay",name:"리프트 2",active:true}
];
export function readDemoResources():WorkResource[]{
  if(typeof window==="undefined")return initial;
  try{
    const stored=localStorage.getItem(KEY);
    if(!stored)return initial;
    const result=JSON.parse(stored);
    return Array.isArray(result)?result as WorkResource[]:initial;
  }catch{return initial;}
}
export function writeDemoResources(resources:WorkResource[]):void{
  localStorage.setItem(KEY,JSON.stringify(resources));
}
