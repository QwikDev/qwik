import { expect, test } from "@playwright/test";

test.describe("Qwik City locale API", () => {
  // TODO(v2): fix this
  test.skip("pass locale to Qwik", async ({ page }) => {
    await page.goto("/qwikcity-test/locale");
    const locale = page.locator(".locale");
    const qContainer = page.locator("[q\\:container]");
    await expect(locale).toHaveText("test-locale");
    await expect(qContainer).toHaveAttribute("q:locale", "test-locale");
  });
});
