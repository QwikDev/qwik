import { test } from "@playwright/test";

test.describe("Qwik Router Error boundary", () => {
  test("should catch error", async ({ page }) => {
    await page.goto("/qwikrouter-test/error");

    page.getByRole("button", { name: "Throw error" }).click();

    await page.waitForSelector('div:has-text("Caught error: Boom!")');
  });
});
