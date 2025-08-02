import { test, expect } from "@playwright/test";

test.describe("effect-client", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/e2e/effect-client");
    page.on("pageerror", (err) => expect(err).toEqual(undefined));
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        expect(msg.text()).toEqual(undefined);
      }
    });
  });

  test("should load", async ({ page }) => {
    const container = page.locator("#container");
    const counter = page.locator("#counter");
    const msg = page.locator("#msg");
    const msgEager = page.locator("#eager-msg");
    const msgClientSide1 = page.locator("#client-side-msg-1");
    const msgClientSide2 = page.locator("#client-side-msg-2");
    const msgClientSide3 = page.locator("#client-side-msg-3");

    await expect(container).not.toHaveAttribute("data-effect");
    await expect(counter).toHaveText("0");
    await expect(msg).toHaveText("empty");
    await expect(msgEager).toHaveText("run");
    await expect(msgClientSide1).toHaveText("run");
    await expect(msgClientSide2).toHaveText("run");
    await expect(msgClientSide3).toHaveText("run");

    await counter.scrollIntoViewIfNeeded();

    await expect(container).toHaveAttribute("data-effect", "true");
    await expect(counter).toHaveText("10");
    await expect(msg).toHaveText("run");

    await expect(container).toHaveAttribute("data-effect", "true");
    await expect(counter).toHaveText("11");
    await expect(msg).toHaveText("run");
  });

  test("issue 1717", async ({ page }) => {
    const value1 = page.locator("#issue-1717-value1");
    const value2 = page.locator("#issue-1717-value2");
    const meta = page.locator("#issue-1717-meta");
    await expect(value1).toHaveText("value 1");
    await expect(value2).toHaveText("value 2");
    await expect(meta).toHaveText("Sub: 10 Renders: 1");
  });

  test("issue 2015", async ({ page }) => {
    const order = page.locator("#issue-2015-order");
    // check for non-blocking behavior of visible tasks, order is not guaranteed
    await expect(order).toHaveText(
      /^Order: start \d+ start \d+ start \d+ finish \d+ finish \d+ finish \d+$/,
    );
  });

  test("issue 1955", async ({ page }) => {
    const results = page.locator("#issue-1955-results");
    await expect(results).toHaveText("run");
  });

  test("cleanup", async ({ page }) => {
    const counter = page.locator("#cleanup-effects-button");
    const nuCleanups = page.locator("#cleanup-effects-count");
    await expect(nuCleanups).toHaveText("0");
    await counter.click();
    await expect(nuCleanups).toHaveText("1");
    await counter.click();
    await expect(nuCleanups).toHaveText("2");
  });

  test("issue 4432", async ({ page }) => {
    const button = page.locator("#issue-4432-button");
    const logs = page.locator("#issue-4432-logs");
    await expect(logs).toHaveText("VisibleTask ChildA /\n");
    await button.click();
    await expect(logs).toHaveText(
      "VisibleTask ChildA /\nCleanup ChildA /other\n",
    );
  });
});
