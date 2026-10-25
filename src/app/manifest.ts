import type {MetadataRoute} from "next";
export default function manifest():MetadataRoute.Manifest{
  return {
    name:"MECA 정비소 예약 관리",short_name:"MECA",
    description:"정비소 예약 확인, 승인 및 운영 관리",
    start_url:"/dashboard",scope:"/",display:"standalone",
    background_color:"#f5f8f1",theme_color:"#183027",
    icons:[{src:"/icon.svg",sizes:"any",type:"image/svg+xml",purpose:"any"}]
  };
}
