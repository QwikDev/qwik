import { expect, test } from '@playwright/test';

test.describe('worker$ SSR', () => {
  test.beforeEach(async ({ page }) => {
    page.on('pageerror', (err) => expect(err).toEqual(undefined));
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        expect(msg.text()).toEqual(undefined);
      }
    });
  });

  test('should execute worker$ on the server', async ({ page }) => {
    await page.goto('/worker');

    await expect(page.locator('#worker-server-result')).toHaveText('hello from worker');
  });
});
