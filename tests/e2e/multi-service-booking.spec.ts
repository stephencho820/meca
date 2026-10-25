import {test,expect} from "@playwright/test";

test("customer can choose multiple repairs, append symptom and submit for approval",async({page})=>{
 await page.goto("/demo");
 await expect(page.getByRole("heading",{name:"어떤 서비스가 필요하세요?"})).toBeVisible();
 await page.getByRole("button",{name:/엔진오일 교환/}).click();
 await page.getByRole("button",{name:/브레이크 점검/}).click();
 await expect(page.getByText(/2\/5개 선택/)).toBeVisible();
 await page.getByRole("button",{name:/날짜 선택하기/}).click();
 let found=false;
 for(let i=2;i<12;i++){
   await page.locator(".day-pill").nth(i).click();
   await page.waitForTimeout(150); // wait for React availability refresh
   const first=page.locator(".time-pill:not([disabled])").first();
   if(await first.waitFor({state:"visible",timeout:1500}).then(()=>true).catch(()=>false)){
     await first.click();found=true;break;
   }
 }
 expect(found).toBeTruthy();
 await page.getByRole("button",{name:/다음/}).click();
 await expect(page.getByText(/매장 승인 대기/)).toBeVisible();
 await page.getByRole("button",{name:/브레이크를 밟으면 소음이 나요/}).click();
 await expect(page.locator("#customer-notes")).toHaveValue(/브레이크를 밟으면 소음이 나요/);
 await page.locator("#customer-name").fill("복수 정비 테스트");
 await page.locator("#customer-phone").fill("01012345555");
 await page.locator(".checkbox input").check();
 await page.getByRole("button",{name:/예약 접수하기/}).click();
 await expect(page.getByRole("heading",{name:"예약 요청이 접수됐어요!"})).toBeVisible();
 await page.getByRole("link",{name:/내 예약 확인.*변경하기/}).click();
 await expect(page.getByText("승인 대기",{exact:true})).toBeVisible();
 await expect(page.getByText(/엔진오일 교환 \+ 브레이크 점검/)).toBeVisible();
});

test("signup confirmation callback shows recovery action when opened without tokens",async({page})=>{
 await page.goto("/auth/callback");
 await expect(page.getByRole("link",{name:"이메일로 로그인"})).toBeVisible();
});
