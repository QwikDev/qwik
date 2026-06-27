import { expect, test } from '@playwright/test';

// The async-signal `.error` channel vs the <ErrorBoundary>. Loaders are being refactored onto async
// signals (useAsync$), so this pins the contract:
//   - an async error CAPTURED into `.error` is the EXPECTED channel → handled inline, boundary inert.
//   - an error that PROPAGATES (read via `.value`, or any unexpected throw) → caught by <ErrorBoundary>.
// A loader maps onto this: a ServerError is surfaced via `.error` (handled), an unexpected error
// propagates to the boundary.
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

    await expect(page.locator('#eb-fallback-msg')).toHaveText('caught: unexpected-async-error', {
      timeout: 10000,
    });
    await expect(page.locator('#async-value')).toHaveCount(0);
  });
});
