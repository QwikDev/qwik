import { expect, test } from '@playwright/test';

const VIEW_TRANSITION_STYLE = 'style#qwik-view-transition';

test.describe('view transitions', () => {
  test.use({ javaScriptEnabled: true });

  test('injects the stylesheet lazily on SPA nav when enabled', async ({ page }) => {
    await page.goto('/qwikrouter-test/?viewtransition=1');
    const style = page.locator(VIEW_TRANSITION_STYLE);

    // Opt-in apps still ship nothing at load; the CSS arrives only when a transition runs.
    await expect(style).toHaveCount(0);

    await page.locator('[data-test-link="docs-home"]').click();
    await expect(page).toHaveURL(/\/qwikrouter-test\/docs\/$/);

    await expect(style).toHaveCount(1);
  });

  test('never injects the stylesheet when disabled (default)', async ({ page }) => {
    await page.goto('/qwikrouter-test/');

    await page.locator('[data-test-link="docs-home"]').click();
    await expect(page).toHaveURL(/\/qwikrouter-test\/docs\/$/);

    await expect(page.locator(VIEW_TRANSITION_STYLE)).toHaveCount(0);
  });
});
