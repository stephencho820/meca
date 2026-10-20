# MECA 메카

**정비소의 예약은 쉽게, 운영은 스마트하게.**

한국형 정비소 예약/운영 SaaS. Avenue2(현 Avenue)의 제품 흐름을 **벤치마킹**했지만 MECA만의 브랜드, UI와 구현으로 제작했습니다. Avenue의 로고·사진·문구·소스코드는 사용하지 않았습니다.

## 구현 내용

- **랜딩 페이지** — 반응형 히어로, 예약 체험, 주요 기능, 요금제, FAQ
- **실제 동작하는 고객 예약 플로우** — 정비 항목 → 14일 날짜/실시간 가능 시간 → 연락처/차량 정보 → 예약 접수
- **매장 관리자** — 요약 대시보드, 월별 예약 캘린더, 예약 승인/취소/완료, 전화·방문 예약 추가, 고객 목록, 정비 항목·가격·시간 설정, 매장 정보
- **계정과 테넌트 분리** — Supabase Auth, 매장 소유권 기반 Row Level Security
- **중복 예약 방지** — 서버 측 SQL RPC에서 작업 시간·영업시간·동시 수용 인원 확인, 트랜잭션 advisory lock
- **데모 모드** — Supabase 연결 전에도 실제로 클릭하며 테스트 가능 (브라우저 localStorage 전용)

## 바로 체험하기

- `/` — MECA 랜딩
- `/demo` 또는 `/book/demo-garage` — 고객 예약 데모
- `/dashboard?demo=1` — 사장님 관리자 데모 (위 예약 데모와 localStorage 공유)
- `/start` — 신규 매장 가입, `/login` — 로그인
- `/book/[slug]` — 매장별 실제 예약 URL (Supabase 환경 설정 필요)

**주의:** 데모 예약은 실제 정비소로 전달되지 않습니다. 실서비스 예약을 받으려면 전용 Supabase 프로젝트를 연결해야 합니다.

## 로컬 실행

요구 사항: Node.js 20.9+.

```bash
npm install
cp .env.example .env.local
npm run dev
```

접속: http://localhost:3000

## Supabase 연결

1. MECA **전용 Supabase 프로젝트**를 생성합니다. 기존 운영 중인 다른 서비스의 Supabase 프로젝트와 DB를 공유하지 않는 것을 권장합니다.
2. `supabase/migrations/20261020000000_initial_meca.sql`을 새 프로젝트의 SQL Editor에서 실행합니다. **운영 중인 DB에서는 실행하지 마세요.**
3. Supabase **Project URL** 및 **anon/publishable key**를 `.env.local`과 Vercel 프로젝트 환경 변수의 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`에 추가합니다.
4. Supabase Auth 이메일 로그인을 활성화하고 Site URL 및 Redirect URLs에 배포 도메인과 `/dashboard`를 추가합니다.
5. `/start`에서 가입 후 메일 인증을 완료하고 로그인하면 매장과 기본 정비 항목·영업시간이 자동으로 생성됩니다.

**보안:** 서비스 롤 키는 사용하지 않습니다. 공개 예약은 제한된 DB RPC를 통해서만 생성하며 고객 예약 정보는 해당 매장의 인증된 소유주만 조회합니다. 단, 실제 서비스 전 API rate limit/CAPTCHA, 개인정보 처리방침, 보관·파기 주기와 로그 감사, 운영 장애 모니터링을 추가해야 합니다.

## 알려진 범위와 후속 개발

| 항목 | 현재 상태 |
|---|---|
| 한국어 고객 예약 및 관리자 | 구현 |
| 온라인 실시간 예약 슬롯/수용량 | Supabase 스키마 적용 후 구현 |
| 고객 정보 보호와 매장 분리 | RLS 스키마 제공 |
| 사업장 영업시간/휴무일 | DB에 기본값과 차단 날짜 제공. 관리자 편집 UI는 차기 범위 |
| 카카오 알림톡·SMS | **미연동** (실제 발송하지 않음) |
| AI 전화 상담원 | **미연동** |
| Toss 결제/구독 과금 | **미연동** |
| 네이버·카카오 지도/예약 연동 | **미연동** |
| 운영 배포·실정비소 검증 | 별도 확인 필요 |

Pricing은 검증 전 가설이며 결제 기능이 연결되지 않았습니다. 실매장 사용 전 개인정보 처리, 통신 수신동의 및 메시징 약관 검토가 필요합니다.

## 기술 스택

Next.js 15 App Router, React 19, TypeScript, Lucide Icons, vanilla CSS, Supabase Auth/Postgres + RLS/RPC. 배포는 Vercel 권장.

## 주요 파일

- `src/components/Landing.tsx` — 마케팅 페이지
- `src/components/BookingFlow.tsx` — 고객 예약 마법사
- `src/app/dashboard/page.tsx` — 통합 매장 관리자
- `src/app/api/` — 예약과 예약 가능 시간 API
- `supabase/migrations/` — DB 테이블·정책·예약 RPC
