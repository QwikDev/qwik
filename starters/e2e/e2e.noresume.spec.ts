import { test, expect } from '@playwright/test';

test.describe('no resume', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/e2e/no-resume');
  });

  test('should handle to click', async ({ page }) => {
    const button = page.locator('button');
    await button.click();

    const body = page.locator('body');
    await expect(body).toHaveCSS('background-color', 'rgb(0, 0, 0)');
  });
});
