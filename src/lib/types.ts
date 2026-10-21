export type Service = {
  id: string;
  shop_id?: string;
  name: string;
  description?: string | null;
  duration_minutes: number;
  price_from: number | null;
  icon: string;
  active?: boolean;
  sort_order?: number;
  approval_required?: boolean;
};
export type Shop = {
  id: string;
  owner_id?: string;
  name: string;
  slug: string;
  category: string;
  phone: string | null;
  address: string | null;
  description: string | null;
  primary_color?: string;
  is_active?: boolean;
  slot_capacity?: number;
};
export type Booking = {
  id: string;
  shop_id: string;
  service_id: string | null;
  service_name: string;
  customer_id?: string | null;
  assigned_technician_id?: string | null;
  assigned_bay_id?: string | null;
  vehicle_id?: string | null;
  customer_name: string;
  customer_phone: string;
  vehicle_model: string | null;
  notes: string | null;
  starts_at: string;
  ends_at: string;
  status: "pending" | "confirmed" | "completed" | "cancelled";
  source: string;
  created_at?: string;
  updated_at?: string;
  work_stage?: "scheduled" | "checked_in" | "working" | "ready" | "handed_over";
  internal_note?: string | null;
  checked_in_at?: string | null;
  work_started_at?: string | null;
  work_ready_at?: string | null;
  handed_over_at?: string | null;
};
export type PublicShop = { shop: Shop; services: Service[] };
export type TimeSlot = { time: string; available: boolean };

export type WorkResource = {
  id:string;shop_id:string;kind:"technician"|"bay";name:string;active:boolean;created_at?:string;
};
