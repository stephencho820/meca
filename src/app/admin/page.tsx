"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, ArrowLeft, Ban, CheckCircle2, RefreshCw, Search, ShieldCheck, Store, Wrench } from "lucide-react";
import { browserDb } from "@/lib/supabase";
import "./admin.css";

type ShopRow = {
  shop_id: string;
  shop_name: string;
  slug: string;
  owner_email: string | null;
  is_active: boolean;
  platform_suspended: boolean;
  created_at: string;
  pilot_activated_at: string | null;
  pilot_ends_at: string | null;
  bookings_total: number;
  bookings_pending: number;
  latest_booking_at: string | null;
};

type AuditRow = {
  audit_id: string;
  shop_id: string | null;
  shop_name: string;
  action: "suspended" | "released";
  reason: string;
  operator_email: string | null;
  created_at: string;
};

const dateLabel = (value: string | null) =>
  value ? new Date(value).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" }) : "—";
const dateTimeLabel = (value: string | null) =>
  value ? new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false }) : "—";

function shopStatus(row: ShopRow) {
  if (row.platform_suspended) return { label: "운영 중지", tone: "stopped" };
  if (row.is_active) return { label: "예약 접수 중", tone: "active" };
  return { label: "비공개 / 준비 중", tone: "inactive" };
}

export default function AdminPage() {
  const db = useMemo(() => browserDb(), []);
  const [shops, setShops] = useState<ShopRow[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [ready, setReady] = useState(false);
  const [denied, setDenied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const reload = useCallback(async () => {
    if (!db) throw new Error("Supabase 연결이 필요합니다.");
    const [shopsResponse, auditResponse] = await Promise.all([
      db.rpc("meca_admin_shops"),
      db.rpc("meca_admin_shop_audit"),
    ]);
    if (shopsResponse.error || auditResponse.error) {
      throw new Error("운영 정보를 조회하지 못했습니다. DB 마이그레이션과 관리자 권한을 확인해 주세요.");
    }
    setShops((shopsResponse.data ?? []) as ShopRow[]);
    setAudit((auditResponse.data ?? []) as AuditRow[]);
  }, [db]);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        if (!db) throw new Error("Supabase가 연결되지 않았습니다.");
        const { data: { user }, error: authError } = await db.auth.getUser();
        if (!live) return;
        if (authError || !user) {
          window.location.replace("/login");
          return;
        }
        const { data: allowed, error: roleError } = await db.rpc("meca_is_operator");
        if (!live) return;
        if (roleError) throw new Error("운영자 권한 조회에 실패했습니다. Phase 16 DB 적용 여부를 확인해 주세요.");
        if (!allowed) {
          setDenied(true);
          return;
        }
        await reload();
        if (live) setReady(true);
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : "운영자 페이지를 불러오지 못했습니다.");
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => { live = false; };
  }, [db, reload]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return needle ? shops.filter(row =>
      [row.shop_name, row.slug, row.owner_email ?? ""].some(v => v.toLocaleLowerCase().includes(needle))
    ) : shops;
  }, [shops, query]);
  const selected = shops.find(row => row.shop_id === selectedId) ?? null;
  const totalBookings = shops.reduce((sum, row) => sum + Number(row.bookings_total), 0);
  const totalPending = shops.reduce((sum, row) => sum + Number(row.bookings_pending), 0);
  const activeShops = shops.filter(row => row.is_active && !row.platform_suspended).length;

  async function refresh() {
    setRefreshing(true); setError("");
    try { await reload(); }
    catch (e) { setError(e instanceof Error ? e.message : "새로고침에 실패했습니다."); }
    finally { setRefreshing(false); }
  }

  async function changeSuspension(row: ShopRow) {
    if (!db || busyId) return;
    const note = reason.trim();
    if (note.length < 5 || note.length > 240) {
      setError("조치 사유를 5~240자로 입력해 주세요.");
      return;
    }
    const suspend = !row.platform_suspended;
    const message = suspend
      ? row.shop_name + "의 온라인 예약을 중지하시겠습니까? 기존 예약은 삭제되지 않습니다."
      : row.shop_name + "의 운영 중지를 해제하시겠습니까? 예약 공개는 자동 재개되지 않습니다.";
    if (!window.confirm(message)) return;
    setBusyId(row.shop_id); setError(""); setNotice("");
    try {
      const { error: actionError } = await db.rpc("meca_admin_set_shop_suspension", {
        p_shop_id: row.shop_id, p_suspend: suspend, p_reason: note,
      });
      if (actionError) throw new Error("운영 상태 변경에 실패했습니다. 관리자 권한과 매장 상태를 확인해 주세요.");
      await reload();
      setReason("");
      setNotice(suspend
        ? "정비소 예약 공개를 중지했습니다. 기존 예약과 고객 기록은 유지됩니다."
        : "운영 중지를 해제했습니다. 예약 공개는 사장님이 매장 설정에서 다시 활성화해야 합니다.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "운영 상태 변경에 실패했습니다.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="admin-shell">
      <header className="admin-topbar">
        <Link href="/" className="admin-brand"><Wrench size={20} /> meca. <span>운영자 콘솔</span></Link>
        <Link href="/" className="admin-back"><ArrowLeft size={16} /> 서비스 홈</Link>
      </header>
      <div className="admin-content">
        <div className="admin-heading">
          <div>
            <span className="admin-eyebrow"><ShieldCheck size={16} /> PLATFORM OPERATIONS</span>
            <h1>정비소 운영 관리</h1>
            <p>사장님 계정과 정비소별 예약 현황을 관리하는 MECA 운영자 전용 공간입니다.</p>
          </div>
          {ready && <button type="button" className="btn btn-outline" disabled={refreshing} onClick={refresh}>
            <RefreshCw size={16} /> {refreshing ? "갱신 중" : "새로고침"}
          </button>}
        </div>

        {loading && <div className="admin-state" role="status">운영자 권한을 확인하고 있습니다…</div>}
        {!loading && denied && <div className="admin-state" role="alert">
          <Ban size={28} />
          <h2>운영자 접근 권한이 없습니다.</h2>
          <p>이 페이지는 별도로 승인된 MECA 운영자 계정만 사용할 수 있습니다.</p>
          <Link href="/dashboard" className="btn btn-outline">정비소 대시보드로 이동</Link>
        </div>}
        {error && <div className="admin-message admin-error" role="alert">{error}</div>}
        {notice && <div className="admin-message admin-success" role="status">{notice}</div>}

        {ready && <>
          <section className="admin-stats" aria-label="전체 현황">
            <div className="admin-stat"><span><Store size={17} /> 전체 등록 정비소</span><strong>{shops.length.toLocaleString("ko-KR")}</strong><small>현재 조회 범위: 최근 250개 매장</small></div>
            <div className="admin-stat"><span><CheckCircle2 size={17} /> 예약 접수 중</span><strong>{activeShops.toLocaleString("ko-KR")}</strong><small>운영 중지 매장 제외</small></div>
            <div className="admin-stat"><span><Activity size={17} /> 누적 예약</span><strong>{totalBookings.toLocaleString("ko-KR")}</strong><small>조회된 매장 전체 기준</small></div>
            <div className="admin-stat"><span><ShieldCheck size={17} /> 승인 대기 예약</span><strong>{totalPending.toLocaleString("ko-KR")}</strong><small>사장님 확인 필요</small></div>
          </section>

          <section className="admin-panel" aria-labelledby="admin-shops-title">
            <div className="admin-panel-heading">
              <div><h2 id="admin-shops-title">정비소 목록</h2><p>고객 연락처·차량 기록은 운영자 화면에 제공하지 않습니다.</p></div>
              <label className="admin-search"><Search size={17} /><input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="정비소명, URL, 사장님 이메일" aria-label="정비소 검색" /></label>
            </div>
            <div className="admin-table-scroll">
              <table className="admin-table">
                <thead><tr><th>정비소</th><th>사장님 계정</th><th>예약</th><th>파일럿 종료</th><th>운영 상태</th><th>관리</th></tr></thead>
                <tbody>
                  {filtered.map(row => {
                    const status = shopStatus(row);
                    return <tr key={row.shop_id}>
                      <td><strong>{row.shop_name}</strong><small>/book/{row.slug}</small></td>
                      <td>{row.owner_email ?? "이메일 없음"}</td>
                      <td><strong>{row.bookings_total}</strong><small>승인 대기 {row.bookings_pending}</small></td>
                      <td>{dateLabel(row.pilot_ends_at)}</td>
                      <td><span className={"admin-pill " + status.tone}>{status.label}</span></td>
                      <td><button type="button" className="admin-link" aria-expanded={selectedId === row.shop_id} onClick={() => { setSelectedId(selectedId === row.shop_id ? null : row.shop_id); setReason(""); setError(""); }}>상세 관리</button></td>
                    </tr>;
                  })}
                  {filtered.length === 0 && <tr><td colSpan={6} className="admin-empty">검색 결과가 없습니다.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>

          {selected && <section className="admin-panel admin-detail" aria-labelledby="admin-detail-title">
            <div className="admin-panel-heading">
              <div><span className="admin-eyebrow">SHOP OPERATIONS</span><h2 id="admin-detail-title">{selected.shop_name}</h2></div>
              <button className="btn btn-outline" onClick={() => setSelectedId(null)} type="button">닫기</button>
            </div>
            <div className="admin-detail-grid">
              <div><span>등록일</span><strong>{dateLabel(selected.created_at)}</strong></div>
              <div><span>마지막 예약 접수</span><strong>{dateTimeLabel(selected.latest_booking_at)}</strong></div>
              <div><span>파일럿 시작일</span><strong>{dateLabel(selected.pilot_activated_at)}</strong></div>
              <div><span>파일럿 종료일</span><strong>{dateLabel(selected.pilot_ends_at)}</strong></div>
            </div>
            <div className="admin-action">
              <div><h3>플랫폼 운영 상태</h3><p>운영 중지하면 신규 온라인 예약을 받지 않습니다. 기존 예약은 보관됩니다. 중지 해제 후에도 사장님이 직접 예약 공개를 켜야 합니다.</p></div>
              <div className="admin-action-form">
                <label htmlFor="admin-reason">조치 사유 (필수, 5~240자)</label>
                <input id="admin-reason" className="field" maxLength={240} value={reason} onChange={e => setReason(e.target.value)} placeholder="예: 사장님 요청으로 일시 중지" />
                <button className={"btn " + (selected.platform_suspended ? "btn-outline" : "btn-dark")} disabled={Boolean(busyId) || reason.trim().length < 5} type="button" onClick={() => void changeSuspension(selected)}>
                  {busyId === selected.shop_id ? "처리 중…" : selected.platform_suspended ? "운영 중지 해제" : "운영 중지"}
                </button>
              </div>
            </div>
          </section>}

          <section className="admin-panel" aria-labelledby="admin-audit-title">
            <div className="admin-panel-heading"><div><h2 id="admin-audit-title">운영 조치 기록</h2><p>정비소 중지·해제 이력 (최신 100건)</p></div></div>
            {audit.length === 0
              ? <p className="admin-empty">아직 운영 조치 기록이 없습니다.</p>
              : <div className="admin-audit-list">{audit.map(row => <div key={row.audit_id} className="admin-audit-row">
                  <span className={"admin-pill " + (row.action === "suspended" ? "stopped" : "inactive")}>{row.action === "suspended" ? "운영 중지" : "중지 해제"}</span>
                  <div><strong>{row.shop_name}</strong><p>{row.reason}</p><small>{row.operator_email ?? "운영자"} · {dateTimeLabel(row.created_at)}</small></div>
                </div>)}</div>}
          </section>
        </>}
      </div>
    </main>
  );
}
