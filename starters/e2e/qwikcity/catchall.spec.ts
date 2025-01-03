import { expect, test } from "@playwright/test";

test.describe("Qwik City Catchall", () => {
  test.describe("mpa", () => {
    test.use({ javaScriptEnabled: false });
    tests();
  });
  test.describe("spa", () => {
    test.use({ javaScriptEnabled: true });
    tests();
  });
});

function tests() {
  test("Handled Catchall", async ({ context }) => {
    const page = await context.newPage();
    const response = (await page.goto("/qwikcity-test/catchall/"))!;
    const status = response.status();
    expect(status).toBe(200);
    await expect(page.locator('[data-test-params="catchall"]')).toHaveText(
      "catchall",
    );
  });

  test("Aborted Catchall", async ({ context }) => {
    const page = await context.newPage();
    const response = (await page.goto("/qwikcity-test/catchall-abort/"))!;
    const status = response.status();
    expect(status).toBe(404);
  });

  test("Error Catchall", async ({ context }) => {
    const page = await context.newPage();
    const response = (await page.goto("/qwikcity-test/catchall-error/"))!;
    const status = response.status();
    expect(status).toBe(500);
  });
}
