import { expect, test } from "@playwright/test";

test.describe("revolve value", () => {
  test.describe("mpa", () => {
    test.use({ javaScriptEnabled: false });
    tests();
  });

  test.describe("spa", () => {
    test.use({ javaScriptEnabled: true });
    tests();
  });

  function tests() {
    test("should submit valid form data", async ({ page }) => {
      await page.goto("/qwikcity-test/resolve-value");

      await page.fill('input[name="firstName"]', "NewFirstName");
      await page.fill('input[name="lastName"]', "NewLastName");
      await page.click('button[id="actionButton"]');

      const successMessage = page.locator(
        'p:has-text("User NewFirstName added successfully")',
      );
      const lastNameSuccess = page.locator(
        'p:has-text("User NewLastName added successfully")',
      );
      const userIdDisplay = page.locator(
        'p:has-text("User 11 added successfully")',
      );
      await expect(successMessage).toBeVisible();
      await expect(lastNameSuccess).toBeVisible();
      await expect(userIdDisplay).toBeVisible();
    });

    test("should submit global form data", async ({ page }) => {
      await page.goto("/qwikcity-test/resolve-value");

      await page.fill('input[name="globalfirstName"]', "GlobalFirstName");
      await page.fill('input[name="globallastName"]', "GlobalLastName");
      await page.click('button[id="globalButton"]');

      const globalSuccess = page.locator(
        'p:has-text("User GlobalFirstName added successfully")',
      );
      const globalLastName = page.locator(
        'p:has-text("User GlobalLastName added successfully")',
      );
      const globalUserId = page.locator(
        'p:has-text("User 11 added successfully")',
      );
      await expect(globalSuccess).toBeVisible();
      await expect(globalLastName).toBeVisible();
      await expect(globalUserId).toBeVisible();
    });
  }
});
