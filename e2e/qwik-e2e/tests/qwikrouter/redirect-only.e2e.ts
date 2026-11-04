import { expect, test } from '@playwright/test';

const start = '/qwikrouter-test.prod/redirect-only/';
const final = '/qwikrouter-test.prod/redirect-only/final/';

test.describe('client navigation to an onGet-only route that redirects', () => {
  test('Link follows the redirect', async ({ page }) => {
    await page.goto(start);
    await page.locator('[data-test-link="redirect-only"]').click();
    await expect(page.locator('#redirect-only-final')).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`${final}$`));
  });

  test('action redirecting to it follows the redirect', async ({ page }) => {
    await page.goto(start);
    await page.locator('#redirect-only-submit').click();
    await expect(page.locator('#redirect-only-final')).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`${final}$`));
  });
});
