import { expect, test } from "@playwright/test";

test.describe("Qwik Router documentHead", () => {
  test("pass documentHead to Qwik", async ({ page }) => {
    await page.goto("/qwikrouter-test/");
    // injected title via renderToStream serverData
    await expect(page).toHaveTitle("Qwik Router Test - Qwik");
    const meta = page.locator("meta[name='hello']");
    await expect(meta).toHaveAttribute("content", "world");
    expect(await page.evaluate(() => (window as any).hello)).toBe("world");
  });
});
