import {defineConfig, devices} from "@playwright/test";
export default defineConfig({
 testDir:"./tests/e2e",
 fullyParallel:false,
 retries:process.env.CI?1:0,
 workers:1,
 reporter:process.env.CI?"github":"list",
 use:{baseURL:"http://127.0.0.1:3100",trace:"retain-on-failure",...devices["Desktop Chrome"]},
 webServer:{
   command:"npm run start -- -p 3100",
   url:"http://127.0.0.1:3100/demo",
   reuseExistingServer:!process.env.CI,
   timeout:120000
 }
});
