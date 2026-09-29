import { expect, test } from '@playwright/test';

test('basic router app stays paused after initialization', async ({ page }) => {
  await page.addInitScript(() => {
    const win = window as Window & { didQwikResume?: boolean };
    win.didQwikResume = false;
    document.addEventListener('qresume', () => {
      win.didQwikResume = true;
    });
  });

  await page.goto('/qwikrouter-test.prod/', { waitUntil: 'networkidle' });

  await expect(page.locator('html')).toHaveAttribute('q:container', 'paused');
  expect(
    await page.evaluate(() => (window as Window & { didQwikResume?: boolean }).didQwikResume)
  ).toBe(false);
});
