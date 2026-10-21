import {test,expect} from "@playwright/test";

test("owner test invitation is separate from the real workshop prospect",async({page})=>{
 await page.goto("/pilot/owner-test");
 await expect(page.getByRole("heading",{name:"사장님 역할로 MECA 체험하기"})).toBeVisible();
 await expect(page.getByText("실제 미스터엠과 무관한 연습용 매장",{exact:false})).toBeVisible();
 const signup=page.getByRole("link",{name:"사장님 이메일로 가입"});
 await expect(signup).toHaveAttribute("href",/pilot=owner-test/);
 await page.getByRole("link",{name:"가입 없이 예약·정비 관리 데모 체험하기"}).click();
 await expect(page).toHaveURL(/dashboard\?demo=1/);
 await expect(page.getByText("매장 관리 워크스페이스")).toBeVisible();
});

test("real prospect invitation page remains clearly unclaimed",async({page})=>{
 await page.goto("/pilot/misterm");
 await expect(page.getByText("미스터엠 대상 제안용 준비 페이지",{exact:false})).toBeVisible();
 await expect(page.getByRole("heading",{name:"첫 번째 정비소 무료 파일럿"})).toBeVisible();
});
