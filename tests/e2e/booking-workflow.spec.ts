import {test,expect} from "@playwright/test";

test("customer demo books, looks up, then cancels using the private link",async({page})=>{
  await page.goto("/demo");
  await expect(page.getByText("메카 모터스")).toBeVisible();
  await page.getByRole("button",{name:/엔진오일 교환/}).click();
  await page.getByRole("button",{name:/날짜 선택하기/}).click();
  let found=false;
  for(let i=2;i<12;i++){
    await page.locator(".day-pill").nth(i).click();
    if(await page.locator(".time-pill:not([disabled])").count()){
      await page.locator(".time-pill:not([disabled])").first().click();
      found=true;break;
    }
  }
  expect(found).toBeTruthy();
  await page.getByRole("button",{name:/다음/}).click();
  await page.locator("#customer-name").fill("테스트 예약자");
  await page.locator("#customer-phone").fill("01012349876");
  await page.locator("#customer-vehicle").fill("테스트 차량");
  await page.locator(".checkbox input").check();
  await page.getByRole("button",{name:/예약 접수하기/}).click();
  await expect(page.getByText("예약 요청이 접수됐어요!",{exact:false})).toBeVisible();
  await page.getByRole("link",{name:/내 예약 확인.*변경하기/}).click();
  await expect(page.getByText("테스트 예약자")).toBeVisible();
  await expect(page.getByRole("button",{name:"예약 취소"})).toBeEnabled();
  page.once("dialog",dialog=>void dialog.accept());
  await page.getByRole("button",{name:"예약 취소"}).click();
  await expect(page.getByText("예약이 취소됐습니다.")).toBeVisible();
  await expect(page.getByText("취소됨")).toBeVisible();
});

test("admin demo can create a technician and navigate its work board",async({page})=>{
  await page.goto("/dashboard?demo=1");
  await page.getByRole("button",{name:/직원·리프트/}).first().click();
  await expect(page.getByText("정비사 · 리프트 관리")).toBeVisible();
  await page.getByPlaceholder("예: 김정비").fill("E2E 테스트 정비사");
  await page.getByRole("button",{name:"등록",exact:true}).click();
  await expect(page.getByText("E2E 테스트 정비사")).toBeVisible();
  await page.getByRole("button",{name:"작업 현황"}).click();
  await expect(page.getByText("정비 작업 현황")).toBeVisible();
  await page.getByRole("button",{name:"개인정보 요청"}).click();
  await expect(page.getByText("개인정보 요청 관리")).toBeVisible();
});
