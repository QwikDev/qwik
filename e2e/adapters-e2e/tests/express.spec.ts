import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  page.on('console', (msg) => {
    // eslint-disable-next-line no-console
    console.log(`[browser ${msg.type()}] ${msg.text()}`);
  });
});

test.describe('Verifying Express Adapter', () => {
  test('should ignore unknown qdata', async ({ page, request }) => {
    page.goto('/');

    const response = await request.post('/?qfunc=ThisDoesNotExist', {
      headers: {
        'X-Qrl': 'ThisDoesNotExist',
        'Content-Type': 'application/qwik-json',
      },
      data: {
        _entry: '2',
        _objs: ['\u0002_#s_ThisDoesNotExist', 1, ['0', '1']],
      },
    });

    await expect(response.status()).toBe(500);

    // Verify server is still responsive by making another request
    const healthCheck = await request.get('/');
    await expect(healthCheck.ok()).toBeTruthy();

    await page.getByRole('link', { name: 'go to profile' }).click();

    await expect(page.getByRole('heading', { name: 'Profile page' })).toBeVisible();
  });

  test('should load loaders context in minified prod mode', async ({ page }) => {
    page.goto('/loaders');
    const subpageLink = page.locator('#subpage-link');
    await expect(subpageLink).toBeVisible();

    await subpageLink.click();

    await expect(page.getByRole('heading', { name: 'Sub page' })).toBeVisible();
    await expect(page.locator('#subpage-loader-value')).toHaveText('42');
  });
});
