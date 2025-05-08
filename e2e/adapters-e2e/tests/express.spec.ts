import { expect, test } from '@playwright/test';

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
});
