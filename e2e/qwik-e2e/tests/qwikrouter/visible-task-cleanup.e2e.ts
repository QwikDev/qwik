import { expect, test } from '@playwright/test';

declare global {
  interface Window {
    __visibleTaskCleanupLog: string[];
  }
}

test.describe('visible task cleanup on route change', () => {
  test.use({ javaScriptEnabled: true });

  test('runs while an async task of the removed component is still pending', async ({ page }) => {
    await page.goto('/qwikrouter-test/visible-task-cleanup/');
    const readLog = () => page.evaluate(() => window.__visibleTaskCleanupLog ?? []);
    await expect.poll(readLog).toEqual(['visible task: ran', 'async task: pending']);

    await page.locator('#leave').click();
    await expect(page.locator('#other')).toBeVisible();

    // The async task never settles, the cleanup must not wait for it.
    await expect.poll(readLog).toContain('visible task: cleanup');
  });
});
