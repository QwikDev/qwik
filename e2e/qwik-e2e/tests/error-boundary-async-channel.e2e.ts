import { expect, test } from '@playwright/test';

// Pins the loader contract on async signals: `.error` is the handled channel (boundary stays
// inert); reading `.value` re-throws to the <ErrorBoundary>.
test.describe('ErrorBoundary × async-signal .error channel', () => {
  test('async error read via `.error` is handled inline — the boundary stays inert', async ({
    page,
  }) => {
    await page.goto('/e2e/error-boundary-streaming?scenario=async-error-inline', {
      waitUntil: 'commit',
    });

    await expect(page.locator('#async-error')).toHaveText('handled: expected-async-error', {
      timeout: 10000,
    });
    // the error went into `.error`, NOT the boundary
    await expect(page.locator('#eb-fallback')).toHaveCount(0);
  });

  test('async error read via `.value` propagates → caught by the ErrorBoundary', async ({
    page,
  }) => {
    await page.goto('/e2e/error-boundary-streaming?scenario=async-error-throw', {
      waitUntil: 'commit',
    });

    await expect(page.locator('#eb-fallback-msg')).toHaveText('caught: An error occurred', {
      timeout: 10000,
    });
    await expect(page.locator('#async-value')).toHaveCount(0);
  });
});
