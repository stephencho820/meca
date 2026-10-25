import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "MECA 메카 | 예약은 쉽게, 운영은 스마트하게",
  description: "정비소를 위한 예약·고객관리 플랫폼. 링크 하나로 예약을 받고, 캘린더와 고객을 한곳에서 관리하세요.",
  appleWebApp:{capable:true,title:"MECA",statusBarStyle:"default"},
  openGraph: { title: "MECA | 정비소 운영의 새로운 기준", description: "예약을 놓치지 않는 가장 쉬운 방법", locale: "ko_KR", type: "website" }
};
export default function RootLayout({ children }: Readonly<{children: React.ReactNode}>) {
  return <html lang="ko"><body>{children}</body></html>;
}
