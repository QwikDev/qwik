import { expect, test } from '@playwright/test';

test.describe('Qwik Router documentHead', () => {
  test('pass documentHead to Qwik', async ({ page }) => {
    await page.goto('/qwikrouter-test/');
    // injected title via renderToStream serverData
    await expect(page).toHaveTitle('Qwik Router Test - Qwik');
    const meta = page.locator("meta[name='hello']");
    await expect(meta).toHaveAttribute('content', 'world');
    expect(await page.evaluate(() => (window as any).hello)).toBe('world');
  });

  test('keeps the previous head when a SPA head function throws', async ({ page }) => {
    await page.goto('/qwikrouter-test/head-error/');
    await expect(page).toHaveTitle('Head error source - Qwik');
    await page.evaluate(() => ((window as any).__headErrorNavigation = 'spa'));

    await page.locator('#head-error-link').click();
    await expect(page).toHaveURL('/qwikrouter-test/head-error/crash/');
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        })
    );

    const headState = await page.evaluate(() => ({
      exists: document.head !== null,
      navigation: (window as any).__headErrorNavigation,
      title: document.title,
    }));
    if (!headState.exists) {
      throw new Error('DOCUMENT_HEAD_REMOVED: document.head is null after a SPA head error');
    }
    expect(headState).toEqual({
      exists: true,
      navigation: 'spa',
      title: 'Head error source - Qwik',
    });
    await expect(page.locator('#head-error-target')).toBeVisible();
  });
});
