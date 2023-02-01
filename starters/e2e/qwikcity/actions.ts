import { expect, test } from '@playwright/test';

test.describe('loaders', () => {
  test.describe('mpa', () => {
    test.use({ javaScriptEnabled: false });
    tests();
  });

  test.describe('spa', () => {
    test.use({ javaScriptEnabled: true });
    tests();
  });

  function tests() {
    test.describe('issue2644', () => {
      test('should submit items', async ({ page }) => {
        await page.goto('/qwikcity-test/issue2644/');
        await page.locator('#issue2644-input').fill('AAA');
        await page.locator('#issue2644-submit').click();
        await page.waitForTimeout(200);

        const pageUrl = new URL(page.url());
        await expect(pageUrl.pathname).toBe('/qwikcity-test/issue2644/other/');
        await expect(page.locator('#issue2644-list > li')).toHaveText(['AAA']);

        await page.locator('#issue2644-input').fill('BBB');
        await page.locator('#issue2644-submit').click();
        await expect(pageUrl.pathname).toBe('/qwikcity-test/issue2644/other/');

        await expect(page.locator('#issue2644-list > li')).toHaveText(['AAA', 'BBB']);
      });
    });
  }
});
