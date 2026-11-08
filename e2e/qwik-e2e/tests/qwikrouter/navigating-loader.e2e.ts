import { expect, test } from '@playwright/test';

test.describe('isNavigating during a navigation that reuses the route component', () => {
  test('stays true until the new loader data renders', async ({ page }) => {
    await page.goto('/qwikrouter-test/navigating-loader/a/');
    const state = page.locator('#navigating-loader-state');
    const content = page.locator('#navigating-loader-content');
    await expect(content).toHaveText('Content for a');

    // Record every DOM change: once navigating, the state must not go idle while the old content shows.
    await page.evaluate(() => {
      const w = window as any;
      w.__sawNavigating = false;
      w.__idleWithOldContent = false;
      new MutationObserver(() => {
        const s = document.querySelector('#navigating-loader-state')?.textContent;
        const c = document.querySelector('#navigating-loader-content')?.textContent;
        if (s === 'navigating') {
          w.__sawNavigating = true;
        } else if (w.__sawNavigating && c === 'Content for a') {
          w.__idleWithOldContent = true;
        }
      }).observe(document.body, { subtree: true, childList: true, characterData: true });
    });

    await page.locator('#navigating-loader-link').click();
    await expect(content).toHaveText('Content for b');
    await expect(state).toHaveText('idle');
    expect(await page.evaluate(() => (window as any).__sawNavigating)).toBe(true);
    expect(await page.evaluate(() => (window as any).__idleWithOldContent)).toBe(false);
  });
});
