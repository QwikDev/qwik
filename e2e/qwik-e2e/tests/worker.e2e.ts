import { expect, test } from '@playwright/test';

test.describe.only('worker$', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/e2e/worker');
    page.on('pageerror', (err) => expect(err).toEqual(undefined));
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        expect(msg.text()).toEqual(undefined);
      }
    });
  });

  test('should execute worker on server', async ({ page }) => {
    await expect(page.locator('#worker-server-result')).toHaveText('hello from worker');
  });

  test('should execute worker functions and sanitize event inputs', async ({ page }) => {
    await expect(page.locator('#worker-add-result')).toHaveText('0');
    await expect(page.locator('#worker-event-result')).toHaveText('pending');
    await expect(page.locator('#worker-form-result')).toHaveText('pending');

    await page.locator('#worker-add').click();
    await expect(page.locator('#worker-add-result')).toHaveText('1');

    await page.locator('#worker-event').click();
    await expect(page.locator('#worker-event-result')).toHaveText('null');

    await page.locator('#worker-form-submit').click();
    await expect(page.locator('#worker-form-result')).toHaveText('qwik:2');
  });
});
