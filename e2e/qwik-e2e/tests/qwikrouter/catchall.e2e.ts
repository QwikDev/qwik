import { expect, test } from '@playwright/test';

test.describe('Qwik Router Catchall', () => {
  test.describe('mpa', () => {
    test.use({ javaScriptEnabled: false });
    tests();
  });
  test.describe('spa', () => {
    test.use({ javaScriptEnabled: true });
    tests();
    test('SPA navigation rerenders content for layout catchall route loaders', async ({
      context,
    }) => {
      const page = await context.newPage();
      const response = (await page.goto('/qwikrouter-test/layout-loader-catchall/'))!;
      const status = response.status();
      expect(status).toBe(200);

      await expect(page).toHaveTitle('Mock Home Loader Page - Qwik');
      await expect(page.locator('#layout-loader-catchall-content')).toHaveText(
        'Mock home content from loader'
      );
      await expect(page.locator('#layout-loader-catchall-pathname')).toHaveText(
        '/qwikrouter-test/layout-loader-catchall/'
      );

      await page.locator('#layout-loader-catchall-detail').click();
      await expect(page).toHaveURL('/qwikrouter-test/layout-loader-catchall/mock-detail/');
      await expect(page).toHaveTitle('Mock Detail Loader Page - Qwik');
      await expect(page.locator('#layout-loader-catchall-content')).toHaveText(
        'Mock detail content from loader'
      );
      await expect(page.locator('#layout-loader-catchall-pathname')).toHaveText(
        '/qwikrouter-test/layout-loader-catchall/mock-detail/'
      );

      await page.locator('#layout-loader-catchall-logo').click();
      await expect(page).toHaveURL('/qwikrouter-test/layout-loader-catchall/');
      await expect(page.locator('#layout-loader-catchall-content')).toHaveText(
        'Mock home content from loader'
      );
      await expect(page.locator('#layout-loader-catchall-pathname')).toHaveText(
        '/qwikrouter-test/layout-loader-catchall/'
      );
      await expect(page).toHaveTitle('Mock Home Loader Page - Qwik');
    });
  });
});

function tests() {
  test('Handled Catchall', async ({ context }) => {
    const page = await context.newPage();
    const response = (await page.goto('/qwikrouter-test/catchall/'))!;
    const status = response.status();
    expect(status).toBe(200);
    await expect(page.locator('[data-test-params="catchall"]')).toHaveText('catchall');
  });

  test('Aborted Catchall', async ({ context }) => {
    const page = await context.newPage();
    const response = (await page.goto('/qwikrouter-test/catchall-abort/'))!;
    const status = response.status();
    expect(status).toBe(404);
  });

  test('Error Catchall', async ({ context }) => {
    const page = await context.newPage();
    const response = (await page.goto('/qwikrouter-test/catchall-error/'))!;
    const status = response.status();
    expect(status).toBe(500);
  });
}
