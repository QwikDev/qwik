import { expect, test } from "@playwright/test";

test.describe("Qwik Router API: useLocation", () => {
  test("should take x-forwarded headers into account", async ({ page }) => {
    await page.setExtraHTTPHeaders({
      "X-Forwarded-Host": "override-server",
      "X-Forwarded-Proto": "http",
    });
    const rsp = (await page.goto("/qwikrouter-test/location/"))!;
    expect(rsp.status()).toBe(200);
    const span = page.locator(".url");
    expect(await span.textContent()).toBe(
      "http://override-server/qwikrouter-test/location/",
    );
  });

  test("should take x-forwarded headers into account with port", async ({
    page,
  }) => {
    await page.setExtraHTTPHeaders({
      "X-Forwarded-Host": "override-server:9999",
      "X-Forwarded-Proto": "https",
    });
    const rsp = (await page.goto("/qwikrouter-test/location/"))!;
    expect(rsp.status()).toBe(200);
    const span = page.locator(".url");
    expect(await span.textContent()).toBe(
      "https://override-server:9999/qwikrouter-test/location/",
    );
  });
});
