import { test, expect } from '@playwright/test';

test.describe('container', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/e2e/container');
    page.on('pageerror', (err) => expect(err).toEqual(undefined));
  });

  test('should handle counter', async ({ page }) => {
    const button = page.locator('button');

    await expect(button).toHaveText('0');
    await button.click();
    await expect(button).toHaveText('1');
  });

  test('should handle inner counter', async ({ page }) => {
    const anchor = page.locator('a');

    await expect(anchor).toHaveText('1 / 1');
    await anchor.click();
    await expect(anchor).toHaveText('2 / 3');
  });
});
