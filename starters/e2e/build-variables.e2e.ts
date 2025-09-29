import { test, expect } from "@playwright/test";

test.describe("build-variables", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/e2e/build-variables");
    page.on("pageerror", (err) => expect(err).toEqual(undefined));
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        expect(msg.text()).toEqual(undefined);
      }
    });
  });

  test("should have correct value", async ({ page }) => {
    const result = page.locator("#build-variables-result");
    const button = page.locator("#build-variables-button");

    await expect(result).toHaveText(
      '{"isServer":true,"isBrowser":false,"isDev":true,"buildIsServer":true,"buildIsBrowser":false,"buildIsDev":true,"count":0}',
    );
    await button.click();
    await expect(result).toHaveText(
      '{"isServer":false,"isBrowser":true,"isDev":true,"buildIsServer":false,"buildIsBrowser":true,"buildIsDev":true,"count":1}',
    );
  });
});
