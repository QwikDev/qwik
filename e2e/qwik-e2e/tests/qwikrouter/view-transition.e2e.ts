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

  test('excludes the document root during SPA view transitions', async ({ page }) => {
    await page.goto('/qwikrouter-test/?viewtransition=1');
    test.skip(
      !(await page.evaluate(() => 'startViewTransition' in document)),
      'This browser does not implement view transitions.'
    );
    await page.waitForFunction(() => (window as any)._qwikEv?.roots);

    await page.evaluate(() => {
      document.addEventListener(
        'qviewtransition',
        (event) => {
          const transition = (event as CustomEvent<ViewTransition>).detail;
          void transition.ready.then(() => {
            const root = document.documentElement;
            root.dataset.transitionRoot = getComputedStyle(root).viewTransitionName;
          });
        },
        { once: true }
      );
    });

    await page.locator('[data-test-link="docs-home"]').click();
    await expect(page).toHaveURL(/\/qwikrouter-test\/docs\/$/);
    const root = page.locator('html');
    await expect(root).toHaveAttribute('data-transition-root', /.+/);
    expect(await root.getAttribute('data-transition-root')).toBe('none');
  });
});
