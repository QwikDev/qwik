import { test, expect } from '@playwright/test';
import {
  assertNoBrowserErrors,
  releaseDeferred,
  streamingModes,
  streamingUrl,
} from './error-boundary-helpers';

test.describe('ErrorBoundary streaming swap', () => {
  // ── happy path ──
  test('happy path: content interactive after resume, no fallback or swap script, then catches a client throw', async ({
    page,
  }) => {
    assertNoBrowserErrors(page);
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
  for (const { mode, outOfOrder } of streamingModes) {
    test(`${mode} sync throw: streams the shell, swaps to the fallback, keeps it interactive`, async ({
      page,
    }) => {
      assertNoBrowserErrors(page);
      await page.goto(streamingUrl(null, outOfOrder), { waitUntil: 'commit' });

      await expect(page.locator('#eb-title')).toHaveText('EB Streaming', { timeout: 10000 });
      await expect(page.locator('#eb-footer')).toHaveText('Footer shell', { timeout: 10000 });

      await expect(page.locator('#eb-fallback')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('#eb-fallback-msg')).toHaveText('caught: An error occurred');
      await expect(page.locator('#eb-content')).toBeHidden();

      await page.locator('#eb-fallback-button').click();
      await expect(page.locator('#eb-fallback-count')).toHaveText('1');
    });
  }

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

  // Regression: unit passed but the browser aborted resume ("Missing refElement").
  test('qErr swap as a main-flow sibling of a live deferred <Suspense> segment stays interactive', async ({
    page,
  }) => {
    assertNoBrowserErrors(page);
    const response = await page.goto(`${streamingUrl('sibling-suspense', true)}&release=eb`, {
      waitUntil: 'commit',
    });

    await expect(page.locator('#eb-fallback')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#eb-fallback-msg')).toHaveText('caught: An error occurred');
    await expect(page.locator('#eb-content')).toBeHidden();
    await expect(page.locator('#eb-skel')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#eb-deferred-ok')).toHaveCount(0);

    await releaseDeferred(page, '#eb-release');

    await expect(page.locator('#eb-deferred-ok')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#eb-fallback')).toBeVisible();
    await expect(page.locator('#eb-content')).toBeHidden();

    await page.locator('#eb-fallback-button').click();
    await expect(page.locator('#eb-fallback-count')).toHaveText('1');

    // Safe only after release closed the stream.
    const html = await response!.text();
    expect(html).toMatch(/qErr\(/);
    expect(html).toMatch(/qO\(/);
    await expect(page.locator('[q\\:ebf] #eb-fallback')).toHaveCount(1);
    await expect(page.locator('[q\\:rp] #eb-fallback')).toHaveCount(0);
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
  for (const { mode, outOfOrder } of streamingModes) {
    test(`client-time throw after resume re-renders the boundary to its fallback (${mode})`, async ({
      page,
    }) => {
      assertNoBrowserErrors(page);
      await page.goto(streamingUrl('client', outOfOrder), { waitUntil: 'commit' });

      await expect(page.locator('#eb-content')).toHaveText('content ok', { timeout: 10000 });
      await expect(page.locator('#eb-fallback')).toHaveCount(0);

      await page.locator('#eb-client-throw').click();
      await expect(page.locator('#eb-fallback')).toBeVisible({ timeout: 10000 });

      await page.locator('#eb-fallback-button').click();
      await expect(page.locator('#eb-fallback-count')).toHaveText('1');
    });
  }

  test('in-order mid-stream click on a swapped fallback is queued and replayed after resume', async ({
    page,
    browserName,
  }) => {
    assertNoBrowserErrors(page);
    // WebKit buffers mid-stream inline scripts; pad or the qwikloader never runs.
    const webkitFlush = browserName === 'webkit' ? '&webkitFlush=1' : '';
    // 'auto' would buffer the swap while the gate pends, hiding it mid-stream.
    await page.goto(
      `${streamingUrl('midstream', false)}&release=eb&inOrderStrategy=direct${webkitFlush}`,
      {
        waitUntil: 'commit',
      }
    );

    await expect(page.locator('#eb-fallback')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#eb-fallback-msg')).toHaveText('caught: An error occurred');
    await expect(page.locator('#eb-deferred-ok')).toHaveCount(0);

    await page.waitForFunction(() => !!(window as any)._qwikEv?.roots);
    await expect(page.locator('html')).toHaveAttribute('q:container', 'paused');

    await page.locator('#eb-reset').click();
    await expect(page.locator('#eb-content')).toBeHidden();
    await expect(page.locator('#eb-fallback')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('q:container', 'paused');

    await releaseDeferred(page, '#eb-release');
    await page.waitForLoadState('load');

    await expect(page.locator('#eb-content')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#eb-thrower-client')).toBeAttached();
    await expect(page.locator('#eb-fallback')).toHaveCount(0);
    await expect(page.locator('#eb-deferred-ok')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('html')).toHaveAttribute('q:container', 'resumed');
  });

  test('useVisibleTask$ throw after resume is routed to the boundary without interaction', async ({
    page,
  }) => {
    // Caught task throw may console.error in dev; only pageerror escapes matter.
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.goto('/e2e/error-boundary-streaming?scenario=visible-task', {
      waitUntil: 'commit',
    });

    await expect(page.locator('#eb-fallback')).toBeVisible({ timeout: 10000 });
    // qDev client keeps the raw message, not the redacted form.
    await expect(page.locator('#eb-fallback-msg')).toHaveText('caught: visible boom');
    await expect(page.locator('#eb-content')).toBeHidden();

    await page.locator('#eb-fallback-button').click();
    await expect(page.locator('#eb-fallback-count')).toHaveText('1');

    await page.waitForTimeout(200);
    expect(pageErrors.filter((message) => message.includes('visible boom'))).toEqual([]);
  });

  // ── onError$ ──
  test('onError$ fires once with the error on a client-time throw', async ({ page }) => {
    assertNoBrowserErrors(page);
    await page.goto('/e2e/error-boundary-streaming?scenario=onerror', { waitUntil: 'commit' });

    await expect(page.locator('#eb-content')).toHaveText('content ok', { timeout: 10000 });
    await page.locator('#eb-onerror-throw').click();

    await expect(page.locator('#eb-fallback')).toBeVisible({ timeout: 10000 });
    await page.waitForFunction(() => (window as any).__ebOnErrorRuns >= 1);
    // waitForFunction(>=1) can't see a later double-fire; settle then assert.
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => (window as any).__ebOnErrorRuns)).toBe(1);
    expect(await page.evaluate(() => (window as any).__ebOnErrorMsg)).toBe('onerror boom');
  });

  test("onError$ info carries phase 'event' and a stable boundaryId for a real qwikloader throw", async ({
    page,
  }) => {
    assertNoBrowserErrors(page);
    await page.goto('/e2e/error-boundary-streaming?scenario=onerror', { waitUntil: 'commit' });

    await expect(page.locator('#eb-content')).toHaveText('content ok', { timeout: 10000 });
    await page.locator('#eb-onerror-throw').click();

    await expect(page.locator('#eb-fallback')).toBeVisible({ timeout: 10000 });
    await page.waitForFunction(() => (window as any).__ebOnErrorPhase !== undefined);
    expect(await page.evaluate(() => (window as any).__ebOnErrorPhase)).toBe('event');
    expect(await page.evaluate(() => (window as any).__ebOnErrorBoundaryId)).toBeTruthy();
  });

  // ── cross-phase & multi-boundary ──
  test('SSR inner error, then a client throw makes the outer boundary replace the whole subtree', async ({
    page,
  }) => {
    assertNoBrowserErrors(page);
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
    // Superseded inner fallback stays hidden inside the outer's inert content.
    await expect(page.locator('#eb-inner')).toBeHidden();

    await page.locator('#eb-outer-button').click();
    await expect(page.locator('#eb-outer-count')).toHaveText('1');
  });

  test('a real client throw inside the inner boundary is caught by the nearest (inner) boundary, outer intact', async ({
    page,
  }) => {
    assertNoBrowserErrors(page);
    await page.goto('/e2e/error-boundary-streaming?scenario=nested-client', {
      waitUntil: 'commit',
    });

    await expect(page.locator('#eb-content')).toHaveText('content ok', { timeout: 10000 });
    await expect(page.locator('#eb-outer-ok')).toBeVisible();
    await expect(page.locator('#eb-inner')).toHaveCount(0);

    await page.locator('#eb-inner-throw').click();

    await expect(page.locator('#eb-inner')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#eb-outer')).toHaveCount(0);
    await expect(page.locator('#eb-outer-ok')).toBeVisible();
    await expect(page.locator('#eb-inner-msg')).toHaveText('caught: inner client boom');

    await page.locator('#eb-inner-button').click();
    await expect(page.locator('#eb-inner-count')).toHaveText('1');
  });

  for (const { mode, outOfOrder } of streamingModes) {
    test(`${mode}: a throwing inner fallback escalates to the outer boundary, fallback interactive`, async ({
      page,
    }) => {
      assertNoBrowserErrors(page);
      await page.goto(streamingUrl('throw-fallback', outOfOrder), { waitUntil: 'commit' });

      await expect(page.locator('#eb-title')).toHaveText('EB Streaming', { timeout: 10000 });
      await expect(page.locator('#eb-outer')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('#eb-outer-msg')).toHaveText('caught: An error occurred');
      await expect(page.locator('#eb-content')).toBeHidden();

      await page.locator('#eb-outer-button').click();
      await expect(page.locator('#eb-outer-count')).toHaveText('1');
    });
  }

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
  for (const { mode, outOfOrder } of streamingModes) {
    test(`${mode} SSR resume: reset re-executes the children and recovers`, async ({ page }) => {
      assertNoBrowserErrors(page);
      await page.goto(streamingUrl('reset', outOfOrder), { waitUntil: 'commit' });
      await expect(page.locator('#eb-fallback')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('#eb-content')).toBeHidden();
      // Prove the wrappers exist so the post-reset count(0) isn't vacuous.
      await expect(page.locator('[q\\:ebc]')).toHaveCount(1);
      await expect(page.locator('[q\\:ebf]')).toHaveCount(1);

      await page.locator('#eb-reset').click();

      await expect(page.locator('#eb-content')).toHaveCount(1, { timeout: 10000 });
      await expect(page.locator('#eb-content')).toBeVisible();
      await expect(page.locator('#eb-thrower-client')).toBeAttached();
      await expect(page.locator('#eb-fallback')).toHaveCount(0);

      await page.locator('#eb-content-button').click();
      await expect(page.locator('#eb-content-count')).toHaveText('1');

      await expect(page.locator('[q\\:ebc]')).toHaveCount(0);
      await expect(page.locator('[q\\:ebf]')).toHaveCount(0);
    });
  }

  test('client error: reset re-supplies the content interactively', async ({ page }) => {
    assertNoBrowserErrors(page);
    await page.goto('/e2e/error-boundary-streaming?scenario=reset-csr', { waitUntil: 'commit' });
    await expect(page.locator('#eb-content')).toBeVisible({ timeout: 10000 });

    // Resume the container before the throw routes.
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

  test('reset re-executes async children through a Slot-projecting wrapper component', async ({
    page,
  }) => {
    assertNoBrowserErrors(page);
    await page.goto('/e2e/error-boundary-streaming?scenario=reset-wrapped', {
      waitUntil: 'commit',
    });
    await expect(page.locator('#eb-fallback')).toBeVisible({ timeout: 10000 });

    await page.locator('#eb-reset').click();

    await expect(page.locator('#eb-wrap-recovered')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#eb-fallback')).toHaveCount(0);
  });

  test('second reset re-executes children of an ErrorBoundary inside a Suspense (re-error then recover)', async ({
    page,
  }) => {
    assertNoBrowserErrors(page);
    await page.goto('/e2e/error-boundary-streaming?scenario=reset-reerror', {
      waitUntil: 'commit',
    });
    await expect(page.locator('#eb-fallback')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#eb-fallback-msg')).toContainText('An error occurred');

    await page.locator('#eb-reset').click();
    await expect(page.locator('#eb-fallback-msg')).toContainText('client boom 1', {
      timeout: 10000,
    });

    await page.locator('#eb-reset').click();
    await expect(page.locator('#eb-reerror-recovered')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#eb-fallback')).toHaveCount(0);
  });

  // No serialized resetOwner: reset() resolves the owner at runtime.
  test('reset re-executes children of a client-first (SPA-nav) ErrorBoundary inside a Suspense', async ({
    page,
  }) => {
    assertNoBrowserErrors(page);
    await page.goto('/e2e/error-boundary-streaming?scenario=reset-spa', { waitUntil: 'commit' });
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

  test('wrapper key-swap: key bump re-executes the async child through a Slot wrapper', async ({
    page,
  }) => {
    assertNoBrowserErrors(page);
    await page.goto('/e2e/error-boundary-streaming?scenario=reset-wrapped-key', {
      waitUntil: 'commit',
    });
    await expect(page.locator('#eb-fallback')).toBeVisible({ timeout: 10000 });
    await page.locator('#eb-reset').click();
    await expect(page.locator('#eb-wrap-recovered')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#eb-fallback')).toHaveCount(0);
  });
});

test.describe('ErrorBoundary multi-container qErr scoping', () => {
  // Parser-driven qErr (real currentScript) is the only container-scoping path.
  test('an SSR error inside an embedded container swaps only that container boundary', async ({
    page,
  }) => {
    assertNoBrowserErrors(page);
    await page.goto('/e2e/error-boundary-streaming?scenario=multi-container', {
      waitUntil: 'commit',
    });

    await expect(page.locator('#eb-embed #eb-fallback')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#eb-embed #eb-fallback-msg')).toHaveText(
      'caught: An error occurred'
    );
    await expect(page.locator('#eb-embed #eb-content')).toBeHidden();

    // Per-container id counters make both boundaries share one id.
    const hostBoundaryId = await page
      .locator('div[q\\:ebc]:has(#eb-host-content)')
      .getAttribute('q:ebc');
    const fragmentBoundaryId = await page.locator('#eb-embed [q\\:ebc]').getAttribute('q:ebc');
    expect(hostBoundaryId).not.toBeNull();
    expect(fragmentBoundaryId).toBe(hostBoundaryId);

    // Host boundary is earlier in doc order; unscoped qErr would hit it first.
    await expect(page.locator('#eb-host-content')).toBeVisible();
    await expect(page.locator('#eb-host-fb')).toHaveCount(0);

    await page.locator('#eb-host-button').click();
    await expect(page.locator('#eb-host-count')).toHaveText('1');

    await page.locator('#eb-embed #eb-fallback-button').click();
    await expect(page.locator('#eb-embed #eb-fallback-count')).toHaveText('1');
  });
});

test.describe('ErrorBoundary last-resort & rejection bridge', () => {
  test('built-in last-resort node renders when the fallback$ chunk fails to load', async ({
    page,
  }) => {
    const blockedFallbackChunks: string[] = [];
    await page.route(/\/build\/[^?]*[Ff]allback[^?]*\.js/, (route) => {
      blockedFallbackChunks.push(route.request().url());
      return route.abort();
    });

    await page.goto('/e2e/error-boundary-streaming?scenario=last-resort', { waitUntil: 'commit' });

    await expect(page.locator('#eb-content')).toHaveText('content ok', { timeout: 10000 });
    await expect(page.locator('[role="alert"]')).toHaveCount(0);

    await page.locator('#eb-last-resort-throw').click();

    const lastResort = page.locator('[role="alert"]');
    await expect(lastResort).toBeVisible({ timeout: 10000 });
    await expect(lastResort).toHaveText('Something went wrong.');
    await expect(page.locator('#eb-fallback')).toHaveCount(0);
    expect(blockedFallbackChunks.length).toBeGreaterThan(0);

    await expect(page.locator('#eb-title')).toHaveText('EB Streaming');
  });

  test('a failed qwikloader dynamic import (chunk 404) leaves the boundary inert', async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    // Regex must match both chromium and webkit phrasings.
    const importFailureErrors = () =>
      consoleErrors.filter((text) =>
        /dynamically imported|importing a module|error loading|importerror/i.test(text)
      );

    await page.addInitScript(() => {
      (window as any).__ebQErrors = [];
      document.addEventListener('qerror', (e: any) => {
        (window as any).__ebQErrors.push({ importError: e.detail?.importError ?? null });
      });
    });

    // handlers.js is qwikloader's own import() wrapper; abort it, not core.
    const blockedRequests: string[] = [];
    await page.route(/\/build\/handlers\.js/, (route) => {
      blockedRequests.push(route.request().url());
      return route.abort();
    });

    await page.goto('/e2e/error-boundary-streaming?scenario=happy', { waitUntil: 'commit' });
    await expect(page.locator('#eb-content')).toBeVisible({ timeout: 10000 });

    await page.locator('#eb-content-throw').click();

    // Exactly once: a re-added container would re-log.
    await expect.poll(() => importFailureErrors().length, { timeout: 10000 }).toBeGreaterThan(0);
    await page.waitForTimeout(300);
    expect(importFailureErrors()).toHaveLength(1);
    expect(blockedRequests.length).toBeGreaterThan(0);

    const qErrors = await page.evaluate(() => (window as any).__ebQErrors);
    expect(qErrors).toEqual([{ importError: 'async' }]);

    await expect(page.locator('#eb-fallback')).toHaveCount(0);
    await expect(page.locator('[role="alert"]')).toHaveCount(0);
    await expect(page.locator('#eb-content')).toBeVisible();
    // Handler increments before throwing, so 0 proves the import failed.
    await expect(page.locator('#eb-content-touched')).toHaveText('0');
    expect(pageErrors).toEqual([]);
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

    // Resume so the bridge registers before the reject.
    await page.locator('#eb-reject').click();
    await expect(page.locator('#eb-reject-touched')).toHaveText('1');

    await expect
      .poll(() => consoleErrors.join('\n'), { timeout: 10000 })
      .toContain('unhandled boom');
  });
});
