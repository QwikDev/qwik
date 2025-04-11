import { test, expect } from "@playwright/test";

test.describe("qrl", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/e2e/qrl");
    page.on("pageerror", (err) => expect(err).toEqual(undefined));
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        expect(msg.text()).toEqual(undefined);
      }
    });
  });

  function tests() {
    test("should resolve computed QRL", async ({ page }) => {
      const computedCounter = page.locator("#computed-counter");
      const visibleCounter = page.locator("#visible-counter");
      await expect(computedCounter).toHaveText("1");
      await expect(visibleCounter).toHaveText("1");
    });

    test("should resolve inner computed QRL", async ({ page }) => {
      const innerButton = page.locator("#inner-computed-button");
      await innerButton.click();
      await expect(innerButton).toHaveText("Click Me 1");
    });
  }

  tests();

  test.describe("client rerender", () => {
    test.beforeEach(async ({ page }) => {
      const toggleRender = page.locator("#rerender");
      await toggleRender.click();
      await expect(page.locator("#rerender")).toHaveText("rerender 1");
    });
    tests();
  });
});
