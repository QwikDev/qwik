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
    test(`${mode}: buffers a nested Pending rejection and resumes the fallback`, async ({
      page,
    }) => {
      assertNoBrowserErrors(page);
      const response = await page.goto(routeUrl('async-error-throw', { outOfOrder }));
      await expect(page.locator('#catch-fallback')).toBeVisible();
      const html = await response!.text();
      expect(html).not.toContain('id="async-loading"');
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
