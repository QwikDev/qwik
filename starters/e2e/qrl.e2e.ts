import { expect, test } from "@playwright/test";
test("should update counter without uncaught promises", async ({ page }) => {
  await page.goto("/e2e/qrl");
  page.on("pageerror", (err) => expect(err).toEqual(undefined));
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      expect(msg.text()).toEqual(undefined);
    }
  });
  const button = page.locator("#inner-computed-button");
  await expect(button).toContainText("Click Me 0");

  await button.click();
});
