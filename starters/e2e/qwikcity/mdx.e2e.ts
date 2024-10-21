import { expect, test } from "@playwright/test";

test.describe("mdx tables ", () => {
  const wrapperClassName = ".table-wrapper";
  test(`should be wrapped with a div that has the class name ${wrapperClassName}`, async ({
    page,
  }) => {
    await page.goto("/qwikcity-test/mdx/");
    const tableWrapperElm = page.locator(wrapperClassName);
    await expect(tableWrapperElm).toBeVisible();

    const tableElm = page.locator(".table-wrapper > table");
    await expect(tableElm).toBeVisible();
  });
});
