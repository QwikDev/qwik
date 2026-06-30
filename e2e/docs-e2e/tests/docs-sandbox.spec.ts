import { test, expect } from '@playwright/test';

test.describe('Sandbox smoke tests', () => {
  test('counter example page loads', async ({ page }) => {
    await page.goto('/examples/reactivity/counter/');
    await expect(page).toHaveTitle(/Counter/);
  });

  test.describe('REPL interactive', () => {
    // KNOWN ISSUE: the REPL's in-browser @rolldown/browser bundler never completes under the
    // migration — prod hangs mid-compile, dev fails loading @napi-rs/wasm-runtime/fs — so the app
    // never renders. Regression in the newer @rolldown/browser stack; docs-playground only
    // (core/router/SSG/SSR unaffected). Re-enable when the in-browser REPL bundler works again.
    test.fixme('counter click works in REPL', async ({ page }) => {
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
