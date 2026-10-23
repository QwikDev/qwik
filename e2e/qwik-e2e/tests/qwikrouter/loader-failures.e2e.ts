import { expect, test } from '@playwright/test';

const base = '/qwikrouter-test/loader-failures/';

test.describe('loader failures', () => {
  test.describe('SSR', () => {
    test('a plain Error in middleware renders error.tsx at 500', async ({ page }) => {
      const response = await page.goto(`${base}middleware-crash/`);

      expect(response!.status()).toBe(500);
      await expect(page.locator('h1')).toHaveText('Custom Error Page');
      await expect(page.locator('.error-status')).toHaveText('500');
    });
  });
});
