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
  test('in-order sync throw: qErr swap (no OOOS), fallback interactive', async ({ page }) => {
    assertNoBrowserErrors(page);
    await page.goto('/e2e/error-boundary-streaming?outOfOrder=false', { waitUntil: 'commit' });

    await expect(page.locator('#eb-title')).toHaveText('EB Streaming', { timeout: 10000 });
    await expect(page.locator('#eb-footer')).toHaveText('Footer shell', { timeout: 10000 });

    await expect(page.locator('#eb-fallback')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#eb-fallback-msg')).toHaveText('caught: An error occurred');
    await expect(page.locator('#eb-content')).toBeHidden();

    await page.locator('#eb-fallback-button').click();
    await expect(page.locator('#eb-fallback-count')).toHaveText('1');
  });

  test('sync throw: streams the shell, swaps to the fallback, keeps it interactive', async ({
    page,
  }) => {
    assertNoBrowserErrors(page);
    await page.goto('/e2e/error-boundary-streaming', { waitUntil: 'commit' });

    await expect(page.locator('#eb-title')).toHaveText('EB Streaming', { timeout: 10000 });
    await expect(page.locator('#eb-footer')).toHaveText('Footer shell', { timeout: 10000 });

    await expect(page.locator('#eb-fallback')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#eb-fallback-msg')).toHaveText('caught: An error occurred');
    await expect(page.locator('#eb-content')).toBeHidden();

    await page.locator('#eb-fallback-button').click();
    await expect(page.locator('#eb-fallback-count')).toHaveText('1');
  });

  test('boundary inside a deferred <Suspense>: hoisted qErr swap, fallback interactive', async ({
    page,
  }) => {
    assertNoBrowserErrors(page);
    await page.goto('/e2e/error-boundary-streaming?scenario=suspense', { waitUntil: 'commit' });

    await expect(page.locator('#eb-title')).toHaveText('EB Streaming', { timeout: 10000 });
    await expect(page.locator('#eb-footer')).toHaveText('Footer shell', { timeout: 10000 });

    await expect(page.locator('#eb-deferred-ok')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#eb-fallback')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#eb-fallback-msg')).toHaveText('caught: An error occurred');
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

    await expect(page.locator('#eb-title')).toHaveText('EB Streaming', { timeout: 10000 });
    await expect(page.locator('#eb-sibling')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#eb-skel')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#eb-footer')).toHaveText('Footer shell', { timeout: 10000 });
    await expect(page.locator('#eb-fallback')).toHaveCount(0);

    await releaseDeferred(page, '#eb-release');

    await expect(page.locator('#eb-fallback')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#eb-fallback-msg')).toHaveText('caught: An error occurred');
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

    await page.locator('#eb-inert-trigger').click();
    await expect(page.locator('#eb-inert-val')).toHaveText('1');

    expect(await page.evaluate(() => (window as any).__ebDeadTaskClientRuns ?? 0)).toBe(0);
  });

  // ── client-time errors after resume ──
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

  test("onError$ info carries phase 'event' and a stable boundaryId for a real qwikloader throw", async ({
    page,
  }) => {
    await page.goto('/e2e/error-boundary-streaming?scenario=onerror', { waitUntil: 'commit' });

    await expect(page.locator('#eb-content')).toHaveText('content ok', { timeout: 10000 });
    await page.locator('#eb-onerror-throw').click();

    await expect(page.locator('#eb-fallback')).toBeVisible({ timeout: 10000 });
    await page.waitForFunction(() => (window as any).__ebOnErrorPhase !== undefined);
    // A throw from a real qwikloader-dispatched event handler routes through the live `qerror`
    // listener, so the 2nd-arg phase is 'event' — the unit suite fabricates the qerror and can't prove it.
    expect(await page.evaluate(() => (window as any).__ebOnErrorPhase)).toBe('event');
    expect(await page.evaluate(() => (window as any).__ebOnErrorBoundaryId)).toBeTruthy();
  });

  // ── cross-phase & multi-boundary ──
  test('SSR inner error, then a client throw makes the outer boundary replace the whole subtree', async ({
    page,
  }) => {
    await page.goto('/e2e/error-boundary-streaming?scenario=nested', { waitUntil: 'commit' });

    await expect(page.locator('#eb-inner')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#eb-inner-msg')).toHaveText('caught: An error occurred');
    await expect(page.locator('#eb-outer')).toHaveCount(0);

    await page.locator('#eb-outer-throw').click();

    await expect(page.locator('#eb-outer')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#eb-inner')).toHaveCount(0);
    await page.locator('#eb-outer-button').click();
    await expect(page.locator('#eb-outer-count')).toHaveText('1');
  });

  test('SSR nested: the outer supersedes an already-swapped inner fallback when both error server-side', async ({
    page,
  }) => {
    assertNoBrowserErrors(page);
    await page.goto('/e2e/error-boundary-streaming?scenario=nested-ssr', { waitUntil: 'commit' });

    await expect(page.locator('#eb-outer')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#eb-outer-msg')).toHaveText('caught: An error occurred');
    // The superseded inner fallback stays in the DOM, hidden inside the outer's inert content.
    await expect(page.locator('#eb-inner')).toBeHidden();

    await page.locator('#eb-outer-button').click();
    await expect(page.locator('#eb-outer-count')).toHaveText('1');
  });

  test('a real client throw inside the inner boundary is caught by the nearest (inner) boundary, outer intact', async ({
    page,
  }) => {
    await page.goto('/e2e/error-boundary-streaming?scenario=nested-client', {
      waitUntil: 'commit',
    });

    await expect(page.locator('#eb-content')).toHaveText('content ok', { timeout: 10000 });
    await expect(page.locator('#eb-outer-ok')).toBeVisible();
    await expect(page.locator('#eb-inner')).toHaveCount(0);

    await page.locator('#eb-inner-throw').click();

    // The closest boundary catches the real event-handler throw: inner swaps, outer stays intact.
    await expect(page.locator('#eb-inner')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#eb-outer')).toHaveCount(0);
    await expect(page.locator('#eb-outer-ok')).toBeVisible();
    await expect(page.locator('#eb-inner-msg')).toHaveText('caught: inner client boom');

    await page.locator('#eb-inner-button').click();
    await expect(page.locator('#eb-inner-count')).toHaveText('1');
  });

  test('in-order: a throwing inner fallback escalates to the outer boundary, fallback interactive', async ({
    page,
  }) => {
    assertNoBrowserErrors(page);
    await page.goto('/e2e/error-boundary-streaming?scenario=throw-fallback&outOfOrder=false', {
      waitUntil: 'commit',
    });

    await expect(page.locator('#eb-title')).toHaveText('EB Streaming', { timeout: 10000 });
    await expect(page.locator('#eb-outer')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#eb-outer-msg')).toHaveText('caught: An error occurred');
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
    await expect(page.locator('#eb-outer-msg')).toHaveText('caught: An error occurred');
    await expect(page.locator('#eb-content')).toBeHidden();

    await page.locator('#eb-outer-button').click();
    await expect(page.locator('#eb-outer-count')).toHaveText('1');
  });

  // ── no enclosing boundary ──
  test('no boundary: a client throw still surfaces to the global error handler', async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.goto('/e2e/error-boundary-streaming?scenario=no-boundary', { waitUntil: 'commit' });
    await expect(page.locator('#eb-title')).toHaveText('EB Streaming', { timeout: 10000 });

    await page.locator('#eb-no-boundary-throw').click();
    await expect(page.locator('#eb-no-boundary-touched')).toHaveText('1', { timeout: 10000 });

    await expect.poll(() => pageErrors, { timeout: 10000 }).toContain('no-boundary boom');
  });
});

test.describe('ErrorBoundary reset', () => {
  test('in-order SSR resume: reset re-executes the children and recovers', async ({ page }) => {
    await page.goto('/e2e/error-boundary-streaming?scenario=reset&outOfOrder=false', {
      waitUntil: 'commit',
    });
    await expect(page.locator('#eb-fallback')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#eb-content')).toBeHidden();

    await page.locator('#eb-reset').click();

    await expect(page.locator('#eb-content')).toHaveCount(1, { timeout: 10000 });
    await expect(page.locator('#eb-content')).toBeVisible();
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

    await page.locator('#eb-content-button').click();
    await expect(page.locator('#eb-content-count')).toHaveText('1');
  });

  // KNOWN BUG (see .planning/error-boundary-redesign-status.md "Known limit"): when a plain
  // <Slot>-projecting component wraps the <ErrorBoundary>, reset() re-renders the wrapper and
  // re-claims the children instead of re-executing them, so an async child never re-runs. The
  // owner must be the children's projection owner, not getParentHost(boundary). Remove `.fixme`
  // to drive the fix.
  test('reset re-executes async children through a Slot-projecting wrapper component', async ({
    page,
  }) => {
    await page.goto('/e2e/error-boundary-streaming?scenario=reset-wrapped', {
      waitUntil: 'commit',
    });
    await expect(page.locator('#eb-fallback')).toBeVisible({ timeout: 10000 });

    await page.locator('#eb-reset').click();

    // reset() must RE-EXECUTE the async child (re-create it), not re-claim the failed one.
    await expect(page.locator('#eb-wrap-recovered')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#eb-fallback')).toHaveCount(0);
  });

  // 2nd retry: an EB inside <Suspense> whose child re-errors once, so the SECOND reset() is a CLIENT
  // re-render of the boundary — the case the reset Suspense-climb targets.
  test('second reset re-executes children of an ErrorBoundary inside a Suspense (re-error then recover)', async ({
    page,
  }) => {
    await page.goto('/e2e/error-boundary-streaming?scenario=reset-reerror', {
      waitUntil: 'commit',
    });
    await expect(page.locator('#eb-fallback')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#eb-fallback-msg')).toContainText('An error occurred');

    // 1st reset: re-executes the child, which errors again on its first client run.
    await page.locator('#eb-reset').click();
    await expect(page.locator('#eb-fallback-msg')).toContainText('client boom 1', {
      timeout: 10000,
    });

    // 2nd reset: re-executes again; the child recovers on its second client run.
    await page.locator('#eb-reset').click();
    await expect(page.locator('#eb-reerror-recovered')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#eb-fallback')).toHaveCount(0);
  });

  // SPA-nav equivalent: an EB inside <Suspense> mounted CLIENT-FIRST (never SSR'd, so no serialized
  // $resetOwner$) — reset() must resolve the owner purely at runtime (getParentHost + Suspense-climb).
  test('reset re-executes children of a client-first (SPA-nav) ErrorBoundary inside a Suspense', async ({
    page,
  }) => {
    await page.goto('/e2e/error-boundary-streaming?scenario=reset-spa', { waitUntil: 'commit' });
    // The boundary is not rendered until the client mounts it (simulating navigation to this view).
    await expect(page.locator('#eb-spa-show')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#eb-fallback')).toHaveCount(0);

    await page.locator('#eb-spa-show').click();
    await expect(page.locator('#eb-fallback-msg')).toContainText('client boom 1', {
      timeout: 10000,
    });

    await page.locator('#eb-reset').click();
    await expect(page.locator('#eb-reerror-recovered')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#eb-fallback')).toHaveCount(0);
  });

  // STRESS TEST (key-swap exploration): a dev-owned `key` bump re-executes async children through a
  // Slot wrapper after an SSR error — the same wrapper shape as the test above, recovered via `key`.
  test('wrapper key-swap: key bump re-executes the async child through a Slot wrapper', async ({
    page,
  }) => {
    await page.goto('/e2e/error-boundary-streaming?scenario=reset-wrapped-key', {
      waitUntil: 'commit',
    });
    await expect(page.locator('#eb-fallback')).toBeVisible({ timeout: 10000 });
    await page.locator('#eb-reset').click();
    await expect(page.locator('#eb-wrap-recovered')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#eb-fallback')).toHaveCount(0);
  });
});

test.describe('ErrorBoundary last-resort & rejection bridge', () => {
  test('built-in last-resort node renders when the fallback$ chunk fails to load', async ({
    page,
  }) => {
    // Block only the lazily-loaded fallback QRL chunks under /build/ (both the inline `fallback$`
    // wrapper and the `EbFallback` component it imports contain "fallback" in the filename). Aborting
    // them makes `fallbackQrl()` reject without ever resolving → core renders the last-resort node.
    const blockedFallbackChunks: string[] = [];
    await page.route(/\/build\/[^?]*[Ff]allback[^?]*\.js/, (route) => {
      blockedFallbackChunks.push(route.request().url());
      return route.abort();
    });

    await page.goto('/e2e/error-boundary-streaming?scenario=last-resort', { waitUntil: 'commit' });

    await expect(page.locator('#eb-content')).toHaveText('content ok', { timeout: 10000 });
    await expect(page.locator('[role="alert"]')).toHaveCount(0);

    await page.locator('#eb-last-resort-throw').click();

    // The fallback chunk can't load, so the boundary shows the non-lazy core node instead of nothing.
    const lastResort = page.locator('[role="alert"]');
    await expect(lastResort).toBeVisible({ timeout: 10000 });
    await expect(lastResort).toHaveText('Something went wrong.');
    await expect(page.locator('#eb-fallback')).toHaveCount(0);
    expect(blockedFallbackChunks.length).toBeGreaterThan(0);

    // Shell stays interactive: the page itself never errored out.
    await expect(page.locator('#eb-title')).toHaveText('EB Streaming');
  });

  test('a fire-and-forget Promise.reject reaches logError via the unhandledrejection bridge', async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto('/e2e/error-boundary-streaming?scenario=unhandled-rejection', {
      waitUntil: 'commit',
    });
    await expect(page.locator('#eb-reject')).toBeVisible({ timeout: 10000 });

    // Touch state so the container resumes and the per-window bridge is registered before the reject.
    await page.locator('#eb-reject').click();
    await expect(page.locator('#eb-reject-touched')).toHaveText('1');

    // The bridge logs the rejection reason via `logError` (qTest is off in a real browser).
    await expect
      .poll(() => consoleErrors.join('\n'), { timeout: 10000 })
      .toContain('unhandled boom');
  });
});
