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
- `/manage` — 고객 예약 관리 링크로 조회·변경·취소 (본인만 보관)
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
4. Supabase Auth 이메일 로그인을 활성화하고 Site URL을 서비스 도메인으로 설정합니다. Redirect URL 허용 목록에 `/auth/callback`, `/dashboard`, `/auth/confirm`을 추가합니다.
5. `/start`에서 가입하면 매장 이름이 가입 사용자 metadata에도 안전하게 저장됩니다(접근 권한 판단에는 사용하지 않음). 기본 인증 링크를 통해 `/auth/callback`에서 세션이 만들어지고, `/dashboard`에 처음 로그인하면 매장과 기본 정비 항목·영업시간이 생성됩니다.

**보안:** 서비스 롤 키는 사용하지 않습니다. 공개 예약은 제한된 DB RPC를 통해서만 생성하며 고객 예약 정보는 해당 매장의 인증된 소유주만 조회합니다. 단, 실제 서비스 전 API rate limit/CAPTCHA, 개인정보 처리방침, 보관·파기 주기와 로그 감사, 운영 장애 모니터링을 추가해야 합니다.

## 이메일 인증 구현

기본 Supabase 이메일 템플릿(`{{ .ConfirmationURL }}`)을 유지하면 가입 시 `emailRedirectTo`가 `/auth/callback`으로 지정되어, 인증 후 브라우저에서 세션을 확정합니다. 가입했던 브라우저에서 인증하는 것이 가장 확실합니다.

더 안정적인 **다른 기기/브라우저 인증**을 원한다면 Supabase 대시보드의 `Authentication → Email Templates → Confirm signup`에서 버튼 링크를 다음과 같이 변경할 수 있습니다.

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">이메일 인증하기</a>
```

`/auth/confirm`은 서버에서 해시 토큰을 검증하고 세션 쿠키를 생성합니다. 사이트 URL은 MECA 도메인으로 지정되어야 합니다. Supabase 기본 SMTP는 발송량 제한이 있으므로 정식 운영 전 전용 SMTP, 이용약관/개인정보 동의와 발송 테스트가 필요합니다.

## 예약 처리 및 동시성 (Phase 2)

- Supabase가 연결된 실제 정비소 예약은 `bookings` 테이블에 저장됩니다.
- 고객 예약과 사장님이 수기로 추가한 전화·방문 예약은 **DB 트리거에서 동일한 수용량 검사**를 거칩니다.
- 동시 예약 수용량은 **실제 시간대별 동시 작업 개수**를 확인합니다. 단순히 겹치는 예약 총개수를 세지 않으므로 순차 작업 사이의 빈 시간을 과도하게 막지 않습니다.
- 승인 대기/확정은 시간을 점유하고 취소/완료는 점유하지 않습니다. 완료/취소 후 다시 확정할 때도 충돌 검사를 실행합니다.
- 영업시간 및 지정 휴무일은 고객 예약과 수기 예약 모두 적용됩니다.
- 관리자 대시보드는 Supabase Realtime (RLS 적용)으로 자동 갱신하며, 연결이 끊겼을 때를 대비해 20초 간격·탭 복귀 시 예약 목록을 동기화합니다.
- 예약 시 선택 시간이 다른 고객에 의해 선점되면 `409 SLOT_UNAVAILABLE`을 반환하고 고객을 시간 선택 단계로 안내합니다.
- GitHub Actions의 `tests/phase2-smoke.sql`은 순차 작업, 중복 예약, 관리자 수기 예약 충돌, 영업일 차단을 검사합니다.
- 배포 환경에서 직접 결제, SMS, 알림톡이 전송되는 것은 아닙니다. 실제 고객에게 공개하기 전에 별도 rate limit/CAPTCHA·개인정보 처리방침·삭제 정책이 필요합니다.

## 고객 예약 관리 — Phase 3

- 새 고객 예약 완료 시 256비트 비밀 예약 관리 링크를 **한 번만** 발급합니다. 링크는 `/manage#token=...` 형태로 공유하며, URL 프래그먼트의 비밀값은 웹서버 접근 로그와 Referer에 포함되지 않습니다.
- DB에는 SHA-256 토큰 해시만 저장합니다. 고객의 휴대전화 번호와 예약번호만으로는 개인정보를 조회할 수 없습니다.
- `/manage`에서 예약 상태 조회, 방문 1시간 전까지 일정 변경/취소가 가능합니다. 일정 변경 시 영업시간, 휴무일 및 정비소 수용량을 재검증합니다.
- 이미 취소/완료한 예약은 고객이 변경하지 못합니다. 예약 내역은 링크 소지자에게만 보이며 전화번호는 끝 네 자리만 표시합니다.
- 관리 링크를 잃어버린 고객은 정비소에 직접 문의해야 합니다. 휴대전화 번호만으로 조회하도록 만들지 않은 이유는 **SMS OTP 인증이 아직 연결되지 않았기 때문**입니다. 이후 카카오/SMS 인증 연동 시 휴대전화 번호 기반 안전한 조회를 추가할 수 있습니다.
- 기존 구버전 예약은 관리용 토큰이 없어 정비소 관리자 화면에서 관리합니다.
- 예약 관리 링크는 사용자가 안전하게 보관해야 합니다. 문자/이메일 자동 발송은 아직 연결되지 않았습니다.

## 카카오 알림톡 (Phase 4)

- **SOLAPI** API를 사용하는 서버측 어댑터를 추가했습니다. 카카오 비즈니스 채널 및 심사 통과한 알림톡 템플릿이 필요합니다.
- 예약 이벤트 `requested`, `confirmed`, `rescheduled`, `cancelled`는 DB 트리거가 생성하며, `notification_outbox` 테이블에 개인정보를 중복 저장하지 않습니다.
- 발송은 `MECA_NOTIFICATIONS_ENABLED=true`로 명시적으로 활성화하고 모든 비밀 키/템플릿을 등록하기 전에는 **절대로 진행되지 않습니다**.
- 예약 시도와 고객 변경·취소 후에는 즉시 처리를 시도하고, 관리자 변경/수기 예약도 처리합니다. 전송 실패 시 예약 자체는 취소되지 않습니다.
- 방문 전날 09시(KST) 부근에는 Vercel Hobby 지원 범위인 **하루 1회** cron이 리마인더를 생성·처리합니다. Hobby Cron은 동일 시각 실행을 보장하지 않아 시간 안내는 대략적입니다.
- 발송 요청에는 광고성 문구를 포함하지 않으며 `disableSms: true`로 설정해 **자동 SMS 대체 발송을 차단**합니다.
- 발송 오류나 네트워크 타임아웃은 불확실한 경우 재발송하지 않아 과금/중복 발송을 방지합니다. `submitted`는 SOLAPI가 **접수**한 상태이지 수신자에게 **전달 완료**된 것을 의미하지 않습니다.
- 관리자 `알림 내역` 탭에서 발송 대기·접수·건너뜀·실패 기록을 조회합니다.
- SOLAPI 템플릿 5개에서 다음 변수를 정확히 사용해야 합니다: `#{매장명}`, `#{고객명}`, `#{예약일시}`, `#{서비스명}`, `#{예약번호}`. 각 템플릿에 필요한 변수만 포함하는 방향으로 실제 승인 내용과 맞춘 후 활성화해야 합니다.
- MECA 전용 Vercel 프로젝트의 서버 환경변수: `SUPABASE_SERVICE_ROLE_KEY`, `SOLAPI_API_KEY`, `SOLAPI_API_SECRET`, `SOLAPI_PF_ID`, `SOLAPI_TEMPLATE_REQUESTED`, `SOLAPI_TEMPLATE_CONFIRMED`, `SOLAPI_TEMPLATE_RESCHEDULED`, `SOLAPI_TEMPLATE_CANCELLED`, `SOLAPI_TEMPLATE_REMINDER`, `MECA_NOTIFICATIONS_ENABLED=true`, `CRON_SECRET`.
- **절대** 서비스 롤 키와 SOLAPI 비밀값을 `NEXT_PUBLIC_`에 넣지 마세요. SOLAPI 자격증명은 Vercel 서버에만 넣고 GitHub에는 저장하지 않습니다.
- SaaS 다중 업체 발송 시에는 업체별 채널 발신인 정책과 템플릿을 따로 관리하도록 확장해야 합니다. 현재는 MECA 중앙 발송 채널 한 곳을 가정합니다.
- 예약 관리 링크는 알림 메시지에 담지 않습니다(토큰은 서버에 해시로만 저장). 고객은 예약 접수 화면의 링크를 보관합니다.

## 알려진 범위와 후속 개발

| 항목 | 현재 상태 |
|---|---|
| 한국어 고객 예약 및 관리자 | 구현 |
| 온라인 실시간 예약 슬롯/수용량 | Phase 2 마이그레이션 적용 후 수용량 검사·실시간 갱신 |
| 고객 정보 보호와 매장 분리 | RLS 스키마 제공 |
| 사업장 영업시간/휴무일 | 매장별 영업시간 및 휴무일을 관리자가 설정 가능 |
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
