import { expect, test, type Page } from '@playwright/test';

const pretty = '/qwikrouter-test/rewrite-spa/pretty/';
const target = '/qwikrouter-test/rewrite-spa/target/';

/** Holds the `pretty` q-route.json response until `release()` is called. */
async function holdPrettyRoute(page: Page) {
  let release!: () => void;
  let started!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const requested = new Promise<void>((resolve) => (started = resolve));
  await page.route(`**${pretty}q-route.json`, async (route) => {
    const response = await route.fetch();
    started();
    await gate;
    await route.fulfill({ response }).catch(() => {});
  });
  return { requested, release };
}

test.describe('rewrite to a different route', () => {
  test('SSR serves the target page under the original URL', async ({ page }) => {
    const response = await page.goto(pretty);
    expect(response?.status()).toBe(200);
    await expect(page.locator('#rewrite-spa-target')).toBeVisible();
    await expect(page.locator('#rewrite-spa-original')).toHaveText(pretty);
    await expect(page.locator('#rewrite-spa-served')).toHaveText(target);
  });

  test('a loader fetched on a server-rendered rewritten page goes through the visible URL', async ({
    page,
  }) => {
    await page.goto(pretty);
    await expect(page.locator('#rewrite-spa-target')).toBeVisible();
    const loaderPaths: string[] = [];
    page.on('request', (r) => {
      const { pathname } = new URL(r.url());
      if (pathname.includes('/q-loader-')) {
        loaderPaths.push(pathname);
      }
    });

    await page.locator('#rewrite-spa-read-lazy').click();

    // Same originalUrl the SSR loaders saw.
    await expect(page.locator('#rewrite-spa-lazy')).toHaveText(pretty);
    expect(loaderPaths.length).toBeGreaterThan(0);
    expect(loaderPaths.filter((p) => !p.startsWith(pretty))).toEqual([]);
  });

  test('q-route.json uses the cache headers the rewriting middleware set', async ({ request }) => {
    const plain = await request.get(`${pretty}q-route.json`);
    expect(await plain.json()).toEqual({ p: target });
    expect(plain.headers()['cdn-cache-control']).toBeUndefined();
    expect(plain.headers()['cache-tag']).toBeUndefined();

    const cached = await request.get('/qwikrouter-test/rewrite-spa/pretty-cached/q-route.json');
    expect(await cached.json()).toEqual({ p: target });
    expect(cached.headers()['cdn-cache-control']).toContain('max-age=60');
    expect(cached.headers()['cache-tag']).toBe('rewrite-spa-target');
  });

  test('SPA navigation renders the target and keeps the URL, without a reload', async ({
    page,
  }) => {
    const pageErrors: Error[] = [];
    page.on('pageerror', (err) => pageErrors.push(err));
    await page.goto('/qwikrouter-test/rewrite-spa/');
    await page.evaluate(() => ((window as any).__noReload = true));

    await page.locator('[data-test-link="rewrite-spa-pretty"]').click();

    await expect(page.locator('#rewrite-spa-target')).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`${pretty}$`));
    await expect(page.locator('#rewrite-spa-original')).toHaveText(pretty);
    await expect(page.locator('#rewrite-spa-served')).toHaveText(target);
    expect(await page.evaluate(() => (window as any).__noReload)).toBe(true);
    expect(pageErrors).toEqual([]);
  });

  test('the target route loader sees the visible URL of every rewritten navigation', async ({
    page,
  }) => {
    const prettyCached = '/qwikrouter-test/rewrite-spa/pretty-cached/';
    await page.goto('/qwikrouter-test/rewrite-spa/');

    await page.locator('[data-test-link="rewrite-spa-pretty"]').click();
    await expect(page.locator('#rewrite-spa-original')).toHaveText(pretty);

    await page.goBack();
    await expect(page.locator('#rewrite-spa-source')).toBeVisible();

    await page.locator('[data-test-link="rewrite-spa-pretty-cached"]').click();
    await expect(page).toHaveURL(new RegExp(`${prettyCached}$`));
    await expect(page.locator('#rewrite-spa-original')).toHaveText(prettyCached);
    await expect(page.locator('#rewrite-spa-served')).toHaveText(target);
  });

  test('submitting an action on a rewritten URL keeps rendering the target, not the 404', async ({
    page,
  }) => {
    const pageErrors: Error[] = [];
    page.on('pageerror', (err) => pageErrors.push(err));
    await page.goto(pretty);
    await expect(page.locator('#rewrite-spa-target')).toBeVisible();

    await page.locator('#rewrite-spa-submit').click();

    await expect(page.locator('#rewrite-spa-action-done')).toBeVisible();
    await expect(page.locator('#rewrite-spa-target')).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`${pretty}$`));
    await expect(page.locator('#rewrite-spa-original')).toHaveText(pretty);
    expect(pageErrors).toEqual([]);
  });

  test('a navigation started while q-route.json is pending wins', async ({ page }) => {
    const prettyCached = '/qwikrouter-test/rewrite-spa/pretty-cached/';
    const pageErrors: Error[] = [];
    page.on('pageerror', (err) => pageErrors.push(err));
    await page.goto('/qwikrouter-test/rewrite-spa/');
    await page.evaluate(() => ((window as any).__noReload = true));
    const held = await holdPrettyRoute(page);

    await page.locator('[data-test-link="rewrite-spa-pretty"]').click();
    await held.requested;
    await page.locator('[data-test-link="rewrite-spa-pretty-cached"]').click();

    await expect(page).toHaveURL(new RegExp(`${prettyCached}$`));
    await expect(page.locator('#rewrite-spa-original')).toHaveText(prettyCached);

    held.release();
    await page.waitForTimeout(200);
    await expect(page).toHaveURL(new RegExp(`${prettyCached}$`));
    await expect(page.locator('#rewrite-spa-original')).toHaveText(prettyCached);
    expect(await page.evaluate(() => (window as any).__noReload)).toBe(true);
    expect(pageErrors).toEqual([]);
  });

  test('an action on a rewritten page needs no q-route.json lookup and settles its submit promise', async ({
    page,
  }) => {
    await page.goto(pretty);
    await expect(page.locator('#rewrite-spa-target')).toBeVisible();
    const routeLookups: string[] = [];
    page.on('request', (r) => r.url().includes('q-route.json') && routeLookups.push(r.url()));

    await page.locator('#rewrite-spa-submit-js').click();

    await expect.poll(() => page.evaluate(() => (window as any).__submitOutcome)).toBe('resolved');
    await expect(page.locator('#rewrite-spa-action-done')).toBeVisible();
    await expect(page.locator('#rewrite-spa-target')).toBeVisible();
    expect(routeLookups).toEqual([]);
  });
});
