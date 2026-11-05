# MECA Phase 16 — 플랫폼 운영자 콘솔

## 적용 범위

- 운영자 전용 `/admin`에서 정비소(최근 250개), 사장님 가입 이메일, 누적 예약·승인 대기 건수, 파일럿 기간을 조회합니다.
- 고객 전화번호, 고객 이름, 차량 정보, 내부 정비 메모는 운영자 RPC에 포함하지 않습니다.
- 정비소 **운영 중지**: `platform_suspended=true`, `is_active=false`; 신규 고객 온라인 예약을 차단합니다. 기존 예약, 고객 및 정비 기록은 삭제하지 않습니다.
- **중지 해제**: `platform_suspended=false`로만 변경합니다. `is_active`는 자동으로 켜지지 않으며 정비소 사장님의 재확인이 필요합니다.
- 운영 조치 사유(5~240자)와 행위자·시각은 비공개 감사 테이블에 기록합니다.
- 사장님은 운영자용 RPC를 실행할 수 없고, `shops`를 직접 수정하여 플랫폼 중지를 되돌릴 수 없습니다. 중지된 계정의 매장 삭제·재생성도 차단합니다.
- 운영자 권한을 가진 계정은 로그인 후 `/admin`으로 이동합니다.

## 운영 환경 설정 (기존 데이터 보존)

1. GitHub PR의 DB 및 CI 검증을 확인합니다. Supabase 프로젝트가 **MECA 전용**인지 확인합니다.
2. `supabase/migrations/20261105000000_phase16_platform_admin.sql`을 MECA 프로젝트에 적용합니다. **기존 운영 DB의 다른 프로젝트에 실행하지 마세요.**
3. 운영자 전용 Supabase Auth 계정을 생성하고 이메일 인증을 완료합니다. 고객·정비소 사장님 계정과 분리하는 것을 권장합니다.
4. Supabase SQL Editor의 권한 있는 세션으로 아래 명령을 실행합니다. `<...>` 자리에는 **Supabase Authentication → Users에서 직접 확인한 실제 UUID**를 입력합니다. SQL을 그대로 GitHub에 커밋하지 마세요.

```sql
-- 인증된 운영자 계정인지 먼저 확인 (UUID를 실제 값으로 대체).
select id, email, email_confirmed_at
from auth.users
where id = '<VERIFIED_AUTH_USER_UUID>'::uuid;

-- 일치하는 사용자 이메일과 인증 상태를 검증한 후 실행.
insert into meca_private.platform_operators (user_id, note)
select id, 'Primary MECA operator'
from auth.users
where id = '<VERIFIED_AUTH_USER_UUID>'::uuid
  and email_confirmed_at is not null
on conflict (user_id) do nothing;
```

5. `/login`으로 로그인해 `/admin`으로 자동 이동하는지 확인합니다.
6. 테스트 정비소의 운영 중지 → 고객 예약 차단 → 중지 해제 → 사장님 재공개 순으로 **실제 운영과 분리된 테스트 매장**에서 검증합니다.
7. 운영자 권한 철회 시 권한 있는 SQL Editor에서 해당 `user_id`의 `platform_operators` 행을 삭제합니다. 고위험 계정은 별도로 인증 세션도 종료하세요.

> 운영자 여부는 사용자 수정이 가능한 `user_metadata` 또는 클라이언트 변수로 결정하지 않습니다. 비공개 DB 테이블을 통한 서버 검증만 허용합니다. 운영자 역할을 웹 UI에서 직접 발급하는 기능은 제공하지 않습니다.

## 파일과 테스트

- `src/app/admin/page.tsx` + `admin.css`: 운영자 웹 UI.
- `public.meca_is_operator()`: 현재 세션의 역할 여부 확인.
- `public.meca_admin_shops()`: 최소한의 정비소 운영 통계만 반환.
- `public.meca_admin_shop_audit()`: 최신 100건 운영 조치 내역.
- `public.meca_admin_set_shop_suspension(shop, suspend, reason)`: 관리자 인증·상태 변경.
- `meca_private.guard_platform_shop()`: 직접 수정/재활성화/삭제 방지 및 감사 로그.
- `tests/phase16-platform-admin.sql`: 권한 분리, 중지·해제, 이력 및 우회 방지 회귀 테스트.
- `.github/workflows/ci.yml`: PostgreSQL 17 테스트 적용.

## 제약 및 다음 단계

- Phase 16에서는 새로운 사장님 가입을 중앙 승인제로 바꾸지 않습니다. 현재 가입 정책은 유지되며, 다른 이메일로 재가입하는 우회는 이후 Phase 17의 정비소 실명/사업자 검증·가입 승인 정책으로 다룹니다.
- 운영자 화면은 현재 상위 250개 정비소와 최근 100개 조치만 표시합니다. 업체 수 증가 시 서버 페이지네이션과 날짜 필터를 추가합니다.
- 정비소 관리자가 이미 갖고 있는 계정 권한을 임의로 확장하지 않습니다. 고객 개인정보와 예약 메모에 대한 운영자 접근은 별도 동의와 감사 정책이 필요한 후속 과제입니다.
- 본 단계는 결제, SMS/알림톡 발송, 자동 파일럿 종료, 고객 데이터 삭제를 실행하지 않습니다.
