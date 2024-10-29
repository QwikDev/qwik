import { expect, test } from "@playwright/test";
import { QContainerSelector } from "../../../packages/qwik/src/core/shared/utils/markers";

test.describe("Qwik Router locale API", () => {
  test("pass locale to Qwik", async ({ page }) => {
    await page.goto("/qwikrouter-test/locale");
    const locale = page.locator(".locale");
    await expect(locale).toHaveText("test-locale");
    const qContainer = page.locator(QContainerSelector);
    await expect(qContainer).toHaveAttribute("q:locale", "test-locale");
  });
});
