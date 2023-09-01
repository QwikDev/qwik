import { expect, test } from "@playwright/test";

test("Qwik City Fallback", async ({ context, javaScriptEnabled }) => {
  const page = await context.newPage();
  const response = (await page.goto("/qwikcity-test/idk/"))!;

  expect(response.status()).toBe(404);

  const title = page.locator("title");
  expect(await title.innerText()).toBe(`404 Resource Not Found`);
});
