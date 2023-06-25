import { test, expect } from "@playwright/test";

test.describe("resuming", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/e2e/resuming");
    page.on("pageerror", (err) => expect(err).toEqual(undefined));
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        expect(msg.text()).toEqual(undefined);
      }
    });
  });

  test("should toggle without crash", async ({ page }) => {
    const toggle = page.locator("#toggle");
    const increment = page.locator("#increment");
    const counter = page.locator("#counter");
    const counterCopy = page.locator("#counter-copy");

    await expect(counter).toBeVisible();
    await expect(counter).toHaveText("0");
    await expect(counterCopy).toHaveText("0");

    // Hide
    await toggle.click();
    await expect(counter).not.toBeVisible();
    await increment.click();
    await increment.click();
    await expect(counter).not.toBeVisible();
    await expect(counterCopy).toHaveText("0");

    // Show
    await toggle.click();
    await expect(counter).toBeVisible();
    await expect(counter).toHaveText("2");
    await expect(counterCopy).toHaveText("2");
    await increment.click();
    await expect(counter).toHaveText("3");
    await expect(counterCopy).toHaveText("3");
  });
});
