import { test, expect } from '@playwright/test';
import { assertNoBrowserErrors } from './e2e-helpers';

const streamingModes = [
  { mode: 'in-order', outOfOrder: false },
  { mode: 'out-of-order', outOfOrder: true },
] as const;
const caughtError = /^caught: .+/;
const routeUrl = (route: string, { outOfOrder = true, app = 'catch-render' } = {}) =>
  `/${app}/${route}?outOfOrder=${outOfOrder}`;
const prodUrl = (route: string) => routeUrl(route, { app: 'catch-render.prod' });

test.describe('compiled Catch render boundaries', () => {
  for (const app of ['catch-render', 'catch-render.prod']) {
    for (const mode of ['event', 'async', 'sync', 'task', 'visible', 'cleanup']) {
      test(`${app}: catches a cold ${mode} failure and resumes its fallback`, async ({ page }) => {
        assertNoBrowserErrors(page);
        await page.goto(`${routeUrl('runtime-errors', { app })}&mode=${mode}`);
        if (mode === 'sync') {
          await page.locator('#runtime-sync').click();
        } else {
          await page.locator('#runtime-fail').click();
          if (mode === 'cleanup') {
            await expect(page.locator('#runtime-fail')).toHaveText('1');
            await page.locator('#runtime-fail').click();
          }
        }
        await expect(page.locator('#catch-fallback-msg')).toHaveText(/caught: .*failed/);
        await expect(page.locator('#runtime-fail')).toHaveCount(0);
        await page.locator('#catch-fallback-button').click();
        await expect(page.locator('#catch-fallback-count')).toHaveText('1');
      });
    }
  }

  test('production Catch preserves an authored document and resumes its content', async ({
    page,
  }) => {
    assertNoBrowserErrors(page);
    const response = await page.goto(`${prodUrl('basic')}&documentCatch`);
    const html = await response!.text();
    expect(html.match(/<head(?:\s|>)/g)).toHaveLength(1);
    expect(html.match(/<body(?:\s|>)/g)).toHaveLength(1);
    await expect(page).toHaveTitle('Error handling e2e');
    await expect(page.locator('#catch-fallback-button')).toBeVisible();
    await page.locator('#catch-fallback-button').click();
    await expect(page.locator('#catch-fallback-count')).toHaveText('1');
  });

  test('production Catch recovers a plain capture encoder failure after document publication', async ({
    page,
  }) => {
    assertNoBrowserErrors(page);
    const response = await page.goto(`${prodUrl('capture-failure')}&documentCatch`);
    const html = await response!.text();
    expect(html).not.toContain('PRIVATE_CAPTURE_');
    await expect(page.locator('#failed-capture')).toHaveCount(0);
    await expect(page.locator('#document-caught')).toHaveText('0');
    await page.locator('#document-caught').click();
    await expect(page.locator('#document-caught')).toHaveText('1');
  });

  test('production useOn reaches a late Catch fallback after an empty placeholder', async ({
    page,
  }, testInfo) => {
    assertNoBrowserErrors(page);
    const releaseId = `empty-use-on-${testInfo.workerIndex}-${Date.now()}`;
    const response = await page.goto(`${prodUrl('use-on-catch')}&empty&release=${releaseId}`, {
      waitUntil: 'commit',
    });
    await expect(page.locator('#release')).toBeAttached();
    await expect(page.locator('#waiting-button')).toHaveCount(0);
    await expect(page.locator('#caught-button')).toHaveCount(0);
    const releaseUrl = await page.locator('#release').getAttribute('data-release-url');
    expect((await page.request.post(new URL(releaseUrl!, page.url()).toString())).ok()).toBe(true);
    await expect(page.locator('#caught-button')).toHaveText('0');
    await page.locator('#caught-button').click();
    await expect(page.locator('#caught-button')).toHaveText('1');
    await page.waitForLoadState('load');
    expect(await response!.text()).not.toContain('PRIVATE_');
  });

  test('production row parameters and deferred clientOnly resume after the shell', async ({
    page,
  }, testInfo) => {
    assertNoBrowserErrors(page);
    const releaseId = `eager-${testInfo.workerIndex}-${Date.now()}`;
    await page.goto(`${prodUrl('publication-regressions')}&release=${releaseId}`, {
      waitUntil: 'commit',
    });
    await expect(page.locator('#eager-placeholder')).toBeVisible();
    await expect(page.locator('#eager-result')).toHaveCount(0);
    await expect(page.locator('#row-select')).toHaveAttribute('q:p', /^\d+$/);
    await page.locator('#row-select').click();
    await expect(page.locator('#row-selected')).toHaveText('business:0:Alpha');
    const releaseUrl = await page.locator('#release').getAttribute('data-release-url');
    expect((await page.request.post(new URL(releaseUrl!, page.url()).toString())).ok()).toBe(true);
    await expect(page.locator('#eager-result')).toHaveText('17');
    await expect(page.locator('#eager-placeholder')).toHaveCount(0);
    await page.waitForLoadState('load');
  });

  test('production useOn survives a streamed Catch replacement', async ({ page }, testInfo) => {
    assertNoBrowserErrors(page);
    const releaseId = `use-on-${testInfo.workerIndex}-${Date.now()}`;
    const response = await page.goto(`${prodUrl('use-on-catch')}&release=${releaseId}`, {
      waitUntil: 'commit',
    });
    await expect(page.locator('#waiting-button')).toHaveText('0');
    await expect(page.locator('#caught-button')).toHaveCount(0);
    await page.locator('#waiting-button').click();
    await expect(page.locator('#waiting-button')).toHaveText('1');
    const releaseUrl = await page.locator('#release').getAttribute('data-release-url');
    expect((await page.request.post(new URL(releaseUrl!, page.url()).toString())).ok()).toBe(true);
    await expect(page.locator('#waiting-button')).toHaveCount(0);
    await expect(page.locator('#caught-button')).toHaveText('1');
    await page.locator('#caught-button').click();
    await expect(page.locator('#caught-button')).toHaveText('2');
    await page.waitForLoadState('load');
    expect(await response!.text()).not.toContain('PRIVATE_');
  });

  test('production publication streams Catch and excludes discarded state', async ({ page }) => {
    assertNoBrowserErrors(page);
    const response = await page.goto(prodUrl('state-publication'));
    const html = await response!.text();
    expect(html).toContain('id="pending-shell"');
    expect(html).not.toContain('PRIVATE_');
    await expect(page.locator('#sync-caught p')).toHaveText('An error occurred');
    await expect(page.locator('#async-caught p')).toHaveText('An error occurred');
    await expect(page.locator('#encoder-caught p')).toHaveText('An error occurred');
    await page.locator('#encoder-caught button').click();
    await expect(page.locator('#encoder-caught .count')).toHaveText('1');
    await expect(page.locator('#async-caught .digest')).not.toBeEmpty();
    await expect(page.locator('#async-caught .digest')).toHaveCSS('color', 'rgb(1, 2, 3)');
    await expect(page.locator('#pending-shell')).toHaveCount(0);
    await page.locator('#async-caught button').click();
    await expect(page.locator('#async-caught .count')).toHaveText('1');
    await page.locator('#sync-caught button').click();
    await expect(page.locator('#sync-caught .count')).toHaveText('1');
    await page.locator('#shared-button').click();
    await expect(page.locator('#shared-count')).toHaveText('1');
  });

  test('production sends the Pending shell before the deferred Catch fallback', async () => {
    const response = await fetch(`http://localhost:3301${prodUrl('state-publication')}`);
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let html = '';
    while (!html.includes('id="pending-shell"')) {
      const chunk = await reader.read();
      expect(chunk.done).toBe(false);
      html += decoder.decode(chunk.value, { stream: true });
    }
    expect(html).not.toContain('id="async-caught"');
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) {
        break;
      }
      html += decoder.decode(chunk.value, { stream: true });
    }
    expect(html).toContain('id="async-caught"');
    expect(html).not.toContain('PRIVATE_');
  });

  for (const { mode, outOfOrder } of streamingModes) {
    test(`${mode}: sync render failure selects an interactive fallback`, async ({ page }) => {
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

  test('SSR nested: the outer replaces the inner fallback when both renders fail', async ({
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

  test('production SSR: the client resumes an interactive fallback', async ({ page }) => {
    assertNoBrowserErrors(page);
    await page.goto(prodUrl('basic'), { waitUntil: 'commit' });

    await expect(page.locator('#catch-fallback')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#catch-fallback-msg')).toHaveText('caught: An error occurred');
    await expect(page.locator('#catch-content')).toBeHidden();

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

  for (const { mode, outOfOrder } of streamingModes) {
    test(`${mode}: catches a nested Pending rejection and resumes the fallback`, async ({
      page,
    }) => {
      assertNoBrowserErrors(page);
      const response = await page.goto(routeUrl('async-error-throw', { outOfOrder }));
      await expect(page.locator('#catch-fallback')).toBeVisible();
      const html = await response!.text();
      if (!outOfOrder) {
        expect(html).not.toContain('id="async-loading"');
      }
      expect(html).not.toContain('id="async-value"');
      expect(html).not.toMatch(/qErr\(|qInstallErrorSwap/);
      await page.locator('#catch-fallback-button').click();
      await expect(page.locator('#catch-fallback-count')).toHaveText('1');
    });

    test(`${mode}: a Catch fallback arrives inside an outer Pending`, async ({ page }) => {
      assertNoBrowserErrors(page);
      await page.goto(routeUrl('pending-deferred', { outOfOrder }));
      await expect(page.locator('#catch-deferred-ok')).toBeVisible();
      await expect(page.locator('#catch-fallback')).toBeVisible();
      await expect(page.locator('#catch-content')).toHaveCount(0);
      await page.locator('#catch-fallback-button').click();
      await expect(page.locator('#catch-fallback-count')).toHaveText('1');
    });
  }

  for (const app of ['catch-render', 'catch-render.prod']) {
    test(`${app}: catches a reactive render error after cold resume`, async ({ page }) => {
      assertNoBrowserErrors(page);
      await page.goto(routeUrl('reactive', { app }));
      await expect(page.locator('#catch-content')).toHaveText('ready');
      await page.locator('#catch-fail').click();
      await expect(page.locator('#catch-content')).toHaveCount(0);
      await expect(page.locator('#catch-fallback-msg')).toHaveText('caught: client render failed');
      await page.locator('#catch-fallback-button').click();
      await expect(page.locator('#catch-fallback-count')).toHaveText('1');
    });
  }
  for (const app of ['catch-render', 'catch-render.prod']) {
    for (const form of ['inline', 'dollar', 'local', 'imported']) {
      test(`${app}: resumes an interactive ${form} QRL fallback with cold chunks`, async ({
        page,
      }) => {
        assertNoBrowserErrors(page);
        await page.goto(`${routeUrl('fallback-forms', { app })}&form=${form}`);
        await expect(page.locator('#catch-content')).toHaveText('ready');
        await expect(page.locator('#catch-fallback')).toHaveCount(0);
        await page.locator('#catch-fail').click();
        await expect(page.locator('#catch-content')).toHaveCount(0);
        await expect(page.locator('#catch-fallback-msg')).toHaveText(
          `caught: ${form === 'imported' ? '' : 'captured: '}client render failed`
        );
        await page.locator('#catch-fallback-button').click();
        await expect(page.locator('#catch-fallback-count')).toHaveText('1');
      });
    }
  }
  test('production async render errors do not leak into HTML or serialized state', async ({
    page,
  }) => {
    assertNoBrowserErrors(page);
    const response = await page.goto(prodUrl('async-error-throw'));
    await expect(page.locator('#catch-fallback-msg')).toHaveText('caught: An error occurred');
    expect(await response!.text()).not.toContain('unexpected-async-error');
    await page.locator('#catch-fallback-button').click();
    await expect(page.locator('#catch-fallback-count')).toHaveText('1');
  });
});
