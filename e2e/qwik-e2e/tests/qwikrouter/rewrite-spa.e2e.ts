import { expect, test } from '@playwright/test';

const pretty = '/qwikrouter-test/rewrite-spa/pretty/';
const target = '/qwikrouter-test/rewrite-spa/target/';

test.describe('rewrite to a different route', () => {
  test('SSR serves the target page under the original URL', async ({ page }) => {
    const response = await page.goto(pretty);
    expect(response?.status()).toBe(200);
    await expect(page.locator('#rewrite-spa-target')).toBeVisible();
    await expect(page.locator('#rewrite-spa-original')).toHaveText(pretty);
    await expect(page.locator('#rewrite-spa-served')).toHaveText(target);
  });

  test('SPA navigation renders the target and keeps the URL, without a reload', async ({
    page,
  }) => {
    const pageErrors: Error[] = [];
    page.on('pageerror', (err) => pageErrors.push(err));
    await page.goto('/qwikrouter-test/rewrite-spa/');
    await page.evaluate(() => ((window as any).__noReload = true));

    await page.locator('[data-test-link="rewrite-spa-pretty"]').click();

    await expect(page.locator('#rewrite-spa-target')).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`${pretty}$`));
    await expect(page.locator('#rewrite-spa-original')).toHaveText(pretty);
    await expect(page.locator('#rewrite-spa-served')).toHaveText(target);
    expect(await page.evaluate(() => (window as any).__noReload)).toBe(true);
    expect(pageErrors).toEqual([]);
  });
});
