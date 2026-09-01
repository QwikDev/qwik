import { expect, test } from '@playwright/test';

test.describe('qvisible', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/e2e/qvisible');
    page.on('pageerror', (err) => expect(err).toEqual(undefined));
  });

  test('should fire onQVisible$ when a server-rendered element scrolls into view', async ({
    page,
  }) => {
    const log = page.locator('#log');
    await expect(log).toHaveText('');
    await page.locator('#ssr-sentinel').scrollIntoViewIfNeeded();
    await expect(log).toHaveText('ssr-visible;');
  });

  test('should fire onQVisible$ when a client-rendered element scrolls into view', async ({
    page,
  }) => {
    const log = page.locator('#log');
    await page.locator('#show').click();
    const csrSentinel = page.locator('#csr-sentinel');
    await expect(csrSentinel).toHaveText('client-rendered sentinel');
    await expect(log).toHaveText('');
    await csrSentinel.scrollIntoViewIfNeeded();
    await expect(log).toHaveText('csr-visible;');
  });
});
