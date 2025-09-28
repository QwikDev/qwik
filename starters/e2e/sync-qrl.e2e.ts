import { test, expect } from "@playwright/test";

test.describe("resuming", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/e2e/sync-qrl");
    page.on("pageerror", (err) => expect(err).toEqual(undefined));
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        expect(msg.text()).toEqual(undefined);
      }
    });
  });

  test("should synchronously prevent default", async ({ page }) => {
    const input = page.locator("#preventDefaultInput");

    await expect(input).not.toBeChecked();
    // clicking checkbox toggles the checked state.
    await input.click();
    await expect(input).toBeChecked();

    await input.evaluate((el) =>
      el.setAttribute("shouldPreventDefault", "true"),
    );

    // clicking checkbox does not toggles the checked state, because default is prevented.
    await input.click();
    await expect(input).toBeChecked();
    await expect(await input.getAttribute("prevented")).toBeDefined();
  });
});
