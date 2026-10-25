import { expect, test } from "@playwright/test";

test.describe("Qwik City API: useLocation", () => {
  test("should ignore untrusted x-forwarded headers", async ({ page }) => {
    await page.setExtraHTTPHeaders({
      "X-Forwarded-Host": "override-server",
      "X-Forwarded-Proto": "http",
    });
    const rsp = (await page.goto("/qwikcity-test/location/"))!;
    expect(rsp.status()).toBe(200);
    const span = page.locator(".url");
    await expect(span).toHaveText(rsp.url());
  });

  test("should ignore untrusted x-forwarded headers with port", async ({
    page,
  }) => {
    await page.setExtraHTTPHeaders({
      "X-Forwarded-Host": "override-server:9999",
      "X-Forwarded-Proto": "https",
    });
    const rsp = (await page.goto("/qwikcity-test/location/"))!;
    expect(rsp.status()).toBe(200);
    const span = page.locator(".url");
    await expect(span).toHaveText(rsp.url());
  });
});
