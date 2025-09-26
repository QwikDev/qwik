import { expect, test } from "@playwright/test";

// This test ensures asyncRequestStore locale isolation across concurrent requests.
// It triggers two concurrent server renders to the same route with different locales,
// and uses a server-side barrier so the page reveals the locale only after both renders started.

test.describe("Qwik Router concurrent locale", () => {
  test("should isolate locale per concurrent request", async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();

    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();

    const url1 =
      "/qwikrouter-test/locale-concurrent?group=g&id=one&locale=en-US";
    const url2 =
      "/qwikrouter-test/locale-concurrent?group=g&id=two&locale=fr-FR";

    // Start both navigations without waiting them to finish
    const nav1 = page1.goto(url1);
    const nav2 = page2.goto(url2);

    await Promise.all([nav1, nav2]);

    // Before barrier render, locale is already set and visible in first block
    await expect(page1.locator(".locale-before")).toHaveText("en-US");
    await expect(page2.locator(".locale-before")).toHaveText("fr-FR");

    // After barrier releases, the bottom content renders and must preserve each locale
    await expect(page1.locator(".locale")).toHaveText("en-US");
    await expect(page2.locator(".locale")).toHaveText("fr-FR");

    await ctx1.close();
    await ctx2.close();
  });
});
