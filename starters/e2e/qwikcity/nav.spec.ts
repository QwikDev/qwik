import { expect, test } from '@playwright/test';
import { pathToFileURL } from 'url';

test.describe('actions', () => {
  test.describe('mpa', () => {
    test.use({ javaScriptEnabled: false });
    tests();
  });

  test.describe('spa', () => {
    test.use({ javaScriptEnabled: true });
    tests();
  });

  function tests() {
    test.describe('issue2829', () => {
      test('should navigate with context', async ({ page }) => {
        await page.goto('/qwikcity-test/issue2829/a/');
        const link = page.locator('#issue2829-link');
        await link.click();

        await expect(page.locator('h1')).toHaveText('Profile');
        await expect(page.locator('#issue2829-context')).toHaveText('context: __CONTEXT_VALUE__');
        await expect(new URL(page.url()).pathname).toBe('/qwikcity-test/issue2829/b/');
      });
    });
  }
});
