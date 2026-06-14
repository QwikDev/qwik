import { expect, test } from '@playwright/test';

test.describe('error channel (return error)', () => {
  test('loader return error() surfaces on loader.error (SSR), page does not abort', async ({
    page,
  }) => {
    const response = await page.goto('/qwikrouter-test/error-channel/?fail=1');
    // The page renders normally — a RETURNED error() does NOT abort to the error page.
    expect(response?.status()).toBe(418);
    await expect(page.locator('#loader-error')).toContainText('418:{"reason":"loader teapot"}');
  });

  test('loader without error renders its value', async ({ page }) => {
    await page.goto('/qwikrouter-test/error-channel/');
    await expect(page.locator('#loader-error')).toHaveText('no-error');
    await expect(page.locator('#loader-value')).toContainText('loader-ok');
  });

  test('action return error() surfaces on action.error', async ({ page }) => {
    await page.goto('/qwikrouter-test/error-channel/');
    await expect(page.locator('#action-error')).toHaveText('no-error');
    await page.locator('#submit-fail').click();
    await expect(page.locator('#action-error')).toContainText('422:{"reason":"action teapot"}');
    await expect(page.locator('#action-value')).toHaveText('no-value');
  });
});
