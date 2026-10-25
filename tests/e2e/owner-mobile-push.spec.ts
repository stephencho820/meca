import {test,expect} from "@playwright/test";

test("owner mobile push is explicitly opt-in and disabled before credentials",async({page})=>{
 await page.goto("/dashboard?demo=1");
 await page.getByRole("button",{name:"매장 설정"}).click();
 await expect(page.getByRole("heading",{name:"휴대전화 예약 푸시 알림"})).toBeVisible();
 await expect(page.getByText(/관리자 화면을 닫아도/).first()).toBeVisible();
 await expect(page.getByRole("button",{name:"이 휴대전화에서 알림 받기"})).toBeDisabled();
 await expect(page.getByRole("button",{name:"테스트 알림 보내기"})).toBeDisabled();
 await expect(page.getByText(/iPhone·iPad에서는 Safari/)).toBeVisible();
 const response=await page.request.get("/api/owner-push");
 expect(response.ok()).toBe(true);
 const status=await response.json() as {ready:boolean;public_key:string|null};
 expect(status.ready).toBe(false);
 expect(status.public_key).toBeNull();
});

test("service worker and web manifest are publicly available over the same origin",async({page})=>{
 const sw=await page.request.get("/sw.js");
 expect(sw.ok()).toBe(true);
 expect(await sw.text()).toContain('addEventListener("push"');
 const manifest=await page.request.get("/manifest.webmanifest");
 expect(manifest.ok()).toBe(true);
 const body=await manifest.json() as {start_url:string;display:string};
 expect(body.start_url).toBe("/dashboard");
 expect(body.display).toBe("standalone");
});
