import { test, expect } from '@playwright/test';
import {
  assertNoBrowserErrors,
  collectConsoleErrors,
  collectPageErrors,
  releaseDeferred,
  routeUrl,
  streamingModes,
} from './error-handling-helpers';

test.describe('ErrorBoundary streaming swap', () => {
  test('happy path: content interactive after resume, no fallback or swap script, then catches a client throw', async ({
    page,
  }) => {
    assertNoBrowserErrors(page);
    const response = await page.goto(routeUrl('happy'), { waitUntil: 'commit' });
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

  for (const { mode, outOfOrder } of streamingModes) {
    test(`${mode} sync throw: streams the shell, swaps to the fallback, keeps it interactive`, async ({
      page,
    }) => {
      assertNoBrowserErrors(page);
      await page.goto(routeUrl('basic', { outOfOrder }), { waitUntil: 'commit' });

      await expect(page.locator('#eb-title')).toHaveText('Error handling e2e', { timeout: 10000 });
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
    await page.goto(routeUrl('suspense-deferred'), { waitUntil: 'commit' });

    await expect(page.locator('#eb-title')).toHaveText('Error handling e2e', { timeout: 10000 });
    await expect(page.locator('#eb-footer')).toHaveText('Footer shell', { timeout: 10000 });

    await expect(page.locator('#eb-deferred-ok')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#eb-fallback')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#eb-fallback-msg')).toHaveText('caught: An error occurred');
    await expect(page.locator('#eb-content')).toBeHidden();

    await page.locator('#eb-fallback-button').click();
    await expect(page.locator('#eb-fallback-count')).toHaveText('1');
  });

  // https://github.com/QwikDev/qwik/issues/8877
  test.fixme('async deferred throw: streams siblings + skeleton, then tears down the whole boundary', async ({
    page,
  }) => {
    assertNoBrowserErrors(page);
    await page.goto(routeUrl('async', { params: { release: 'eb' } }), {
      waitUntil: 'commit',
    });

    await expect(page.locator('#eb-title')).toHaveText('Error handling e2e', { timeout: 10000 });
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

  test('qErr swap as a main-flow sibling of a live deferred <Suspense> segment stays interactive', async ({
    page,
  }) => {
    assertNoBrowserErrors(page);
    const response = await page.goto(routeUrl('sibling-suspense', { params: { release: 'eb' } }), {
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
    await page.goto(routeUrl('inert'), { waitUntil: 'commit' });

    await expect(page.locator('#eb-fallback')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#eb-content')).toBeHidden();

    expect(await page.evaluate(() => (window as any).__ebDeadTaskClientRuns ?? 0)).toBe(0);

    await page.locator('#eb-inert-trigger').click();
    await expect(page.locator('#eb-inert-val')).toHaveText('1');

    expect(await page.evaluate(() => (window as any).__ebDeadTaskClientRuns ?? 0)).toBe(0);
  });

  test('in-order mid-stream click on a swapped fallback is queued and replayed after resume', async ({
    page,
    browserName,
  }) => {
    assertNoBrowserErrors(page);
    const webkitFlush = browserName === 'webkit' ? { webkitFlush: '1' } : {};
    await page.goto(
      routeUrl('midstream', {
        outOfOrder: false,
        params: { release: 'eb', inOrderStrategy: 'direct', ...webkitFlush },
      }),
      { waitUntil: 'commit' }
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
});

test.describe('ErrorBoundary client-time throws', () => {
  for (const { mode, outOfOrder } of streamingModes) {
    test(`${mode}: client-time throw after resume re-renders the boundary to its fallback`, async ({
      page,
    }) => {
      assertNoBrowserErrors(page);
      await page.goto(routeUrl('csr-event', { outOfOrder }), { waitUntil: 'commit' });

      await expect(page.locator('#eb-content')).toHaveText('content ok', { timeout: 10000 });
      await expect(page.locator('#eb-fallback')).toHaveCount(0);

      await page.locator('#eb-client-throw').click();
      await expect(page.locator('#eb-fallback')).toBeVisible({ timeout: 10000 });

      await page.locator('#eb-fallback-button').click();
      await expect(page.locator('#eb-fallback-count')).toHaveText('1');
    });
  }

  test('useVisibleTask$ throw after resume is routed to the boundary without interaction', async ({
    page,
  }) => {
    const pageErrors = collectPageErrors(page);

    await page.goto(routeUrl('visible-task'), { waitUntil: 'commit' });

    await expect(page.locator('#eb-fallback')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#eb-fallback-msg')).toHaveText('caught: visible boom');
    await expect(page.locator('#eb-content')).toBeHidden();

    await page.locator('#eb-fallback-button').click();
    await expect(page.locator('#eb-fallback-count')).toHaveText('1');

    await page.waitForTimeout(200);
    expect(pageErrors.filter((message) => message.includes('visible boom'))).toEqual([]);
  });

  test('no boundary: a client throw still surfaces to the global error handler', async ({
    page,
  }) => {
    const pageErrors = collectPageErrors(page);

    await page.goto(routeUrl('no-boundary'), { waitUntil: 'commit' });
    await expect(page.locator('#eb-title')).toHaveText('Error handling e2e', { timeout: 10000 });

    await page.locator('#eb-no-boundary-throw').click();
    await expect(page.locator('#eb-no-boundary-touched')).toHaveText('1', { timeout: 10000 });

    await expect.poll(() => pageErrors, { timeout: 10000 }).toContain('no-boundary boom');
  });
});

test.describe('ErrorBoundary onError$', () => {
  test('onError$ fires once with the error on a client-time throw', async ({ page }) => {
    assertNoBrowserErrors(page);
    await page.goto(routeUrl('onerror'), { waitUntil: 'commit' });

    await expect(page.locator('#eb-content')).toHaveText('content ok', { timeout: 10000 });
    await page.locator('#eb-onerror-throw').click();

    await expect(page.locator('#eb-fallback')).toBeVisible({ timeout: 10000 });
    await page.waitForFunction(() => (window as any).__ebOnErrorRuns >= 1);
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => (window as any).__ebOnErrorRuns)).toBe(1);
    expect(await page.evaluate(() => (window as any).__ebOnErrorMsg)).toBe('onerror boom');
  });

  test('onError$ receives info.phase "event" and a stable boundaryId for a real qwikloader throw', async ({
    page,
  }) => {
    assertNoBrowserErrors(page);
    await page.goto(routeUrl('onerror'), { waitUntil: 'commit' });

    await expect(page.locator('#eb-content')).toHaveText('content ok', { timeout: 10000 });
    await page.locator('#eb-onerror-throw').click();

    await expect(page.locator('#eb-fallback')).toBeVisible({ timeout: 10000 });
    await page.waitForFunction(() => (window as any).__ebOnErrorPhase !== undefined);
    expect(await page.evaluate(() => (window as any).__ebOnErrorPhase)).toBe('event');
    expect(await page.evaluate(() => (window as any).__ebOnErrorBoundaryId)).toBeTruthy();
  });
});

test.describe('ErrorBoundary nested boundaries', () => {
  test('SSR inner error, then a client throw makes the outer boundary replace the whole subtree', async ({
    page,
  }) => {
    assertNoBrowserErrors(page);
    await page.goto(routeUrl('nested'), { waitUntil: 'commit' });

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
    await page.goto(routeUrl('nested-ssr'), { waitUntil: 'commit' });

    await expect(page.locator('#eb-outer')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#eb-outer-msg')).toHaveText('caught: An error occurred');
    await expect(page.locator('#eb-inner')).toBeHidden();

    await page.locator('#eb-outer-button').click();
    await expect(page.locator('#eb-outer-count')).toHaveText('1');
  });

  test('a real client throw inside the inner boundary is caught by the nearest (inner) boundary, outer intact', async ({
    page,
  }) => {
    assertNoBrowserErrors(page);
    await page.goto(routeUrl('nested-client'), { waitUntil: 'commit' });

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
      await page.goto(routeUrl('fallback-throws', { outOfOrder }), { waitUntil: 'commit' });

      await expect(page.locator('#eb-title')).toHaveText('Error handling e2e', { timeout: 10000 });
      await expect(page.locator('#eb-outer')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('#eb-outer-msg')).toHaveText('caught: An error occurred');
      await expect(page.locator('#eb-content')).toBeHidden();

      await page.locator('#eb-outer-button').click();
      await expect(page.locator('#eb-outer-count')).toHaveText('1');
    });
  }
});

test.describe('ErrorBoundary reset', () => {
  for (const { mode, outOfOrder } of streamingModes) {
    test(`${mode} SSR resume: reset re-executes the children and recovers`, async ({ page }) => {
      assertNoBrowserErrors(page);
      await page.goto(routeUrl('reset', { outOfOrder }), { waitUntil: 'commit' });
      await expect(page.locator('#eb-fallback')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('#eb-content')).toBeHidden();
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

  test('reset on an always-throwing child re-derives the fallback client-side', async ({
    page,
  }) => {
    assertNoBrowserErrors(page);
    await page.goto(routeUrl('rederive'), { waitUntil: 'commit' });

    await expect(page.locator('#eb-fallback')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#eb-fallback-msg')).toHaveText('caught: An error occurred');
    expect(await page.evaluate(() => (window as any).__ebRederiveRuns ?? 0)).toBe(0);

    await page.locator('#eb-reset').click();

    await expect(page.locator('#eb-fallback-msg')).toHaveText('caught: eb always boom', {
      timeout: 10000,
    });
    await expect.poll(() => page.evaluate(() => (window as any).__ebRederiveRuns ?? 0)).toBe(1);
  });

  test('client error: reset re-supplies the content interactively', async ({ page }) => {
    assertNoBrowserErrors(page);
    await page.goto(routeUrl('reset-csr'), { waitUntil: 'commit' });
    await expect(page.locator('#eb-content')).toBeVisible({ timeout: 10000 });

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
    // OOOS: #8876 route shape + #8884 segment reset
    await page.goto(routeUrl('reset-wrapped', { outOfOrder: false }), { waitUntil: 'commit' });
    await expect(page.locator('#eb-fallback')).toBeVisible({ timeout: 10000 });

    await page.locator('#eb-reset').click();

    await expect(page.locator('#eb-wrap-recovered')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#eb-fallback')).toHaveCount(0);
  });

  test('second reset re-executes children of an ErrorBoundary inside a Suspense (re-error then recover)', async ({
    page,
  }) => {
    assertNoBrowserErrors(page);
    // OOOS: #8876 route shape + #8884 segment reset
    await page.goto(routeUrl('reset-reerror', { outOfOrder: false }), { waitUntil: 'commit' });
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

  test('reset re-executes children of a client-first (SPA-nav) ErrorBoundary inside a Suspense', async ({
    page,
  }) => {
    assertNoBrowserErrors(page);
    await page.goto(routeUrl('reset-spa'), { waitUntil: 'commit' });
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
    // OOOS: #8876 route shape + #8884 segment reset
    await page.goto(routeUrl('reset-wrapped-key', { outOfOrder: false }), { waitUntil: 'commit' });
    await expect(page.locator('#eb-fallback')).toBeVisible({ timeout: 10000 });
    await page.locator('#eb-reset').click();
    await expect(page.locator('#eb-wrap-recovered')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#eb-fallback')).toHaveCount(0);
  });

  test('SSR resume (real click): reset on a nested inner boundary re-executes its children, outer intact', async ({
    page,
  }) => {
    assertNoBrowserErrors(page);
    await page.goto(routeUrl('nested-reset', { outOfOrder: false }), { waitUntil: 'commit' });

    await expect(page.locator('#eb-fallback')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#eb-outer-ok')).toBeVisible();
    await expect(page.locator('#eb-thrower-client')).toHaveCount(0);

    await page.locator('#eb-reset').click();

    await expect(page.locator('#eb-thrower-client')).toBeAttached({ timeout: 10000 });
    await expect(page.locator('#eb-fallback')).toHaveCount(0);
    await expect(page.locator('#eb-outer-ok')).toBeVisible();

    await page.locator('#eb-outer-ok-button').click();
    await expect(page.locator('#eb-outer-ok-count')).toHaveText('1');
  });

  test('SSR resume (real click): reset on a boundary nested inside a resumed SSR fallback re-derives the outer and recovers the inner', async ({
    page,
  }) => {
    assertNoBrowserErrors(page);
    await page.goto(routeUrl('fallback-nested-resume', { outOfOrder: false }), {
      waitUntil: 'commit',
    });

    await expect(page.locator('#eb-outer-fb')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#eb-inner-reset')).toBeVisible();
    await expect(page.locator('#eb-thrower-client')).toHaveCount(0);

    await page.locator('#eb-inner-reset').click();

    await expect(page.locator('#eb-thrower-client')).toBeAttached({ timeout: 10000 });
    await expect(page.locator('#eb-outer-fb')).toBeVisible();
    await expect(page.locator('#eb-inner-reset')).toHaveCount(0);
  });
});

test.describe('ErrorBoundary multi-container qErr scoping', () => {
  test('an SSR error inside an embedded container swaps only that container boundary', async ({
    page,
  }) => {
    assertNoBrowserErrors(page);
    await page.goto(routeUrl('multi-container'), { waitUntil: 'commit' });

    await expect(page.locator('#eb-embed #eb-fallback')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#eb-embed #eb-fallback-msg')).toHaveText(
      'caught: An error occurred'
    );
    await expect(page.locator('#eb-embed #eb-content')).toBeHidden();

    const hostBoundaryId = await page
      .locator('div[q\\:ebc]:has(#eb-host-content)')
      .getAttribute('q:ebc');
    const fragmentBoundaryId = await page.locator('#eb-embed [q\\:ebc]').getAttribute('q:ebc');
    expect(hostBoundaryId).not.toBeNull();
    expect(fragmentBoundaryId).toBe(hostBoundaryId);

    await expect(page.locator('#eb-host-content')).toBeVisible();
    await expect(page.locator('#eb-host-fb')).toHaveCount(0);

    await page.locator('#eb-host-button').click();
    await expect(page.locator('#eb-host-count')).toHaveText('1');

    await page.locator('#eb-embed #eb-fallback-button').click();
    await expect(page.locator('#eb-embed #eb-fallback-count')).toHaveText('1');
  });
});

test.describe('ErrorBoundary chunk-load failures and the rejection bridge', () => {
  test('built-in last-resort node renders when the fallback$ chunk fails to load', async ({
    page,
  }) => {
    const blockedFallbackChunks: string[] = [];
    await page.route(/\/build\/[^?]*[Ff]allback[^?]*\.js/, (route) => {
      blockedFallbackChunks.push(route.request().url());
      return route.abort();
    });

    await page.goto(routeUrl('last-resort'), { waitUntil: 'commit' });

    await expect(page.locator('#eb-content')).toHaveText('content ok', { timeout: 10000 });
    await expect(page.locator('[role="alert"]')).toHaveCount(0);

    await page.locator('#eb-last-resort-throw').click();

    const lastResort = page.locator('[role="alert"]');
    await expect(lastResort).toBeVisible({ timeout: 10000 });
    await expect(lastResort).toHaveText('Something went wrong.');
    await expect(page.locator('#eb-fallback')).toHaveCount(0);
    expect(blockedFallbackChunks.length).toBeGreaterThan(0);

    await expect(page.locator('#eb-title')).toHaveText('Error handling e2e');
  });

  test('a failed qwikloader dynamic import (chunk 404) leaves the boundary inert', async ({
    page,
  }) => {
    const pageErrors = collectPageErrors(page);
    const consoleErrors = collectConsoleErrors(page);
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

    const blockedRequests: string[] = [];
    await page.route(/\/build\/handlers\.js/, (route) => {
      blockedRequests.push(route.request().url());
      return route.abort();
    });

    await page.goto(routeUrl('happy'), { waitUntil: 'commit' });
    await expect(page.locator('#eb-content')).toBeVisible({ timeout: 10000 });

    const failuresBeforeClick = importFailureErrors().length;
    const qErrorsBeforeClick = (await page.evaluate(() => (window as any).__ebQErrors)).length;

    await page.locator('#eb-content-throw').click();

    await expect
      .poll(() => importFailureErrors().length, { timeout: 10000 })
      .toBeGreaterThan(failuresBeforeClick);
    await page.waitForTimeout(300);
    expect(importFailureErrors()).toHaveLength(failuresBeforeClick + 1);
    expect(blockedRequests.length).toBeGreaterThan(0);

    const qErrors = await page.evaluate(() => (window as any).__ebQErrors);
    expect(qErrors.slice(qErrorsBeforeClick)).toEqual([{ importError: 'async' }]);

    await expect(page.locator('#eb-fallback')).toHaveCount(0);
    await expect(page.locator('[role="alert"]')).toHaveCount(0);
    await expect(page.locator('#eb-content')).toBeVisible();
    await expect(page.locator('#eb-content-touched')).toHaveText('0');
    expect(pageErrors).toEqual([]);
  });

  test('a fire-and-forget Promise.reject reaches logError via the unhandledrejection bridge', async ({
    page,
  }) => {
    const consoleErrors = collectConsoleErrors(page);

    await page.goto(routeUrl('unhandled-rejection'), { waitUntil: 'commit' });
    await expect(page.locator('#eb-reject')).toBeVisible({ timeout: 10000 });

    await page.locator('#eb-reject').click();
    await expect(page.locator('#eb-reject-touched')).toHaveText('1');

    await expect
      .poll(() => consoleErrors.join('\n'), { timeout: 10000 })
      .toContain('unhandled boom');
  });
});

test.describe('ErrorBoundary × async-signal .error channel', () => {
  test('async error read via `.error` is handled inline — the boundary never sees it', async ({
    page,
  }) => {
    await page.goto(routeUrl('async-error-inline'), { waitUntil: 'commit' });

    await expect(page.locator('#async-error')).toHaveText('handled: expected-async-error', {
      timeout: 10000,
    });
    await expect(page.locator('#eb-fallback')).toHaveCount(0);
  });

  test('async error read via `.value` propagates → caught by the ErrorBoundary', async ({
    page,
  }) => {
    await page.goto(routeUrl('async-error-throw'), { waitUntil: 'commit' });

    await expect(page.locator('#eb-fallback-msg')).toHaveText('caught: An error occurred', {
      timeout: 10000,
    });
    await expect(page.locator('#async-value')).toHaveCount(0);
  });
});

test.describe('ErrorBoundary × loader errors', () => {
  test('loader error(500) is NOT caught by an ErrorBoundary: the router returns a 500', async ({
    page,
  }) => {
    const response = await page.goto(routeUrl('loader-500'), { waitUntil: 'commit' });
    expect(response!.status()).toBe(500);
    await expect(page.locator('#eb-fallback')).toHaveCount(0);
    await expect(page.locator('#loader-500-body')).toHaveCount(0);
  });

  // reset re-invokes the loader; this asserts the opposite
  test.fixme('reset re-derives the identical fallback from the serialized loader value', async ({
    page,
  }) => {
    assertNoBrowserErrors(page);
    await page.goto(routeUrl('loader-data-throw'), { waitUntil: 'commit' });

    await expect(page.locator('#eb-fallback-msg')).toHaveText(
      'caught: loader data boom: loader-data-secret',
      { timeout: 10000 }
    );

    await page.locator('#eb-reset').click();
    await expect(page.locator('#eb-fallback-msg')).toHaveText(
      'caught: loader data boom: loader-data-secret',
      { timeout: 10000 }
    );
    await expect(page.locator('#eb-content')).toHaveCount(0);
  });

  // reset re-invokes the loader; this asserts the opposite
  test.fixme('reset does not re-invoke the loader: no q-data request fires for the reset', async ({
    page,
  }) => {
    assertNoBrowserErrors(page);
    await page.goto(routeUrl('loader-reset-no-refetch'), { waitUntil: 'commit' });

    await expect(page.locator('#eb-fallback')).toBeVisible({ timeout: 10000 });
    await page.waitForLoadState('networkidle');

    const loaderRequestsAfterReset: string[] = [];
    page.on('request', (req) => {
      if (/q-loader|q-data\.json/.test(req.url())) {
        loaderRequestsAfterReset.push(req.url());
      }
    });

    await page.locator('#eb-reset').click();
    await expect(page.locator('#eb-content')).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(300);

    expect(loaderRequestsAfterReset).toEqual([]);
  });
});

test.describe('ErrorBoundary in a production build (qDev=false)', () => {
  const prodUrl = (route: string) => routeUrl(route, { app: 'error-handling.prod' });

  test('client throw after resume shows the redacted fallback, raw message nowhere in the page', async ({
    page,
  }) => {
    assertNoBrowserErrors(page);
    await page.goto(prodUrl('csr-event'), { waitUntil: 'commit' });

    await expect(page.locator('#eb-content')).toHaveText('content ok', { timeout: 10000 });
    await expect(page.locator('#eb-fallback')).toHaveCount(0);

    await page.locator('#eb-client-throw').click();

    await expect(page.locator('#eb-fallback')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#eb-fallback-msg')).toHaveText('caught: An error occurred');
    expect(await page.locator('body').innerText()).not.toContain('client click boom');

    await page.locator('#eb-fallback-button').click();
    await expect(page.locator('#eb-fallback-count')).toHaveText('1');
  });

  test('SSR swap: the prod-built client resumes the swapped page, fallback interactive', async ({
    page,
  }) => {
    assertNoBrowserErrors(page);
    await page.goto(prodUrl('basic'), { waitUntil: 'commit' });

    await expect(page.locator('#eb-fallback')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#eb-fallback-msg')).toHaveText('caught: An error occurred');
    await expect(page.locator('#eb-content')).toBeHidden();

    await page.locator('#eb-fallback-button').click();
    await expect(page.locator('#eb-fallback-count')).toHaveText('1');
  });

  test('PublicError renders unredacted while a sibling plain error stays generic', async ({
    page,
  }) => {
    assertNoBrowserErrors(page);
    await page.goto(prodUrl('public-error'), { waitUntil: 'commit' });

    await expect(page.locator('#eb-fallback-msg')).toHaveText('caught: Out of stock', {
      timeout: 10000,
    });
    await expect(page.locator('#eb-plain-msg')).toHaveText('caught: An error occurred');
    expect(await page.locator('body').innerText()).not.toContain('eb sync boom');

    await page.locator('#eb-public-probe').click();
    await expect(page.locator('#eb-public-kind')).toHaveText('public:A1');
  });

  test('reset on an always-throwing child re-derives the redacted fallback client-side', async ({
    page,
  }) => {
    assertNoBrowserErrors(page);
    await page.goto(prodUrl('rederive'), { waitUntil: 'commit' });

    await expect(page.locator('#eb-fallback')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#eb-fallback-msg')).toHaveText('caught: An error occurred');

    await page.locator('#eb-reset').click();

    await expect
      .poll(() => page.evaluate(() => (window as any).__ebRederiveRuns ?? 0), { timeout: 10000 })
      .toBe(1);
    await expect(page.locator('#eb-fallback-msg')).toHaveText('caught: An error occurred');
    expect(await page.locator('body').innerText()).not.toContain('eb always boom');
  });

  test('reset round-trips through the prod serializer and re-executes the children', async ({
    page,
  }) => {
    assertNoBrowserErrors(page);
    await page.goto(prodUrl('reset'), { waitUntil: 'commit' });

    await expect(page.locator('#eb-fallback')).toBeVisible({ timeout: 10000 });

    await page.locator('#eb-reset').click();

    await expect(page.locator('#eb-content')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#eb-fallback')).toHaveCount(0);

    await page.locator('#eb-content-button').click();
    await expect(page.locator('#eb-content-count')).toHaveText('1');
  });

  test('an app error carrying its own digest field still redacts', async ({ page }) => {
    assertNoBrowserErrors(page);
    await page.goto(prodUrl('digest-forgery'), { waitUntil: 'commit' });

    await expect(page.locator('#eb-fallback-msg')).toHaveText('caught: An error occurred', {
      timeout: 10000,
    });
    const digest = await page.locator('#eb-fallback-digest').innerText();
    expect(digest).not.toBe('forged-digest');
    expect(digest).not.toBe('none');
    expect(await page.locator('body').innerText()).not.toContain('digest secret boom');
  });

  test('a PublicError whose data carries a function still displays unredacted', async ({
    page,
  }) => {
    assertNoBrowserErrors(page);
    await page.goto(prodUrl('unserializable-public'), { waitUntil: 'commit' });

    await expect(page.locator('#eb-fallback-msg')).toHaveText('caught: Out of stock', {
      timeout: 10000,
    });
  });
});
