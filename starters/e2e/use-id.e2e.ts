import { test, expect } from "@playwright/test";

test.describe("use-id", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/e2e/use-id");
    page.on("pageerror", (err) => expect(err).toEqual(undefined));
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        expect(msg.text()).toEqual(undefined);
      }
    });
    // await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500); // Wait for useVisibleTask$
  });

  test("Creates unique ids and ensure no collisions", async ({ page }) => {
    const totalIdsLocator = page.locator("#totalIds");
    await totalIdsLocator.isVisible();
    const totalIdsText = await totalIdsLocator.textContent();
    const totalIds = parseInt(totalIdsText || "-1");
    await expect(totalIds).toBeGreaterThan(0); // MAKE SURE WE HAVE SOME IDS

    const validIdsLocator = page.locator("#validIds");
    const validIdsText = await validIdsLocator.textContent();
    const validIds = parseInt(validIdsText || "-1");

    const collisionsLocator = page.locator("#collisions");
    const collisionsText = await collisionsLocator.textContent();
    const collisions = parseInt(collisionsText || "-1");

    //
    // COMPARE VALUES AS AN OBJECT TO SHOW THE ACTUAL RESULTS IN THE TEST REPORT
    //
    const actual = {
      collisions,
      totalIds,
      validIds,
    };

    const expected = {
      collisions: 0,
      totalIds,
      validIds,
    };

    await expect(actual).toMatchObject(expected);
  });
});
