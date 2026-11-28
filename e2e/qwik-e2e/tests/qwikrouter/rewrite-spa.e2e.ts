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

  test('an action superseded while q-route.json is pending settles its submit promise', async ({
    page,
  }) => {
    await page.goto(pretty);
    await expect(page.locator('#rewrite-spa-target')).toBeVisible();
    const held = await holdPrettyRoute(page);

    await page.locator('#rewrite-spa-submit-js').click();
    await held.requested;
    await page.locator('#rewrite-spa-back').click();

    await expect(page.locator('#rewrite-spa-source')).toBeVisible();
    await expect.poll(() => page.evaluate(() => (window as any).__submitOutcome)).toBe('rejected');
    held.release();
  });
});

test.describe('a URL another app serves on the same origin', () => {
  const home = '/qwikrouter-test/rewrite-spa/';
  const other = '/rewrite-spa-other-app/';

  /** Another app owns the URL: the page loads, q-route.json answers with its 404 or a redirect. */
  async function otherApp(page: Page, qRouteStatus: 404 | 302) {
    await page.route(`**${other}q-route.json`, (route) =>
      route.fulfill({
        status: qRouteStatus,
        contentType: 'text/html',
        headers: qRouteStatus === 302 ? { location: other } : {},
        body: 'not qwik',
      })
    );
    await page.route(`**${other}`, (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: '<h1 id="other">other</h1>' })
    );
  }

  for (const status of [404, 302] as const) {
    test(`q-route.json ${status}: full page load, and back really returns`, async ({ page }) => {
      await otherApp(page, status);
      await page.goto(home);
      await page.locator('[data-test-link="rewrite-spa-other"]').click();

      await expect(page.locator('#other')).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`${other}$`));

      await page.goBack();
      await expect(page).toHaveURL(new RegExp(`${home}$`));
      await expect(page.locator('[data-test-link="rewrite-spa-other"]')).toBeVisible();
      await expect(page.locator('#other')).toBeHidden();
    });
  }

  test('forward returns to the other app, and a second visit works', async ({ page }) => {
    await otherApp(page, 404);
    await page.goto(home);
    const link = page.locator('[data-test-link="rewrite-spa-other"]');
    await link.click();
    await expect(page.locator('#other')).toBeVisible();

    await page.goBack();
    await expect(link).toBeVisible();
    await page.goForward();
    await expect(page.locator('#other')).toBeVisible();

    await page.goBack();
    await expect(link).toBeVisible();
    await link.click();
    await expect(page.locator('#other')).toBeVisible();
  });

  test('back steps through client navigated pages one at a time', async ({ page }) => {
    await otherApp(page, 404);
    await page.goto(home);
    await page.locator('[data-test-link="rewrite-spa-target"]').click();
    await expect(page.locator('#rewrite-spa-target')).toBeVisible();
    await page.locator('[data-test-link="rewrite-spa-other"]').click();
    await expect(page.locator('#other')).toBeVisible();

    await page.goBack();
    await expect(page.locator('#rewrite-spa-target')).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`${home}$`));
    await expect(page.locator('[data-test-link="rewrite-spa-other"]')).toBeVisible();
  });

  test('a matched dynamic route does not reload on a q-route.json 404 (static hosting)', async ({
    page,
  }) => {
    await page.route('**/rewrite-spa/dynamic/one/q-route.json', (route) =>
      route.fulfill({ status: 404, contentType: 'text/html', body: 'host 404' })
    );
    await page.goto(home);
    await page.evaluate(() => ((window as any).__noReload = true));

    await page.locator('[data-test-link="rewrite-spa-dynamic"]').click();

    await expect(page.locator('#rewrite-spa-dynamic')).toHaveText('one');
    expect(await page.evaluate(() => (window as any).__noReload)).toBe(true);
  });
});
