import { test, expect } from "@playwright/test";

test.describe("container", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/e2e/container");
    page.on("pageerror", (err) => expect(err).toEqual(undefined));
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        expect(msg.text()).toEqual(undefined);
      }
    });
  });

  test("should handle counter", async ({ page }) => {
    const button = page.locator("button");

    await expect(button).toHaveText("0");
    await button.click();
    await expect(button).toHaveText("1");
  });

  test("should handle inner counter", async ({ page }) => {
    const container = page.locator(".inline-container container");
    const anchor = container.locator("a");

    await expect(anchor).toHaveText("1 / 1");
    await anchor.click();
    await expect(anchor).toHaveText("2 / 3");
  });

  test("should handle shadow-dom counter loaded from resource", async ({
    page,
  }) => {
    const shadowHost = page.locator("#shadow-dom-resource[q\\:shadowroot]");
    const anchor = shadowHost.locator("a");

    await expect(anchor).toHaveText("1 / 1");
    await anchor.click();
    await expect(anchor).toHaveText("2 / 3");
  });

  test("should handle shadow-dom counter loaded from stream", async ({
    page,
  }) => {
    const shadowHost = page.locator("#shadow-dom-stream[q\\:shadowroot]");
    const anchor = shadowHost.locator("a");

    await expect(anchor).toHaveText("1 / 1");
    await anchor.click();
    await expect(anchor).toHaveText("2 / 3");
  });

  test("dynamic preload", async ({ page }) => {
    const preloaderScript = page.locator(`script[q\\:type='link-js']`).first();
    await expect(preloaderScript).toBeDefined();
    // We don't have a way to check if modules are preloaded, because the links go away
  });
});
