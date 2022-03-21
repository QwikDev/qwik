import { test, expect } from '@playwright/test';

test.describe('e2e', () => {
  test.describe('two-listeners', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/e2e/two-listeners');
    });

    test('should support two QRLs on event', async ({ page }) => {
      const button = page.locator('button.two-listeners');
      await button.click();
      await expect(button).toContainText('2 / 2');
    });
  });

  // test.describe('lexical-scope', () => {
  //   test.beforeEach(async ({ page }) => {
  //     await page.goto('/e2e/lexical-scope');
  //   });

  // });

  // test.describe('slot', () => {
  //   test.beforeEach(async ({ page }) => {
  //     await page.goto('/e2e/slot');
  //   });

  // });
});
