import { test, expect } from '@playwright/test';

test.describe('e2e', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/e2e/');
  });

  test.describe('qwikloader', () => {
    test('should support two QRLs on event', async ({ page }) => {
      const button = page.locator('button.two-listeners');
      await button.click();
      await expect(button).toContainText('2 / 2');
    });
  });
});
