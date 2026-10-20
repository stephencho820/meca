import type { Booking, Service, Shop, TimeSlot } from "./types";
export const demoShop: Shop = {
  id: "demo-shop", name: "메카 모터스", slug: "demo-garage", category: "자동차 정비",
  phone: "02-0000-0000", address: "서울특별시 강남구 테헤란로 (데모 매장)",
  description: "믿고 맡기는 우리 동네 정비 파트너", primary_color: "#b6ef5b", slot_capacity: 2
};
export const demoServices: Service[] = [
  { id: "demo-oil", name: "엔진오일 교환", description: "차량에 맞는 엔진오일과 필터 교환", duration_minutes: 60, price_from: 65000, icon: "🛢️" },
  { id: "demo-tire", name: "타이어 점검 / 교체", description: "마모도 점검 및 타이어 교환", duration_minutes: 60, price_from: 40000, icon: "🛞" },
  { id: "demo-brake", name: "브레이크 점검", description: "브레이크 패드, 디스크 및 제동 성능 점검", duration_minutes: 90, price_from: 40000, icon: "🔧" },
  { id: "demo-diagnosis", name: "고장 진단 / 일반 정비", description: "이상 증상 상담 및 차량 정밀 점검", duration_minutes: 60, price_from: null, icon: "🚘", approval_required: true },
  { id: "demo-battery", name: "배터리 점검 / 교체", description: "배터리 상태 점검과 교체", duration_minutes: 40, price_from: 20000, icon: "🔋" },
  { id: "demo-others", name: "기타 정비 상담", description: "기타 정비 및 수리 관련 문의", duration_minutes: 60, price_from: null, icon: "💬", approval_required: true }
];
export function kstDate(date: Date): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
export function getDays(count = 14) {
  const base = kstDate(new Date());
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(base + "T12:00:00+09:00");
    d.setUTCDate(d.getUTCDate() + i);
    return { iso: kstDate(d), date: d, dayName: new Intl.DateTimeFormat("ko-KR", { weekday: "short", timeZone: "Asia/Seoul" }).format(d), label: new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric", timeZone: "Asia/Seoul" }).format(d) };
  });
}
export function demoSlots(day: string, service: Service = demoServices[0]): TimeSlot[] {
  const weekday = new Date(day + "T12:00:00+09:00").getUTCDay();
  if (weekday === 0) return [];
  const slots = ["09:00","09:30","10:00","10:30","11:00","11:30","13:00","13:30","14:00","14:30","15:00","15:30","16:00","16:30","17:00"];
  const now = Date.now();
  const existing = demoBookings().filter(b => b.status === "pending" || b.status === "confirmed");
  const capacity = demoShop.slot_capacity || 1;
  return slots.map(time => {
    const start = new Date(day+"T"+time+":00+09:00").getTime();
    const end = start + service.duration_minutes * 60_000;
    const boundaries = [start, ...existing.map(b => new Date(b.starts_at).getTime())
      .filter(t => t > start && t < end)];
    const available = start > now+60*60*1000 && boundaries.every(t =>
      existing.filter(b =>
        new Date(b.starts_at).getTime() <= t && new Date(b.ends_at).getTime() > t
      ).length < capacity
    );
    return {time, available};
  });
}
const DEMO_KEY = "meca-demo-bookings";
export function demoBookings(): Booking[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(DEMO_KEY) || "[]") as Booking[]; } catch { return []; }
}
export function addDemoBooking(booking: Booking) {
  localStorage.setItem(DEMO_KEY, JSON.stringify([booking, ...demoBookings()]));
}
export function updateDemoBooking(id: string, status: Booking["status"]) {
  localStorage.setItem(DEMO_KEY, JSON.stringify(demoBookings().map(b => b.id === id ? { ...b, status } : b)));
}
export function money(n: number | null | undefined) {
  return n == null ? "상담 후 안내" : n.toLocaleString("ko-KR") + "원부터";
}
export function phoneFormat(value: string) {
  const v = value.replace(/[^0-9]/g, "").slice(0, 11);
  if (v.length < 4) return v;
  if (v.length <= 7) return v.replace(/^(\d{3})(\d+)/, "$1-$2");
  return v.replace(/^(\d{3})(\d{3,4})(\d{4})$/, "$1-$2-$3");
}
