import {test,expect} from "@playwright/test";

test("complete end-to-end workshop day: booking, reschedule, assignment, repair, CRM",async({page})=>{
  test.setTimeout(90_000);
  const customer="운영검증 테스트고객";
  await page.goto("/demo");
  await page.getByRole("button",{name:/엔진오일 교환/}).click();
  await page.getByRole("button",{name:/날짜 선택하기/}).click();
  let found=false;
  for(let i=2;i<12;i++){
    await page.locator(".day-pill").nth(i).click();
    const slot=page.locator(".time-pill:not([disabled])").first();
    if(await slot.count()){
      await slot.click();found=true;break;
    }
  }
  expect(found).toBe(true);
  await page.getByRole("button",{name:/다음/}).click();
  await page.locator("#customer-name").fill(customer);
  await page.locator("#customer-phone").fill("01098761234");
  await page.locator("#customer-vehicle").fill("운영검증 시승차");
  await page.locator(".checkbox input").check();
  await page.getByRole("button",{name:/예약 접수하기/}).click();
  await expect(page.getByRole("link",{name:/내 예약 확인.*변경하기/})).toBeVisible();
  await page.getByRole("link",{name:/내 예약 확인.*변경하기/}).click();
  await expect(page.getByText(customer)).toBeVisible();
  await page.getByRole("button",{name:"날짜·시간 변경"}).click();
  let reschedule=false;
  for(let i=3;i<13;i++){
    await page.locator(".day-pill").nth(i).click();
    // The demo computes replacement slots in a React effect after the date
    // rerender. Let the previous grid unmount before selecting a new slot.
    await page.waitForTimeout(120);
    const available=page.locator(".time-pill:not([disabled])").first();
    if(await available.count()){
      await available.click();reschedule=true;break;
    }
  }
  expect(reschedule).toBe(true);
  await page.getByRole("button",{name:"일정 변경 확정"}).click();
  await expect(page.getByText("방문 일정이 변경됐습니다.")).toBeVisible();

  await page.goto("/dashboard?demo=1");
  await page.getByRole("button",{name:"예약 관리"}).click();
  const row=page.getByRole("row").filter({hasText:customer});
  await expect(row).toBeVisible();
  await row.getByRole("button",{name:"상세·수정"}).click();
  const dialog=page.getByRole("dialog",{name:"예약 상세 및 수정"});
  await dialog.getByLabel("담당 정비사 (선택)").selectOption("demo-tech-1");
  await dialog.getByLabel("리프트 / 작업 베이 (선택)").selectOption("demo-bay-1");
  await dialog.getByRole("button",{name:"변경 사항 저장"}).click();
  await expect(dialog).toHaveCount(0);
  await row.getByRole("button",{name:"상세·수정"}).click();
  await expect(dialog.getByLabel("담당 정비사 (선택)")).toHaveValue("demo-tech-1");
  await expect(dialog.getByLabel("리프트 / 작업 베이 (선택)")).toHaveValue("demo-bay-1");

  const advance=async(button:string,next:string)=>{
    await dialog.getByRole("button",{name:button}).click();
    await expect(dialog.getByText("현재 단계:").locator("..")).toContainText(next);
  };
  await advance("차량 입고 처리","차량 입고");
  await advance("정비 진행 처리","정비 진행");
  await advance("출고 대기 처리","출고 대기");
  page.once("dialog",native=>void native.accept());
  await advance("출고 완료 처리","출고 완료");
  await expect(dialog.getByText("정비 완료")).toBeVisible();
  await dialog.getByRole("button",{name:"닫기"}).last().click();

  await page.getByRole("button",{name:"고객 관리"}).click();
  const customerButton=page.getByRole("button").filter({hasText:customer}).first();
  await expect(customerButton).toBeVisible();
  await customerButton.click();
  await expect(page.getByRole("button",{name:/운영검증 시승차 번호판 미등록/})).toBeVisible();
  await expect(page.getByText("정비 완료",{exact:true}).last()).toBeVisible();
});
