import { test, expect } from '@playwright/test';
import { assertNoBrowserErrors, collectPageErrors, releaseDeferred } from './e2e-helpers';

export const streamingModes = [
  { mode: 'in-order', outOfOrder: false },
  { mode: 'out-of-order', outOfOrder: true },
] as const;
const caughtError = /^caught: .+/;

type RouteApp = 'error-handling' | 'error-handling.prod';

export const routeUrl = (
  route: string,
  {
    outOfOrder = true,
    app = 'error-handling' as RouteApp,
    params = {},
  }: { outOfOrder?: boolean; app?: RouteApp; params?: Record<string, string> } = {}
) => {
  const search = new URLSearchParams(outOfOrder ? undefined : { outOfOrder: 'false' });
  for (const [key, value] of Object.entries(params)) {
    search.set(key, value);
  }
  const query = search.toString();
  return `/${app}/${route}${query ? `?${query}` : ''}`;
};

test.describe('Catch + fallback$', () => {
  test('happy path: content interactive after resume, no fallback or swap script, then catches a client throw', async ({
    page,
  }) => {
    assertNoBrowserErrors(page);
    const response = await page.goto(routeUrl('happy'), { waitUntil: 'commit' });
    const html = await response!.text();
    expect(html).not.toMatch(/qErr\(|qInstallErrorSwap|qO\(|qInstallOOOS/);

    await expect(page.locator('#catch-content')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#catch-fallback')).toHaveCount(0);

    await page.locator('#catch-content-button').click();
    await expect(page.locator('#catch-content-count')).toHaveText('1');

    await page.locator('#catch-content-throw').click();
    await expect(page.locator('#catch-fallback')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#catch-content')).toBeHidden();
    await page.locator('#catch-fallback-button').click();
    await expect(page.locator('#catch-fallback-count')).toHaveText('1');
  });

  for (const { mode, outOfOrder } of streamingModes) {
    test(`${mode}: sync throw streams the shell, swaps to the fallback, keeps it interactive`, async ({
      page,
    }) => {
      assertNoBrowserErrors(page);
      await page.goto(routeUrl('basic', { outOfOrder }), { waitUntil: 'commit' });

      await expect(page.locator('#catch-title')).toHaveText('Error handling e2e', {
        timeout: 10000,
      });
      await expect(page.locator('#catch-footer')).toHaveText('Footer shell', { timeout: 10000 });

      await expect(page.locator('#catch-fallback')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('#catch-fallback-msg')).toHaveText(caughtError);
      await expect(page.locator('#catch-content')).toBeHidden();

      await page.locator('#catch-fallback-button').click();
      await expect(page.locator('#catch-fallback-count')).toHaveText('1');
    });
  }

  for (const { mode, outOfOrder } of streamingModes) {
    test(`${mode}: client-time throw after resume re-renders the boundary to its fallback`, async ({
      page,
    }) => {
      assertNoBrowserErrors(page);
      await page.goto(routeUrl('csr-event', { outOfOrder }), { waitUntil: 'commit' });

      await expect(page.locator('#catch-content')).toHaveText('content ok', { timeout: 10000 });
      await expect(page.locator('#catch-fallback')).toHaveCount(0);

      await page.locator('#catch-client-throw').click();
      await expect(page.locator('#catch-fallback')).toBeVisible({ timeout: 10000 });

      await page.locator('#catch-fallback-button').click();
      await expect(page.locator('#catch-fallback-count')).toHaveText('1');
    });
  }

  test('a real client throw inside the inner boundary is caught by the nearest (inner) boundary, outer intact', async ({
    page,
  }) => {
    assertNoBrowserErrors(page);
    await page.goto(routeUrl('nested-client'), { waitUntil: 'commit' });

    await expect(page.locator('#catch-content')).toHaveText('content ok', { timeout: 10000 });
    await expect(page.locator('#catch-outer-ok')).toBeVisible();
    await expect(page.locator('#catch-inner')).toHaveCount(0);

    await page.locator('#catch-inner-throw').click();

    await expect(page.locator('#catch-inner')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#catch-outer')).toHaveCount(0);
    await expect(page.locator('#catch-outer-ok')).toBeVisible();
    await expect(page.locator('#catch-inner-msg')).toHaveText('caught: inner client boom');

    await page.locator('#catch-inner-button').click();
    await expect(page.locator('#catch-inner-count')).toHaveText('1');
  });

  test('SSR nested: the outer supersedes an already-swapped inner fallback when both error server-side', async ({
    page,
  }) => {
    assertNoBrowserErrors(page);
    await page.goto(routeUrl('nested-ssr'), { waitUntil: 'commit' });

    await expect(page.locator('#catch-outer')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#catch-outer-msg')).toHaveText(caughtError);
    await expect(page.locator('#catch-inner')).toBeHidden();

    await page.locator('#catch-outer-button').click();
    await expect(page.locator('#catch-outer-count')).toHaveText('1');
  });

  for (const { mode, outOfOrder } of streamingModes) {
    test(`${mode}: a throwing inner fallback escalates to the outer boundary, fallback interactive`, async ({
      page,
    }) => {
      assertNoBrowserErrors(page);
      await page.goto(routeUrl('fallback-throws', { outOfOrder }), { waitUntil: 'commit' });

      await expect(page.locator('#catch-title')).toHaveText('Error handling e2e', {
        timeout: 10000,
      });
      await expect(page.locator('#catch-outer')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('#catch-outer-msg')).toHaveText(caughtError);
      await expect(page.locator('#catch-content')).toBeHidden();

      await page.locator('#catch-outer-button').click();
      await expect(page.locator('#catch-outer-count')).toHaveText('1');
    });
  }

  test.describe('last-resort fallback', () => {
    test('built-in last-resort node renders when the fallback$ chunk fails to load', async ({
      page,
    }) => {
      const blockedFallbackChunks: string[] = [];
      await page.route(/\/build\/[^?]*[Ff]allback[^?]*\.js/, (route) => {
        blockedFallbackChunks.push(route.request().url());
        return route.abort();
      });

      await page.goto(routeUrl('last-resort'), { waitUntil: 'commit' });

      await expect(page.locator('#catch-content')).toHaveText('content ok', { timeout: 10000 });
      await expect(page.locator('[role="alert"]')).toHaveCount(0);

      await page.locator('#catch-last-resort-throw').click();

      const lastResort = page.locator('[role="alert"]');
      await expect(lastResort).toBeVisible({ timeout: 10000 });
      await expect(lastResort).toHaveText('Something went wrong.');
      await expect(page.locator('#catch-fallback')).toHaveCount(0);
      expect(blockedFallbackChunks.length).toBeGreaterThan(0);

      await expect(page.locator('#catch-title')).toHaveText('Error handling e2e');
    });
  });

  test.describe('SSR delivery & teardown', () => {
    test('boundary inside a deferred <Pending>: hoisted qErr swap, fallback interactive', async ({
      page,
    }) => {
      assertNoBrowserErrors(page);
      await page.goto(routeUrl('pending-deferred'), { waitUntil: 'commit' });

      await expect(page.locator('#catch-title')).toHaveText('Error handling e2e', {
        timeout: 10000,
      });
      await expect(page.locator('#catch-footer')).toHaveText('Footer shell', { timeout: 10000 });

      await expect(page.locator('#catch-deferred-ok')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('#catch-fallback')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('#catch-fallback-msg')).toHaveText(caughtError);
      await expect(page.locator('#catch-content')).toBeHidden();

      await page.locator('#catch-fallback-button').click();
      await expect(page.locator('#catch-fallback-count')).toHaveText('1');
    });

    // https://github.com/QwikDev/qwik/issues/8877
    test.fixme('async deferred throw: streams siblings + skeleton, then tears down the whole boundary', async ({
      page,
    }) => {
      assertNoBrowserErrors(page);
      await page.goto(routeUrl('async', { params: { release: 'catch' } }), {
        waitUntil: 'commit',
      });

      await expect(page.locator('#catch-title')).toHaveText('Error handling e2e', {
        timeout: 10000,
      });
      await expect(page.locator('#catch-sibling')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('#catch-skel')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('#catch-footer')).toHaveText('Footer shell', { timeout: 10000 });
      await expect(page.locator('#catch-fallback')).toHaveCount(0);

      await releaseDeferred(page, '#catch-release');

      await expect(page.locator('#catch-fallback')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('#catch-fallback-msg')).toHaveText(caughtError);
      await expect(page.locator('#catch-sibling')).toBeHidden();

      await page.locator('#catch-fallback-button').click();
      await expect(page.locator('#catch-fallback-count')).toHaveText('1');
    });

    test('qErr swap as a main-flow sibling of a live deferred <Pending> segment stays interactive', async ({
      page,
    }) => {
      assertNoBrowserErrors(page);
      const response = await page.goto(
        routeUrl('sibling-pending', { params: { release: 'catch' } }),
        {
          waitUntil: 'commit',
        }
      );

      await expect(page.locator('#catch-fallback')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('#catch-fallback-msg')).toHaveText(caughtError);
      await expect(page.locator('#catch-content')).toBeHidden();
      await expect(page.locator('#catch-skel')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('#catch-deferred-ok')).toHaveCount(0);

      await releaseDeferred(page, '#catch-release');

      await expect(page.locator('#catch-deferred-ok')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('#catch-fallback')).toBeVisible();
      await expect(page.locator('#catch-content')).toBeHidden();

      await page.locator('#catch-fallback-button').click();
      await expect(page.locator('#catch-fallback-count')).toHaveText('1');

      const html = await response!.text();
      expect(html).toMatch(/qErr\(/);
      expect(html).toMatch(/qO\(/);
      await expect(page.locator('[q\\:cf] #catch-fallback')).toHaveCount(1);
      await expect(page.locator('[q\\:rp] #catch-fallback')).toHaveCount(0);
    });

    test('in-order mid-stream click on a swapped fallback is queued and replayed after resume', async ({
      page,
      browserName,
    }) => {
      // https://github.com/QwikDev/qwik/issues/8891
      test.skip(
        browserName === 'webkit',
        'webkit may defer async-module loader evaluation while the stream is held'
      );
      // The loader module is fetched while the stream is held; loaded runners need headroom.
      test.slow();
      assertNoBrowserErrors(page);
      const webkitFlush = browserName === 'webkit' ? { webkitFlush: '1' } : {};
      await page.goto(
        routeUrl('midstream', {
          outOfOrder: false,
          params: { release: 'catch', inOrderStrategy: 'direct', ...webkitFlush },
        }),
        { waitUntil: 'commit' }
      );

      await expect(page.locator('#catch-fallback')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('#catch-fallback-msg')).toHaveText(caughtError);
      await expect(page.locator('#catch-deferred-ok')).toHaveCount(0);

      // WebKit can starve rAF-based waitForFunction while the stream is held.
      await expect
        .poll(() => page.evaluate(() => !!(window as any)._qwikEv?.roots), { timeout: 30000 })
        .toBe(true);
      await expect(page.locator('html')).toHaveAttribute('q:container', 'paused');

      await page.locator('#catch-reset').click();
      await expect(page.locator('#catch-content')).toBeHidden();
      await expect(page.locator('#catch-fallback')).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('q:container', 'paused');

      await releaseDeferred(page, '#catch-release');
      await page.waitForLoadState('load');

      await expect(page.locator('#catch-content')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('#catch-thrower-client')).toBeAttached();
      await expect(page.locator('#catch-fallback')).toHaveCount(0);
      await expect(page.locator('#catch-deferred-ok')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('html')).toHaveAttribute('q:container', 'resumed');
    });

    test('an SSR error inside an embedded container swaps only that container boundary', async ({
      page,
    }) => {
      assertNoBrowserErrors(page);
      await page.goto(routeUrl('multi-container'), { waitUntil: 'commit' });

      await expect(page.locator('#catch-embed #catch-fallback')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('#catch-embed #catch-fallback-msg')).toHaveText(caughtError);
      await expect(page.locator('#catch-embed #catch-content')).toBeHidden();

      const hostBoundaryId = await page
        .locator('div[q\\:cc]:has(#catch-host-content)')
        .getAttribute('q:cc');
      const fragmentBoundaryId = await page.locator('#catch-embed [q\\:cc]').getAttribute('q:cc');
      expect(hostBoundaryId).not.toBeNull();
      expect(fragmentBoundaryId).toBe(hostBoundaryId);

      await expect(page.locator('#catch-host-content')).toBeVisible();
      await expect(page.locator('#catch-host-fb')).toHaveCount(0);

      await page.locator('#catch-host-button').click();
      await expect(page.locator('#catch-host-count')).toHaveText('1');

      await page.locator('#catch-embed #catch-fallback-button').click();
      await expect(page.locator('#catch-embed #catch-fallback-count')).toHaveText('1');
    });
  });

  test.describe('after resume', () => {
    test('SSR inner error, then a client throw makes the outer boundary replace the whole subtree', async ({
      page,
    }) => {
      assertNoBrowserErrors(page);
      await page.goto(routeUrl('nested'), { waitUntil: 'commit' });

      await expect(page.locator('#catch-inner')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('#catch-inner-msg')).toHaveText(caughtError);
      await expect(page.locator('#catch-outer')).toHaveCount(0);

      await page.locator('#catch-outer-throw').click();

      await expect(page.locator('#catch-outer')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('#catch-inner')).toHaveCount(0);
      await page.locator('#catch-outer-button').click();
      await expect(page.locator('#catch-outer-count')).toHaveText('1');
    });

    test('inert: a swapped-out content task does not re-run when an outside signal changes', async ({
      page,
    }) => {
      assertNoBrowserErrors(page);
      await page.goto(routeUrl('inert'), { waitUntil: 'commit' });

      await expect(page.locator('#catch-fallback')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('#catch-content')).toBeHidden();

      expect(await page.evaluate(() => (window as any).__catchDeadTaskClientRuns ?? 0)).toBe(0);

      await page.locator('#catch-inert-trigger').click();
      await expect(page.locator('#catch-inert-val')).toHaveText('1');

      expect(await page.evaluate(() => (window as any).__catchDeadTaskClientRuns ?? 0)).toBe(0);
    });
  });

  test.describe('integration', () => {
    test.describe('visible tasks', () => {
      test('useVisibleTask$ throw after resume is routed to the boundary without interaction', async ({
        page,
      }) => {
        const pageErrors = collectPageErrors(page);

        await page.goto(routeUrl('visible-task'), { waitUntil: 'commit' });

        await expect(page.locator('#catch-fallback')).toBeVisible({ timeout: 10000 });
        await expect(page.locator('#catch-fallback-msg')).toHaveText('caught: visible boom');
        await expect(page.locator('#catch-content')).toBeHidden();

        await page.locator('#catch-fallback-button').click();
        await expect(page.locator('#catch-fallback-count')).toHaveText('1');

        await page.waitForTimeout(200);
        expect(pageErrors.filter((message) => message.includes('visible boom'))).toEqual([]);
      });
    });

    test.describe('async signals', () => {
      test('async error read via `.error` is handled inline — the boundary never sees it', async ({
        page,
      }) => {
        await page.goto(routeUrl('async-error-inline'), { waitUntil: 'commit' });

        await expect(page.locator('#async-error')).toHaveText('handled: expected-async-error', {
          timeout: 10000,
        });
        await expect(page.locator('#catch-fallback')).toHaveCount(0);
      });

      test('async error read via `.value` propagates → caught by the Catch', async ({ page }) => {
        await page.goto(routeUrl('async-error-throw'), { waitUntil: 'commit' });

        await expect(page.locator('#catch-fallback-msg')).toHaveText(caughtError, {
          timeout: 10000,
        });
        await expect(page.locator('#async-value')).toHaveCount(0);
      });
    });

    test.describe('loaders', () => {
      test('loader error(500) is NOT caught by a Catch: the router returns a 500', async ({
        page,
      }) => {
        const response = await page.goto(routeUrl('loader-500'), { waitUntil: 'commit' });
        expect(response!.status()).toBe(500);
        await expect(page.locator('#catch-fallback')).toHaveCount(0);
        await expect(page.locator('#loader-500-body')).toHaveCount(0);
      });

      // reset re-invokes the loader; this asserts the opposite
      test.fixme('reset re-derives the identical fallback from the serialized loader value', async ({
        page,
      }) => {
        assertNoBrowserErrors(page);
        await page.goto(routeUrl('loader-data-throw'), { waitUntil: 'commit' });

        await expect(page.locator('#catch-fallback-msg')).toHaveText(
          'caught: loader data boom: loader-data-secret',
          { timeout: 10000 }
        );

        await page.locator('#catch-reset').click();
        await expect(page.locator('#catch-fallback-msg')).toHaveText(
          'caught: loader data boom: loader-data-secret',
          { timeout: 10000 }
        );
        await expect(page.locator('#catch-content')).toHaveCount(0);
      });

      // reset re-invokes the loader; this asserts the opposite
      test.fixme('reset does not re-invoke the loader: no q-data request fires for the reset', async ({
        page,
      }) => {
        assertNoBrowserErrors(page);
        await page.goto(routeUrl('loader-reset-no-refetch'), { waitUntil: 'commit' });

        await expect(page.locator('#catch-fallback')).toBeVisible({ timeout: 10000 });
        await page.waitForLoadState('networkidle');

        const loaderRequestsAfterReset: string[] = [];
        page.on('request', (req) => {
          if (/q-loader|q-data\.json/.test(req.url())) {
            loaderRequestsAfterReset.push(req.url());
          }
        });

        await page.locator('#catch-reset').click();
        await expect(page.locator('#catch-content')).toBeVisible({ timeout: 10000 });
        await page.waitForTimeout(300);

        expect(loaderRequestsAfterReset).toEqual([]);
      });
    });
  });
});

test.describe('qerror (client event channel)', () => {
  test.describe('qerror routing', () => {
    test('no boundary: a client throw still surfaces to the global error handler', async ({
      page,
    }) => {
      const pageErrors = collectPageErrors(page);

      await page.goto(routeUrl('no-boundary'), { waitUntil: 'commit' });
      await expect(page.locator('#catch-title')).toHaveText('Error handling e2e', {
        timeout: 10000,
      });

      await page.locator('#catch-no-boundary-throw').click();
      await expect(page.locator('#catch-no-boundary-touched')).toHaveText('1', { timeout: 10000 });

      await expect.poll(() => pageErrors, { timeout: 10000 }).toContain('no-boundary boom');
    });

    // https://github.com/QwikDev/qwik/issues/8962 — resumed dispatch bypasses the importError skip
    test.fixme('a failed qwikloader dynamic import (chunk 404) leaves the boundary inert', async ({
      page,
    }) => {
      const pageErrors = collectPageErrors(page);

      await page.addInitScript(() => {
        (window as any).__catchQErrors = [];
        document.addEventListener('qerror', (e: any) => {
          (window as any).__catchQErrors.push({ importError: e.detail?.importError ?? null });
        });
      });

      const blockedRequests: string[] = [];
      await page.route(/\/build\/.*CatchThrowOnClick.*q_e_click.*\.js/, (route) => {
        blockedRequests.push(route.request().url());
        return route.abort();
      });

      await page.goto(routeUrl('happy'), { waitUntil: 'commit' });
      await expect(page.locator('#catch-content')).toBeVisible({ timeout: 10000 });

      await page.locator('#catch-content-throw').click();

      // Rejections surface behind the loader's deferred queue; poll the qerror channel itself.
      await expect
        .poll(() => page.evaluate(() => (window as any).__catchQErrors.length), { timeout: 10000 })
        .toBeGreaterThanOrEqual(1);
      expect(blockedRequests.length).toBeGreaterThan(0);

      // Resume may add its own import rejection; single-report-per-dispatch is pinned in qwikloader.behavior.unit.ts.
      const qErrors = await page.evaluate(() => (window as any).__catchQErrors);
      expect(
        qErrors.filter((q: { importError: string | null }) => q.importError !== 'async')
      ).toEqual([]);

      await expect(page.locator('#catch-fallback')).toHaveCount(0);
      await expect(page.locator('[role="alert"]')).toHaveCount(0);
      await expect(page.locator('#catch-content')).toBeVisible();
      await expect(page.locator('#catch-content-touched')).toHaveText('0');
      expect(pageErrors).toEqual([]);
    });
  });
});

test.describe('onError$', () => {
  test('onError$ fires once with the error on a client-time throw', async ({ page }) => {
    assertNoBrowserErrors(page);
    await page.goto(routeUrl('onerror'), { waitUntil: 'commit' });

    await expect(page.locator('#catch-content')).toHaveText('content ok', { timeout: 10000 });
    await page.locator('#catch-onerror-throw').click();

    await expect(page.locator('#catch-fallback')).toBeVisible({ timeout: 10000 });
    await page.waitForFunction(() => (window as any).__catchOnErrorRuns >= 1);
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => (window as any).__catchOnErrorRuns)).toBe(1);
    expect(await page.evaluate(() => (window as any).__catchOnErrorMsg)).toBe('onerror boom');
  });

  test('onError$ receives info.phase "event" and a stable boundaryId for a real qwikloader throw', async ({
    page,
  }) => {
    assertNoBrowserErrors(page);
    await page.goto(routeUrl('onerror'), { waitUntil: 'commit' });

    await expect(page.locator('#catch-content')).toHaveText('content ok', { timeout: 10000 });
    await page.locator('#catch-onerror-throw').click();

    await expect(page.locator('#catch-fallback')).toBeVisible({ timeout: 10000 });
    await page.waitForFunction(() => (window as any).__catchOnErrorPhase !== undefined);
    expect(await page.evaluate(() => (window as any).__catchOnErrorPhase)).toBe('event');
    expect(await page.evaluate(() => (window as any).__catchOnCatchId)).toBeTruthy();
  });
});

test.describe('Catch reset', () => {
  for (const { mode, outOfOrder } of streamingModes) {
    test(`${mode}: reset on SSR resume re-executes the children and recovers`, async ({ page }) => {
      assertNoBrowserErrors(page);
      await page.goto(routeUrl('reset', { outOfOrder }), { waitUntil: 'commit' });
      await expect(page.locator('#catch-fallback')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('#catch-content')).toBeHidden();
      await expect(page.locator('[q\\:cc]')).toHaveCount(1);
      await expect(page.locator('[q\\:cf]')).toHaveCount(1);

      await page.locator('#catch-reset').click();

      await expect(page.locator('#catch-content')).toHaveCount(1, { timeout: 10000 });
      await expect(page.locator('#catch-content')).toBeVisible();
      await expect(page.locator('#catch-thrower-client')).toBeAttached();
      await expect(page.locator('#catch-fallback')).toHaveCount(0);

      await page.locator('#catch-content-button').click();
      await expect(page.locator('#catch-content-count')).toHaveText('1');

      await expect(page.locator('[q\\:cc]')).toHaveCount(0);
      await expect(page.locator('[q\\:cf]')).toHaveCount(0);
    });
  }

  test('reset on an always-throwing child re-derives the fallback client-side', async ({
    page,
  }) => {
    assertNoBrowserErrors(page);
    await page.goto(routeUrl('rederive'), { waitUntil: 'commit' });

    await expect(page.locator('#catch-fallback')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#catch-fallback-msg')).toHaveText(caughtError);
    expect(await page.evaluate(() => (window as any).__catchRederiveRuns ?? 0)).toBe(0);

    await page.locator('#catch-reset').click();

    await expect(page.locator('#catch-fallback-msg')).toHaveText('caught: catch always boom', {
      timeout: 10000,
    });
    await expect.poll(() => page.evaluate(() => (window as any).__catchRederiveRuns ?? 0)).toBe(1);
  });

  test('client error: reset re-supplies the content interactively', async ({ page }) => {
    assertNoBrowserErrors(page);
    await page.goto(routeUrl('reset-csr'), { waitUntil: 'commit' });
    await expect(page.locator('#catch-content')).toBeVisible({ timeout: 10000 });

    await page.locator('#catch-content-button').click();
    await expect(page.locator('#catch-content-count')).toHaveText('1');

    await page.locator('#catch-csr-throw').click();
    await expect(page.locator('#catch-fallback')).toBeVisible({ timeout: 10000 });

    await page.locator('#catch-reset').click();

    await expect(page.locator('#catch-content')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#catch-fallback')).toHaveCount(0);

    await page.locator('#catch-content-button').click();
    await expect(page.locator('#catch-content-count')).toHaveText('1');
  });

  test('second reset re-executes children of a Catch inside a Pending (re-error then recover)', async ({
    page,
  }) => {
    assertNoBrowserErrors(page);
    // OOOS: #8876 route shape + #8884 segment reset
    await page.goto(routeUrl('reset-reerror', { outOfOrder: false }), { waitUntil: 'commit' });
    await expect(page.locator('#catch-fallback')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#catch-fallback-msg')).toHaveText(caughtError);

    await page.locator('#catch-reset').click();
    await expect(page.locator('#catch-fallback-msg')).toContainText('client boom 1', {
      timeout: 10000,
    });

    await page.locator('#catch-reset').click();
    await expect(page.locator('#catch-reerror-recovered')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#catch-fallback')).toHaveCount(0);
  });

  test('reset re-executes children of a client-first (SPA-nav) Catch inside a Pending', async ({
    page,
  }) => {
    assertNoBrowserErrors(page);
    await page.goto(routeUrl('reset-spa'), { waitUntil: 'commit' });
    await expect(page.locator('#catch-spa-show')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#catch-fallback')).toHaveCount(0);

    await page.locator('#catch-spa-show').click();
    await expect(page.locator('#catch-fallback-msg')).toContainText('client boom 1', {
      timeout: 10000,
    });

    await page.locator('#catch-reset').click();
    await expect(page.locator('#catch-reerror-recovered')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#catch-fallback')).toHaveCount(0);
  });

  test.describe('nested boundaries', () => {
    test('SSR resume (real click): reset on a nested inner boundary re-executes its children, outer intact', async ({
      page,
    }) => {
      assertNoBrowserErrors(page);
      await page.goto(routeUrl('nested-reset', { outOfOrder: false }), { waitUntil: 'commit' });

      await expect(page.locator('#catch-fallback')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('#catch-outer-ok')).toBeVisible();
      await expect(page.locator('#catch-thrower-client')).toHaveCount(0);

      await page.locator('#catch-reset').click();

      await expect(page.locator('#catch-thrower-client')).toBeAttached({ timeout: 10000 });
      await expect(page.locator('#catch-fallback')).toHaveCount(0);
      await expect(page.locator('#catch-outer-ok')).toBeVisible();

      await page.locator('#catch-outer-ok-button').click();
      await expect(page.locator('#catch-outer-ok-count')).toHaveText('1');
    });

    test('SSR resume (real click): reset on a boundary nested inside a resumed SSR fallback re-derives the outer and recovers the inner', async ({
      page,
    }) => {
      assertNoBrowserErrors(page);
      await page.goto(routeUrl('fallback-nested-resume', { outOfOrder: false }), {
        waitUntil: 'commit',
      });

      await expect(page.locator('#catch-outer-fb')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('#catch-inner-reset')).toBeVisible();
      await expect(page.locator('#catch-thrower-client')).toHaveCount(0);

      await page.locator('#catch-inner-reset').click();

      await expect(page.locator('#catch-thrower-client')).toBeAttached({ timeout: 10000 });
      await expect(page.locator('#catch-outer-fb')).toBeVisible();
      await expect(page.locator('#catch-inner-reset')).toHaveCount(0);
    });
  });

  test.describe('through wrapper components', () => {
    test('reset re-executes async children through a Slot-projecting wrapper component', async ({
      page,
    }) => {
      assertNoBrowserErrors(page);
      // OOOS: #8876 route shape + #8884 segment reset
      await page.goto(routeUrl('reset-wrapped', { outOfOrder: false }), { waitUntil: 'commit' });
      await expect(page.locator('#catch-fallback')).toBeVisible({ timeout: 10000 });

      await page.locator('#catch-reset').click();

      await expect(page.locator('#catch-wrap-recovered')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('#catch-fallback')).toHaveCount(0);
    });

    test('wrapper key-swap: key bump re-executes the async child through a Slot wrapper', async ({
      page,
    }) => {
      assertNoBrowserErrors(page);
      // OOOS: #8876 route shape + #8884 segment reset
      await page.goto(routeUrl('reset-wrapped-key', { outOfOrder: false }), {
        waitUntil: 'commit',
      });
      await expect(page.locator('#catch-fallback')).toBeVisible({ timeout: 10000 });
      await page.locator('#catch-reset').click();
      await expect(page.locator('#catch-wrap-recovered')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('#catch-fallback')).toHaveCount(0);
    });
  });
});

test.describe('Catch in a production build (qDev=false)', () => {
  const prodUrl = (route: string) => routeUrl(route, { app: 'error-handling.prod' });

  test('an SSR-errored async signal serializes a redacted error, raw message nowhere in the page', async ({
    page,
  }) => {
    assertNoBrowserErrors(page);
    const response = await page.goto(prodUrl('async-error-captured'), { waitUntil: 'commit' });

    await expect(page.locator('#async-errored')).toHaveText('errored', { timeout: 10000 });
    const html = await response!.text();
    expect(html).not.toContain('captured-async-boom');

    await page.locator('#async-probe').click();
    await expect(page.locator('#async-digest')).not.toHaveText('unread');
    await expect(page.locator('#async-digest')).not.toHaveText('no-digest');
  });

  test('SSR swap: the prod-built client resumes the swapped page, fallback interactive', async ({
    page,
  }) => {
    assertNoBrowserErrors(page);
    await page.goto(prodUrl('basic'), { waitUntil: 'commit' });

    await expect(page.locator('#catch-fallback')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#catch-fallback-msg')).toHaveText('caught: An error occurred');
    await expect(page.locator('#catch-content')).toBeHidden();

    await page.locator('#catch-fallback-button').click();
    await expect(page.locator('#catch-fallback-count')).toHaveText('1');
  });

  test('client throw after resume shows the thrown message unredacted', async ({ page }) => {
    assertNoBrowserErrors(page);
    await page.goto(prodUrl('csr-event'), { waitUntil: 'commit' });

    await expect(page.locator('#catch-content')).toHaveText('content ok', { timeout: 10000 });
    await expect(page.locator('#catch-fallback')).toHaveCount(0);

    await page.locator('#catch-client-throw').click();

    await expect(page.locator('#catch-fallback')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#catch-fallback-msg')).toHaveText('caught: client click boom');

    await page.locator('#catch-fallback-button').click();
    await expect(page.locator('#catch-fallback-count')).toHaveText('1');
  });

  test('an app error carrying its own digest field still redacts', async ({ page }) => {
    assertNoBrowserErrors(page);
    await page.goto(prodUrl('digest-forgery'), { waitUntil: 'commit' });

    await expect(page.locator('#catch-fallback-msg')).toHaveText('caught: An error occurred', {
      timeout: 10000,
    });
    const digest = await page.locator('#catch-fallback-digest').innerText();
    expect(digest).not.toBe('forged-digest');
    expect(digest).not.toBe('none');
    expect(await page.locator('body').innerText()).not.toContain('digest secret boom');
  });

  test('reset flips a redacted SSR fallback to the raw client-derived message', async ({
    page,
  }) => {
    assertNoBrowserErrors(page);
    await page.goto(prodUrl('rederive'), { waitUntil: 'commit' });

    await expect(page.locator('#catch-fallback')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#catch-fallback-msg')).toHaveText('caught: An error occurred');

    await page.locator('#catch-reset').click();

    await expect
      .poll(() => page.evaluate(() => (window as any).__catchRederiveRuns ?? 0), { timeout: 10000 })
      .toBe(1);
    await expect(page.locator('#catch-fallback-msg')).toHaveText('caught: catch always boom');
  });

  test('reset round-trips through the prod serializer and re-executes the children', async ({
    page,
  }) => {
    assertNoBrowserErrors(page);
    await page.goto(prodUrl('reset'), { waitUntil: 'commit' });

    await expect(page.locator('#catch-fallback')).toBeVisible({ timeout: 10000 });

    await page.locator('#catch-reset').click();

    await expect(page.locator('#catch-content')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#catch-fallback')).toHaveCount(0);

    await page.locator('#catch-content-button').click();
    await expect(page.locator('#catch-content-count')).toHaveText('1');
  });
});
