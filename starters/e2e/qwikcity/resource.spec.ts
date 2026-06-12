import { expect, test } from "@playwright/test";

test.describe("Resource", () => {
  test("should handle the resource correctly", async ({ page }) => {
    await page.goto("/qwikcity-test/issue7254/");

    await expect(page.getByText("Data: hello Bar")).toBeVisible();

    await page.getByRole("button", { name: "Reset" }).click();

    await expect(page.getByText("Data: Foo Bar")).toBeVisible();
  });
});
