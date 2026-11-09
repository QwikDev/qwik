import { expect, test, type Page } from '@playwright/test';

const base = '/qwikrouter-test/returned-control-flow';
const actionRedirectTarget = `${base}/target/`;

async function replaceActionRedirect(page: Page, target: string) {
  await page.route(
    (url) => url.searchParams.has('qaction'),
    async (route) => {
      const response = await route.fetch();
      const body = await response.text();
      expect(body).toContain(actionRedirectTarget);
      await route.fulfill({ response, body: body.replace(actionRedirectTarget, target) });
    }
  );
}

// Returning ev.redirect()/ev.error() must behave the same as throwing them.
test.describe('returned control-flow signals', () => {
  test('loader returning redirect redirects', async ({ page }) => {
    await page.goto(`${base}/loader-redirect/`);
    await expect(page.locator('#returned-control-flow-target')).toBeVisible();
  });

  test('request handler returning redirect redirects', async ({ page }) => {
    await page.goto(`${base}/handler-redirect/`);
    await expect(page.locator('#returned-control-flow-target')).toBeVisible();
  });

  test('loader returning error renders the error response', async ({ page }) => {
    const response = await page.goto(`${base}/loader-error/`);
    expect(response?.status()).toEqual(401);
    await expect(page.locator('body')).toContainText('returned-loader-error');
  });

  test('action returning error responds with the error status', async ({ page }) => {
    await page.goto(`${base}/action-error/`);
    // Submit via the real form so the request carries a valid Origin (passes CSRF).
    const [response] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('qaction=')),
      page.locator('button[type="submit"]').click(),
    ]);
    expect(response.status()).toEqual(403);
  });

  test('action submission preserves current search params', async ({ page }) => {
    await page.goto(`${base}/action-error/?foo=bar&tag=a&tag=b`);
    const [response] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('qaction=')),
      page.locator('button[type="submit"]').click(),
    ]);
    const actionUrl = new URL(response.url());
    expect(actionUrl.searchParams.get('foo')).toEqual('bar');
    expect(actionUrl.searchParams.getAll('tag')).toEqual(['a', 'b']);
  });

  test('JSON action redirect responds with an envelope and navigates the page', async ({
    page,
  }) => {
    await page.goto(`${base}/action-redirect/`);
    const [response] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('qaction=')),
      page.locator('button[type="submit"]').click(),
    ]);
    // Redirect is carried in the JSON body (status 200) so fetch doesn't auto-follow it.
    expect(response.status()).toEqual(200);
    expect(response.headers()['location']).toBeUndefined();
    // The 200 envelope must not be cached, or a stale redirect could be replayed.
    expect(response.headers()['cache-control']).toContain('no-store');
    // The client then navigates to the redirect target.
    await expect(page.locator('#returned-control-flow-target')).toBeVisible();
  });

  test('JSON action redirect works even when the signal is neither thrown nor returned', async ({
    page,
  }) => {
    await page.goto(`${base}/action-redirect-discarded/`);
    const [response] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('qaction=')),
      page.locator('button[type="submit"]').click(),
    ]);
    expect(response.headers()['location']).toBeUndefined();
    await expect(page.locator('#returned-control-flow-target')).toBeVisible();
  });

  test('JSON action redirect rejects executable URLs', async ({ page }) => {
    await page.goto(`${base}/action-redirect/`);
    await replaceActionRedirect(page, 'javascript:window.__unsafeRedirectExecuted=true');

    const error = page.waitForEvent('pageerror');
    await page.locator('button[type="submit"]').click();
    expect((await error).message).toContain('Unsupported redirect protocol: javascript:');
    expect(await page.evaluate(() => (window as any).__unsafeRedirectExecuted)).toBeUndefined();
    await expect(page).toHaveURL(new RegExp(`${base}/action-redirect/$`));
  });

  test('JSON action redirect permits external HTTPS URLs', async ({ page }) => {
    await page.goto(`${base}/action-redirect/`);
    await replaceActionRedirect(page, 'https://external.example/landing');
    await page.route('https://external.example/landing', async (route) => {
      await route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>External</h1>' });
    });

    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL('https://external.example/landing');
    await expect(page.locator('h1')).toHaveText('External');
  });

  test('JSON loader redirect rejects executable URLs', async ({ page }) => {
    await page.goto('/qwikrouter-test/loader-redirect/');
    await page.route('**/q-loader-*', async (route) => {
      const response = await route.fetch();
      const body = await response.text();
      const target = '/qwikrouter-test/loader-redirect/target/?done=true';
      if (!body.includes(target)) {
        await route.fulfill({ response });
        return;
      }
      await route.fulfill({
        response,
        body: body.replace(target, 'javascript:window.__unsafeRedirectExecuted=true'),
      });
    });

    const error = page.waitForEvent('pageerror');
    await page.locator('#loader-redirect-btn').click();
    expect((await error).message).toContain('Unsupported redirect protocol: javascript:');
    expect(await page.evaluate(() => (window as any).__unsafeRedirectExecuted)).toBeUndefined();
    expect(new URL(page.url()).origin).toBe('http://localhost:3301');
  });
});
