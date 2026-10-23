import {test,expect} from "@playwright/test";

test("expired confirmation link offers login and safe resend without signing up again",async({page})=>{
 await page.goto("/auth/callback?error=access_denied&error_code=otp_expired");
 await expect(page.getByRole("link",{name:"이메일로 로그인"})).toBeVisible();
 await expect(page.getByRole("button",{name:"인증 메일 다시 보내기"})).toBeVisible();
 await expect(page.getByPlaceholder("회원가입에 사용한 이메일")).toBeVisible();
 await expect(page.getByText("인증을 이미 완료했다면 다시 가입하지 말고")).toBeVisible();
});

test("signup and login pages keep recovery options without revealing accounts",async({page})=>{
 await page.goto("/start?name=MECA-%EC%82%AC%EC%9E%A5%EB%8B%98-%EC%B2%B4%ED%97%98&pilot=owner-test");
 await expect(page.getByRole("heading",{name:/우리 가게 예약/})).toBeVisible();
 await expect(page.getByRole("button",{name:"무료 계정 만들기"})).toBeVisible();
 await page.goto("/login");
 await expect(page.getByRole("button",{name:"로그인"})).toBeVisible();
 await expect(page.getByRole("link",{name:"무료로 시작하기"})).toBeVisible();
});
