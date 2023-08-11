import { expect, test } from "@playwright/test";

test.describe("Qwik City URL params", () => {
  test.describe("mpa", () => {
    test.use({ javaScriptEnabled: false });
    tests();
  });
  test.describe("spa", () => {
    test.use({ javaScriptEnabled: false });
    tests();
  });
});

function tests() {
  test("Route Params", async ({ context }) => {
    const page = await context.newPage();
    const response = (await page.goto("/qwikcity-test/usa/astoria/"))!;
    const status = response.status();
    expect(status).toBe(200);
    const title = page.locator("title");
    expect(await title.innerText()).toBe(
      "Weather: usa astoria, 30C, 10day - Qwik",
    );
    await expect(page.locator('[data-test-params="country"]')).toHaveText(
      "usa",
    );
    await expect(page.locator('[data-test-params="city"]')).toHaveText(
      "astoria",
    );
    await expect(page.locator('[data-test-params="temperature"]')).toHaveText(
      "30",
    );
  });

  test("Query Params", async ({ context }) => {
    const page = await context.newPage();
    const response = (await page.goto(
      "/qwikcity-test/usa/hill-valley/?unit=F&forecast=24hour",
    ))!;
    const status = response.status();
    expect(status).toBe(200);
    const title = page.locator("title");
    expect(await title.innerText()).toBe(
      "Weather: usa hill-valley, 30F, 24hour - Qwik",
    );
    await expect(page.locator('[data-test-params="unit"]')).toHaveText("F");
    await expect(page.locator('[data-test-params="forecast"]')).toHaveText(
      "24hour",
    );
    await expect(page.locator('[data-test-params="temperature"]')).toHaveText(
      "30",
    );
  });
}
