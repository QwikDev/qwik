import { test, expect } from "@playwright/test";

test.describe("ref", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/e2e/ref");
    page.on("pageerror", (err) => expect(err).toEqual(undefined));
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        expect(msg.text()).toEqual(undefined);
      }
    });
  });

  test("should render correctly", async ({ page }) => {
    const staticEl = page.locator("#static");
    const dynamicEl = page.locator("#dynamic");
    const static2El = page.locator("#static-2");
    const dynamic2El = page.locator("#dynamic-2");
    const static3El = page.locator("#static-3");
    const dynamic3El = page.locator("#dynamic-3");

    await expect(staticEl).toHaveText("Rendered static");
    await expect(dynamicEl).toHaveText("Rendered dynamic");
    await expect(static2El).toHaveText("Rendered static-2");
    await expect(dynamic2El).toHaveText("Rendered dynamic-2");
    await expect(static3El).toHaveText("Rendered static-3");
    await expect(dynamic3El).toHaveText("Rendered dynamic-3");
  });
});
