import { test, expect } from "@playwright/test";

test.describe("watch", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/e2e/watch");
    page.on("pageerror", (err) => expect(err).toEqual(undefined));
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        expect(msg.text()).toEqual(undefined);
      }
    });
  });

  test("should watch correctly", async ({ page }) => {
    const server = page.locator("#server-content");

    const parent = page.locator("#parent");
    const child = page.locator("#child");
    const debounced = page.locator("#debounced");
    const addButton = page.locator("#add");

    await expect(server).toHaveText("comes from server");
    await expect(parent).toHaveText("2");
    await expect(child).toHaveText("2 / 4");
    await expect(debounced).toHaveText("Debounced: 0");

    await addButton.click();

    await expect(parent).toHaveText("3");
    await expect(server).toHaveText("comes from server");
    await expect(child).toHaveText("3 / 6");
    await expect(debounced).toHaveText("Debounced: 0");

    await addButton.click();

    await expect(parent).toHaveText("4");
    await expect(server).toHaveText("comes from server");
    await expect(child).toHaveText("4 / 8");
    await expect(debounced).toHaveText("Debounced: 0");

    // Wait for debouncer
    await expect(debounced).toHaveText("Debounced: 8");
    await expect(server).toHaveText("comes from server");
    await expect(parent).toHaveText("4");
    await expect(child).toHaveText("4 / 8");
  });

  test("issue-1766", async ({ page }) => {
    const result = page.locator("#issue-1766");
    const loc = page.locator("#issue-1766-loc");

    await expect(loc).toHaveText("Loc: /ROOT");
    await expect(result).toHaveText("---");

    const showBtn1 = page.locator("#show-btn");
    await showBtn1.click();

    const showBtn2 = page.locator("#show-btn-2");
    await showBtn2.click();

    await expect(loc).toHaveText("Loc: /ROOT");
    await expect(result).toHaveText("watch ran");

    const linkBtn = page.locator("#link-navigate");
    await linkBtn.click();
    await expect(loc).toHaveText("Loc: /PAGE");
    await expect(result).toHaveText("watch ran");
  });

  test("issue-2972", async ({ page }) => {
    const result = page.locator("#issue-2972");
    await expect(result).toHaveText("passed");
  });
});
