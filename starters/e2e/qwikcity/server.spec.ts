import { expect, test } from "@playwright/test";

test.describe("server$", () => {
  test("this is available", async ({ page }) => {
    await page.goto("/qwikcity-test/server-func/");
    const host = page.locator(".server-host");

    await expect(host).toHaveText([
      "localhost:3301",
      "localhost:3301",
      "localhost:3301",
      "localhost:3301",
      "",
      "localhost:3301",
    ]);

    const button = page.locator("#server-host-button");
    await button.click();
    await expect(host).toHaveText([
      "localhost:3301",
      "localhost:3301",
      "localhost:3301",
      "localhost:3301",
      "localhost:3301",
      "localhost:3301",
    ]);
  });

  test("streaming", async ({ page }) => {
    await page.goto("/qwikcity-test/server-func/");
    const logs = page.locator(".server-streaming");
    const button = page.locator("#server-streaming-button");

    await expect(logs).toHaveText("");
    await button.click();
    await expect(logs).toHaveText("0");
    await expect(logs).toHaveText("01");
    await expect(logs).toHaveText("012");
    await expect(logs).toHaveText("0123");
    await expect(logs).toHaveText("01234");
  });
});

test.describe("server$ inside resource", () => {
  test("All functions have reference to requestevent", async ({ page }) => {
    await page.goto("/qwikcity-test/server-func/resource");

    await Promise.all(
      ["a", "b", "c"].map(async (letter) => {
        const result = await page.locator(`#${letter}`);

        await expect(result).toHaveText([
          "/qwikcity-test/server-func/resource/" + letter,
        ]);
      })
    );
  });
});
