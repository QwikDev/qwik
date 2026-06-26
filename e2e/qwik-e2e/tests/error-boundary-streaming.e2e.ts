import { test, expect, type Page } from '@playwright/test';

const assertNoBrowserErrors = (page: Page) => {
  page.on('pageerror', (err) => expect(err).toEqual(undefined));
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      expect(msg.text()).toEqual(undefined);
    }
  });
};

const releaseDeferred = async (page: Page, selector: string) => {
  const releaseButton = page.locator(selector);
  await expect(releaseButton).toBeVisible();
  const releaseUrl = await releaseButton.getAttribute('data-release-url');
  expect(releaseUrl).not.toBeNull();
  const response = await page.request.post(new URL(releaseUrl!, page.url()).toString());
  expect(response.ok()).toBeTruthy();
};

test.describe('ErrorBoundary streaming swap', () => {
  // ── happy path ──
  test('happy path: content interactive after resume, no fallback or swap script, then catches a client throw', async ({
    page,
  }) => {
    const response = await page.goto('/e2e/error-boundary-streaming?scenario=happy', {
      waitUntil: 'commit',
    });
    const html = await response!.text();
    // No throw means neither swap-script flavor is shipped in the SSR HTML.
    expect(html).not.toMatch(/qErr\(|qInstallErrorSwap|qO\(|qInstallOOOS/);

    await expect(page.locator('#eb-content')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#eb-fallback')).toHaveCount(0);

    await page.locator('#eb-content-button').click();
    await expect(page.locator('#eb-content-count')).toHaveText('1');

    await page.locator('#eb-content-throw').click();
    await expect(page.locator('#eb-fallback')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#eb-content')).toBeHidden();
    await page.locator('#eb-fallback-button').click();
    await expect(page.locator('#eb-fallback-count')).toHaveText('1');
  });

  // ── SSR-time swaps (simplest → most complex) ──
  // In-order streaming swaps with a plain inline `qErr`, no OOOS machinery.
  test('in-order sync throw: qErr swap (no OOOS), fallback interactive', async ({ page }) => {
    assertNoBrowserErrors(page);
    await page.goto('/e2e/error-boundary-streaming?outOfOrder=false', { waitUntil: 'commit' });

    await expect(page.locator('#eb-title')).toHaveText('EB Streaming', { timeout: 10000 });
    await expect(page.locator('#eb-footer')).toHaveText('Footer shell', { timeout: 10000 });

    await expect(page.locator('#eb-fallback')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#eb-fallback-msg')).toHaveText('caught: eb sync boom');
    await expect(page.locator('#eb-content')).toBeHidden();

    await page.locator('#eb-fallback-button').click();
    await expect(page.locator('#eb-fallback-count')).toHaveText('1');
  });

  test('sync throw: streams the shell, swaps to the fallback, keeps it interactive', async ({
    page,
  }) => {
    assertNoBrowserErrors(page);
    await page.goto('/e2e/error-boundary-streaming', { waitUntil: 'commit' });

    // The boundary never blocks streaming: content after it still renders.
    await expect(page.locator('#eb-title')).toHaveText('EB Streaming', { timeout: 10000 });
    await expect(page.locator('#eb-footer')).toHaveText('Footer shell', { timeout: 10000 });

    await expect(page.locator('#eb-fallback')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#eb-fallback-msg')).toHaveText('caught: eb sync boom');
    await expect(page.locator('#eb-content')).toBeHidden();

    await page.locator('#eb-fallback-button').click();
    await expect(page.locator('#eb-fallback-count')).toHaveText('1');
  });

  // A boundary inside a deferred Suspense swaps via a `qErr(id)` hoisted to the root after the
  // segment's `qO`.
  test('boundary inside a deferred <Suspense>: hoisted qErr swap, fallback interactive', async ({
    page,
  }) => {
    assertNoBrowserErrors(page);
    await page.goto('/e2e/error-boundary-streaming?scenario=suspense', { waitUntil: 'commit' });

    await expect(page.locator('#eb-title')).toHaveText('EB Streaming', { timeout: 10000 });
    await expect(page.locator('#eb-footer')).toHaveText('Footer shell', { timeout: 10000 });

    await expect(page.locator('#eb-deferred-ok')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#eb-fallback')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#eb-fallback-msg')).toHaveText('caught: eb sync boom');
    await expect(page.locator('#eb-content')).toBeHidden();

    await page.locator('#eb-fallback-button').click();
    await expect(page.locator('#eb-fallback-count')).toHaveText('1');
  });

  test('async deferred throw: streams siblings + skeleton, then tears down the whole boundary', async ({
    page,
  }) => {
    assertNoBrowserErrors(page);
    await page.goto('/e2e/error-boundary-streaming?scenario=async&release=eb', {
      waitUntil: 'commit',
    });

    // The boundary does not wait on the deferred child: everything streams immediately.
    await expect(page.locator('#eb-title')).toHaveText('EB Streaming', { timeout: 10000 });
    await expect(page.locator('#eb-sibling')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#eb-skel')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#eb-footer')).toHaveText('Footer shell', { timeout: 10000 });
    await expect(page.locator('#eb-fallback')).toHaveCount(0);

    await releaseDeferred(page, '#eb-release');

    // The already-streamed sibling is torn down too, not just the Suspense.
    await expect(page.locator('#eb-fallback')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#eb-fallback-msg')).toHaveText('caught: eb async boom');
    await expect(page.locator('#eb-sibling')).toBeHidden();

    await page.locator('#eb-fallback-button').click();
    await expect(page.locator('#eb-fallback-count')).toHaveText('1');
  });

  test('inert: a swapped-out content task does not re-run when an outside signal changes', async ({
    page,
  }) => {
    assertNoBrowserErrors(page);
    await page.goto('/e2e/error-boundary-streaming?scenario=inert', { waitUntil: 'commit' });

    await expect(page.locator('#eb-fallback')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#eb-content')).toBeHidden();

    expect(await page.evaluate(() => (window as any).__ebDeadTaskClientRuns ?? 0)).toBe(0);

    // Bump a signal from outside the boundary; the outside binding reacting proves reactivity is live.
    await page.locator('#eb-inert-trigger').click();
    await expect(page.locator('#eb-inert-val')).toHaveText('1');

    // The swapped-out content's task must not re-run on the client.
    expect(await page.evaluate(() => (window as any).__ebDeadTaskClientRuns ?? 0)).toBe(0);
  });

  // ── client-time errors after resume ──
  // After resume `fallback$` is a lazy QRL, so the client re-render must resolve it instead of
  // calling it synchronously, and a throwing fallback render must not loop.
  test('client-time throw after resume re-renders the boundary to its fallback (in-order)', async ({
    page,
  }) => {
    await page.goto('/e2e/error-boundary-streaming?scenario=client&outOfOrder=false', {
      waitUntil: 'commit',
    });

    await expect(page.locator('#eb-content')).toHaveText('content ok', { timeout: 10000 });
    await expect(page.locator('#eb-fallback')).toHaveCount(0);

    await page.locator('#eb-client-throw').click();
    await expect(page.locator('#eb-fallback')).toBeVisible({ timeout: 10000 });

    await page.locator('#eb-fallback-button').click();
    await expect(page.locator('#eb-fallback-count')).toHaveText('1');
  });

  // With OOOS the fallback host holds only an empty `qO` placeholder, so the re-render must render
  // the fallback fresh rather than just revealing the empty host.
  test('client-time throw after resume re-renders the boundary to its fallback (out-of-order)', async ({
    page,
  }) => {
    await page.goto('/e2e/error-boundary-streaming?scenario=client', {
      waitUntil: 'commit',
    });

    await expect(page.locator('#eb-content')).toHaveText('content ok', { timeout: 10000 });
    await expect(page.locator('#eb-fallback')).toHaveCount(0);

    await page.locator('#eb-client-throw').click();
    await expect(page.locator('#eb-fallback')).toBeVisible({ timeout: 10000 });

    await page.locator('#eb-fallback-button').click();
    await expect(page.locator('#eb-fallback-count')).toHaveText('1');
  });

  // ── onError$ ──
  test('onError$ fires once with the error on a client-time throw', async ({ page }) => {
    await page.goto('/e2e/error-boundary-streaming?scenario=onerror', { waitUntil: 'commit' });

    await expect(page.locator('#eb-content')).toHaveText('content ok', { timeout: 10000 });
    await page.locator('#eb-onerror-throw').click();

    await expect(page.locator('#eb-fallback')).toBeVisible({ timeout: 10000 });
    await page.waitForFunction(() => (window as any).__ebOnErrorRuns >= 1);
    // `waitForFunction(=== 1)` resolves on first-true and can't see a later double-fire, so settle
    // then assert the count is exactly 1.
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => (window as any).__ebOnErrorRuns)).toBe(1);
    expect(await page.evaluate(() => (window as any).__ebOnErrorMsg)).toBe('onerror boom');
  });

  // ── cross-phase & multi-boundary ──
  test('SSR inner error, then a client throw makes the outer boundary replace the whole subtree', async ({
    page,
  }) => {
    await page.goto('/e2e/error-boundary-streaming?scenario=nested', { waitUntil: 'commit' });

    await expect(page.locator('#eb-inner')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#eb-inner-msg')).toHaveText('caught: eb sync boom');
    await expect(page.locator('#eb-outer')).toHaveCount(0);

    await page.locator('#eb-outer-throw').click();

    // The outer fallback replaces the whole subtree, including the resumed inner fallback.
    await expect(page.locator('#eb-outer')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#eb-inner')).toHaveCount(0);
    await page.locator('#eb-outer-button').click();
    await expect(page.locator('#eb-outer-count')).toHaveText('1');
  });

  // A fallback that itself throws during SSR escalates to the enclosing boundary, whose fallback
  // must render over the whole subtree AND resume interactive (parity with CSR).
  test('in-order: a throwing inner fallback escalates to the outer boundary, fallback interactive', async ({
    page,
  }) => {
    assertNoBrowserErrors(page);
    await page.goto('/e2e/error-boundary-streaming?scenario=throw-fallback&outOfOrder=false', {
      waitUntil: 'commit',
    });

    await expect(page.locator('#eb-title')).toHaveText('EB Streaming', { timeout: 10000 });
    await expect(page.locator('#eb-outer')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#eb-outer-msg')).toHaveText('caught: inner fallback boom');
    // The whole inner subtree (its content + empty fallback) is swapped out by the outer.
    await expect(page.locator('#eb-content')).toBeHidden();

    await page.locator('#eb-outer-button').click();
    await expect(page.locator('#eb-outer-count')).toHaveText('1');
  });

  test('out-of-order: a throwing inner fallback escalates to the outer boundary, fallback interactive', async ({
    page,
  }) => {
    assertNoBrowserErrors(page);
    await page.goto('/e2e/error-boundary-streaming?scenario=throw-fallback', {
      waitUntil: 'commit',
    });

    await expect(page.locator('#eb-title')).toHaveText('EB Streaming', { timeout: 10000 });
    await expect(page.locator('#eb-outer')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#eb-outer-msg')).toHaveText('caught: inner fallback boom');
    await expect(page.locator('#eb-content')).toBeHidden();

    await page.locator('#eb-outer-button').click();
    await expect(page.locator('#eb-outer-count')).toHaveText('1');
  });

  // ── no enclosing boundary ──
  // A client error with no enclosing ErrorBoundary must still reach the global error handler
  // (window.onerror / monitoring), not be silently swallowed to the console.
  test('no boundary: a client throw still surfaces to the global error handler', async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.goto('/e2e/error-boundary-streaming?scenario=no-boundary', { waitUntil: 'commit' });
    await expect(page.locator('#eb-title')).toHaveText('EB Streaming', { timeout: 10000 });

    // Click routes the throw through qwikloader → qerror → handleError; touched proves it resumed.
    await page.locator('#eb-no-boundary-throw').click();
    await expect(page.locator('#eb-no-boundary-touched')).toHaveText('1', { timeout: 10000 });

    await expect.poll(() => pageErrors, { timeout: 10000 }).toContain('no-boundary boom');
  });
});

// Only a real browser exercises the resumed reset handler + projection re-supply.
test.describe('ErrorBoundary reset', () => {
  test('in-order SSR resume: reset re-executes the children and recovers', async ({ page }) => {
    await page.goto('/e2e/error-boundary-streaming?scenario=reset&outOfOrder=false', {
      waitUntil: 'commit',
    });
    await expect(page.locator('#eb-fallback')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#eb-content')).toBeHidden();

    await page.locator('#eb-reset').click();

    // Inert content dropped; children re-execute client-side (no re-throw).
    await expect(page.locator('#eb-content')).toHaveCount(1, { timeout: 10000 });
    await expect(page.locator('#eb-content')).toBeVisible();
    // Empty marker span: the child threw only on the server.
    await expect(page.locator('#eb-thrower-client')).toBeAttached();
    await expect(page.locator('#eb-fallback')).toHaveCount(0);

    await page.locator('#eb-content-button').click();
    await expect(page.locator('#eb-content-count')).toHaveText('1');
  });

  test('out-of-order SSR resume: reset re-executes the children and recovers', async ({ page }) => {
    await page.goto('/e2e/error-boundary-streaming?scenario=reset', { waitUntil: 'commit' });
    await expect(page.locator('#eb-fallback')).toBeVisible({ timeout: 10000 });

    await page.locator('#eb-reset').click();

    await expect(page.locator('#eb-content')).toHaveCount(1, { timeout: 10000 });
    await expect(page.locator('#eb-content')).toBeVisible();
    // Empty marker span: the child threw only on the server.
    await expect(page.locator('#eb-thrower-client')).toBeAttached();
    await expect(page.locator('#eb-fallback')).toHaveCount(0);

    await page.locator('#eb-content-button').click();
    await expect(page.locator('#eb-content-count')).toHaveText('1');
  });

  test('client error: reset re-supplies the content interactively', async ({ page }) => {
    await page.goto('/e2e/error-boundary-streaming?scenario=reset-csr', { waitUntil: 'commit' });
    await expect(page.locator('#eb-content')).toBeVisible({ timeout: 10000 });

    // Touch state so the container resumes before the client throw routes.
    await page.locator('#eb-content-button').click();
    await expect(page.locator('#eb-content-count')).toHaveText('1');

    await page.locator('#eb-csr-throw').click();
    await expect(page.locator('#eb-fallback')).toBeVisible({ timeout: 10000 });

    await page.locator('#eb-reset').click();

    await expect(page.locator('#eb-content')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#eb-fallback')).toHaveCount(0);

    // Fresh content, interactive again.
    await page.locator('#eb-content-button').click();
    await expect(page.locator('#eb-content-count')).toHaveText('1');
  });
});
