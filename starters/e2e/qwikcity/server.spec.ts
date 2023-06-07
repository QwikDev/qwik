import { expect, test } from '@playwright/test';

test.describe('server$', () => {
  test('this is available', async ({ page }) => {
    await page.goto('/qwikcity-test/server-func/');
    const host = page.locator('.server-host');

    await expect(host).toHaveText([
      'localhost:3301',
      'localhost:3301',
      'localhost:3301',
      'localhost:3301',
      '',
      'localhost:3301',
    ]);

    const button = page.locator('#server-host-button');
    await button.click();
    await expect(host).toHaveText([
      'localhost:3301',
      'localhost:3301',
      'localhost:3301',
      'localhost:3301',
      'localhost:3301',
      'localhost:3301',
    ]);
  });
});
