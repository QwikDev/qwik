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

  test('action return fail() populates BOTH .value.failed and .error', async ({ page }) => {
    await page.goto('/qwikrouter-test/error-channel/');
    await page.locator('#submit-soft-fail').click();
    // Deprecated `.value.failed` union still works...
    await expect(page.locator('#fail-value')).toContainText('"failed":true');
    // ...and `.error` is populated too (the one failure channel).
    await expect(page.locator('#fail-error')).toContainText('400:{"reason":"soft fail"}');
  });

  test('unread action error() logs a dev-only unhandled-error warning', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });
    await page.goto('/qwikrouter-test/error-channel/');
    await page.locator('#submit-unhandled').click();
    // `.value` stays empty (error() carries no value) and the page never reads `.error`, so a
    // dev-only warning is logged on the macrotask after the submission settles.
    await expect(page.locator('#unhandled-value')).toHaveText('no-value');
    await expect.poll(() => errors.some((e) => e.includes('never read'))).toBe(true);
  });

  test('handled action error() does not warn', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });
    await page.goto('/qwikrouter-test/error-channel/');
    await page.locator('#submit-fail').click();
    // `.error` is read in the template, so the unhandled-error warning must not fire.
    await expect(page.locator('#action-error')).toContainText('422');
    await page.waitForTimeout(200);
    expect(errors.some((e) => e.includes('never read'))).toBe(false);
  });
});
