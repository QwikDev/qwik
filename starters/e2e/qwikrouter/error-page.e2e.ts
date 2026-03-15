import { expect, test } from "@playwright/test";

test.describe("Error page handling", () => {
  test("403 error is handled by error.tsx", async ({ context }) => {
    const page = await context.newPage();
    const response = (await page.goto("/qwikrouter-test/forbidden/"))!;

    expect(response.status()).toBe(403);

    // The custom error.tsx should render, not the default inline HTML error
    const heading = page.locator("h1");
    await expect(heading).toHaveText("Custom Error Page");

    const status = page.locator(".error-status");
    await expect(status).toHaveText("403");

    const message = page.locator(".error-message");
    await expect(message).toHaveText("Forbidden resource");
  });

  test("500 error from catch-all is handled by error.tsx", async ({
    context,
  }) => {
    const page = await context.newPage();
    const response = (await page.goto("/qwikrouter-test/catchall-error/"))!;

    expect(response.status()).toBe(500);

    // The custom error.tsx should render
    const heading = page.locator("h1");
    await expect(heading).toHaveText("Custom Error Page");

    const status = page.locator(".error-status");
    await expect(status).toHaveText("500");
  });
});
