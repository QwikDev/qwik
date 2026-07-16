import { test, expect } from '@playwright/test';

test.describe('Sandbox smoke tests', () => {
  test('counter example page loads', async ({ page }) => {
    await page.goto('/examples/reactivity/counter/');
    await expect(page).toHaveTitle(/Counter/);
  });

  test.describe('REPL interactive', () => {
    test('counter click works in REPL', async ({ page }) => {
      await page.goto('/examples/reactivity/counter/');

      // The REPL renders the app inside a single iframe
      const replFrame = page.locator('iframe').contentFrame();

      const countValue = replFrame.locator('main>p').first();
      const clickButton = replFrame.getByRole('button', { name: 'Click' });

      await expect(countValue).toHaveText('Count: 0', { timeout: 30_000 });
      await clickButton.click();
      await expect(countValue).toHaveText('Count: 1');
    });
  });
});
