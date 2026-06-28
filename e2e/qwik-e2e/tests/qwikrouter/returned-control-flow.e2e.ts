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
    // Submit via the real form so the request carries a valid Origin (passes CSRF).
    const [response] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('qaction=')),
      page.locator('button[type="submit"]').click(),
    ]);
    expect(response.status()).toEqual(403);
  });

  test('JSON action redirect responds with an envelope and navigates the page', async ({
    page,
  }) => {
    await page.goto(`${base}/action-redirect/`);
    const [response] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('qaction=')),
      page.locator('button[type="submit"]').click(),
    ]);
    // Redirect is carried in the JSON body (status 200) so fetch doesn't auto-follow it.
    expect(response.status()).toEqual(200);
    expect(response.headers()['location']).toBeUndefined();
    // The 200 envelope must not be cached, or a stale redirect could be replayed.
    expect(response.headers()['cache-control']).toContain('no-store');
    // The client then navigates to the redirect target.
    await expect(page.locator('#returned-control-flow-target')).toBeVisible();
  });
});
