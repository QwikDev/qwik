import { test, expect } from "@playwright/test";

test.describe("two-listeners", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/e2e/two-listeners");
    page.on("pageerror", (err) => expect(err).toEqual(undefined));
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        expect(msg.text()).toEqual(undefined);
      }
    });
  });

  test("should support two QRLs on event", async ({ page }) => {
    const button = page.locator(".two-listeners");
    await button.click();
    await expect(button).toContainText("2 / 3");
  });
});
