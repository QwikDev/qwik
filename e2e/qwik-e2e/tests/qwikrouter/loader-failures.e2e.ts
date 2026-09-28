import { expect, test, type Page } from '@playwright/test';

const base = '/qwikrouter-test/loader-failures/';

const markDocument = (page: Page) =>
  page.evaluate(() => {
    (window as any).__loaderFailuresDocument = true;
  });

const isSameDocument = (page: Page) =>
  page.evaluate(() => (window as any).__loaderFailuresDocument === true);

// A crash's message reaches the browser only when the router is built for dev.
const crashMessage = (message: string) => new RegExp(`${message}|Internal Server Error`);

test.describe('loader failures', () => {
  test.describe('SSR', () => {
    test('a plain Error in middleware renders error.tsx at 500', async ({ page }) => {
      const response = await page.goto(`${base}middleware-crash/`);

      expect(response!.status()).toBe(500);
      await expect(page.locator('h1')).toHaveText('Custom Error Page');
      await expect(page.locator('.error-status')).toHaveText('500');
    });

    test('a plain Error in a blocking loader renders the route Catch fallback', async ({
      page,
    }) => {
      const response = await page.goto(`${base}blocking-crash/`);

      expect(response!.status()).toBe(200);
      await expect(page.locator('#catch-fallback')).toBeVisible();
      await expect(page.getByText('Custom Error Page')).toHaveCount(0);
    });

    test("after a blocking loader crashes, a later loader's data is not in the page", async ({
      page,
    }) => {
      const response = await page.goto(`${base}guard-crash/`);

      expect(await response!.text()).not.toContain('secret invoices');
      await expect(page.locator('#catch-fallback')).toBeVisible();
    });
  });

  test.describe('client navigation', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(base);
      await markDocument(page);
    });

    test('a plain Error in a blocking loader shows the route Catch fallback', async ({ page }) => {
      await page.click('#to-blocking-crash');

      await expect(page.locator('#catch-fallback')).toContainText(crashMessage('loader boom'));
      await expect(page.getByText('Custom Error Page')).toHaveCount(0);
      expect(await isSameDocument(page)).toBe(true);
    });

    test("a streamed loader's HttpError shows the route Catch fallback", async ({ page }) => {
      await page.click('#to-streamed-http-error');

      await expect(page.locator('#catch-fallback')).toContainText('No such review');
      await expect(page.getByText('Custom Error Page')).toHaveCount(0);
      expect(await isSameDocument(page)).toBe(true);
    });
  });

  test.describe('invalidate()', () => {
    test('a loader throwing a plain Error keeps its data beside .error', async ({
      page,
      context,
    }) => {
      await page.goto(`${base}refresh/`);
      await expect(page.locator('#blocking-value')).toHaveText('blocking data');
      await expect(page.locator('#streamed-value')).toHaveText('streamed data');
      await context.addCookies([{ name: 'loader-failure', value: 'crash', url: page.url() }]);

      await page.click('#refresh-blocking');
      await page.click('#refresh-streamed');

      await expect(page.locator('#blocking-error')).toContainText(crashMessage('refresh boom'));
      await expect(page.locator('#blocking-value')).toHaveText('blocking data');
      await expect(page.locator('#streamed-error')).toContainText(crashMessage('refresh boom'));
      await expect(page.locator('#streamed-value')).toHaveText('streamed data');
    });
  });
});
