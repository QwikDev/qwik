import { expect, test } from '@playwright/test';

test.describe('route that only exports a loader', () => {
  test('redirects from the loader on a document request', async ({ page }) => {
    const response = await page.goto('/qwikrouter-test/loader-only/redirect/');
    expect(response?.request().redirectedFrom()?.url()).toContain('/loader-only/redirect/');
    await expect(page).toHaveURL(/\/qwikrouter-test\/loader-only\/target\/$/);
    await expect(page.locator('#loader-only-target')).toHaveText('Redirect target');
  });

  test('redirects from the loader on a client navigation', async ({ page }) => {
    await page.goto('/qwikrouter-test/loader-only/');
    await page.locator('#loader-only-link').click();
    await expect(page).toHaveURL(/\/qwikrouter-test\/loader-only\/target\/$/);
    await expect(page.locator('#loader-only-target')).toHaveText('Redirect target');
  });
});
