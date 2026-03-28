import { expect, test } from '@playwright/test';

test.describe.only('worker', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/e2e/worker');
    page.on('pageerror', (err) => expect(err).toEqual(undefined));
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        expect(msg.text()).toEqual(undefined);
      }
    });
  });

  test('runs worker$ computations', async ({ page }) => {
    await expect(page.locator('#worker-result')).toHaveText('idle');

    await page.locator('#worker-run').click();

    await expect(page.locator('#worker-result')).toHaveText('21');
  });

  test('serializes submit events to FormData for worker$', async ({ page }) => {
    await expect(page.locator('#worker-form-result')).toHaveText('idle');

    await page.locator('#worker-submit').click();

    await expect(page.locator('#worker-form-result')).toHaveText(
      '{"name":"Ada","tags":["math","logic"]}'
    );
  });
});
