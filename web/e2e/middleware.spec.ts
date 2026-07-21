import { test, expect } from "@playwright/test";

test("redirects unauthenticated requests to /login with returnTo", async ({ page }) => {
  await page.goto("/dashboard");
  await page.waitForURL(/\/login\?returnTo=%2Fdashboard/);
  expect(page.url()).toContain("returnTo=%2Fdashboard");
});
