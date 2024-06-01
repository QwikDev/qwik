import { expect, test } from "@playwright/test";
import { QContainerSelector } from "../../../packages/qwik/src/core/util/markers";

test.describe("Qwik City locale API", () => {
  test("pass locale to Qwik", async ({ page }) => {
    await page.goto("/qwikcity-test/locale");
    const locale = page.locator(".locale");
    await expect(locale).toHaveText("test-locale");
    const qContainer = page.locator(QContainerSelector);
    await expect(qContainer).toHaveAttribute("q:locale", "test-locale");
  });
});
