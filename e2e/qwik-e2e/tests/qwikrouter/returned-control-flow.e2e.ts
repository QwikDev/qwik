import { expect, test } from '@playwright/test';

const base = '/qwikrouter-test/returned-control-flow';

// Returning ev.redirect()/ev.error() must behave the same as throwing them.
test.describe('returned control-flow signals', () => {
  test('loader returning redirect redirects', async ({ page }) => {
    await page.goto(`${base}/loader-redirect/`);
    await expect(page.locator('#returned-control-flow-target')).toBeVisible();
  });

  test('request handler returning redirect redirects', async ({ page }) => {
    await page.goto(`${base}/handler-redirect/`);
    await expect(page.locator('#returned-control-flow-target')).toBeVisible();
  });

  test('loader returning error renders the error response', async ({ page }) => {
    const response = await page.goto(`${base}/loader-error/`);
    expect(response?.status()).toEqual(401);
    await expect(page.locator('body')).toContainText('returned-loader-error');
  });

  test('action returning error responds with the error status', async ({ page }) => {
    await page.goto(`${base}/action-error/`);
    const actionPath = await page.locator('form').getAttribute('action');
    const response = await page.request.post(new URL(actionPath!, page.url()).href, {
      headers: { Accept: 'application/json' },
      form: {},
    });
    expect(response.status()).toEqual(403);
  });
});
