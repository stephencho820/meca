import {test,expect} from "@playwright/test";

test("customer multi-service request stays pending until owner approves, then private relookup shows confirmed",async({page})=>{
 test.setTimeout(90_000);
 const customer="승인 흐름 검증고객";
 await page.goto("/demo");
 await page.getByRole("button",{name:/엔진오일 교환/}).click();
 await page.getByRole("button",{name:/브레이크 점검/}).click();
 await page.getByRole("button",{name:/날짜 선택하기/}).click();
 let hasSlot=false;
 for(let i=2;i<12;i++){
   await page.locator(".day-pill").nth(i).click();
   const candidate=page.locator(".time-pill:not([disabled])").first();
   if(await candidate.waitFor({state:"visible",timeout:1500}).then(()=>true).catch(()=>false)){
     await candidate.click();hasSlot=true;break;
   }
 }
 expect(hasSlot).toBe(true);
 await page.getByRole("button",{name:/다음/}).click();
 await page.getByRole("button",{name:/브레이크를 밟으면 소음이 나요/}).click();
 await expect(page.locator("#customer-notes")).toHaveValue(/브레이크를 밟으면 소음이 나요/);
 await page.locator("#customer-name").fill(customer);
 await page.locator("#customer-phone").fill("01032109999");
 await page.locator(".checkbox input").check();
 await page.getByRole("button",{name:/예약 접수하기/}).click();
 await expect(page.getByRole("heading",{name:"예약 요청이 접수됐어요!"})).toBeVisible();
 await page.getByRole("link",{name:/내 예약 확인.*변경하기/}).click();
 await expect(page.locator(".pill.pending")).toHaveText("승인 대기");
 await expect(page.getByText(/엔진오일 교환 \+ 브레이크 점검/)).toBeVisible();

 await page.goto("/dashboard?demo=1");
 await page.getByRole("button",{name:"예약 관리"}).click();
 const row=page.getByRole("row").filter({hasText:customer});
 await expect(row).toBeVisible();
 await expect(row.locator(".pill.pending")).toHaveText("승인 대기");
 await row.getByLabel("예약 상태 변경").selectOption("confirmed");
 await expect(row.locator(".pill.confirmed")).toHaveText("예약 확정");

 // Booking token was opened on the same origin and is retained for this tab.
 // A customer with the private link can revisit without owner credentials.
 await page.goto("/manage");
 await expect(page.locator(".pill.confirmed")).toHaveText("예약 확정");
 await expect(page.getByText(customer)).toBeVisible();
 await expect(page.getByText("****-9999")).toBeVisible();
});
