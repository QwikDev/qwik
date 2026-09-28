import { expect, test, type Page } from '@playwright/test';

const base = '/qwikrouter-test/segment-errors/';

const markDocument = (page: Page) =>
  page.evaluate(() => {
    (window as any).__segmentErrorsDocument = true;
  });

const isSameDocument = (page: Page) =>
  page.evaluate(() => (window as any).__segmentErrorsDocument === true);

test.describe('segment errors', () => {
  test.describe('SSR', () => {
    test("a layout loader's 401 renders the error.tsx beside that layout, under the layouts above it", async ({
      page,
    }) => {
      const response = await page.goto(`${base}layout-guard/`);

      expect(response!.status()).toBe(401);
      await expect(page.locator('#guard-error')).toHaveText('401 Sign in');
      await expect(page.locator('#section-data')).toHaveText('section data');
      await expect(page.locator('#guard-layout')).toHaveCount(0);
    });

    test("a layout middleware's 403 renders the error.tsx beside that layout, and neither secret is in the HTML", async ({
      page,
    }) => {
      const response = await page.goto(`${base}layout-middleware/`);

      expect(response!.status()).toBe(403);
      const html = await response!.text();
      expect(html).not.toContain('layout secret');
      expect(html).not.toContain('page secret');
      await expect(page.locator('#members-error')).toHaveText('403 Members only');
      await expect(page.locator('#section-data')).toHaveText('section data');
    });
  });

  test.describe('client navigation', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(base);
      await markDocument(page);
    });

    test("a layout loader's 401 renders the error.tsx beside that layout, keeping the URL", async ({
      page,
    }) => {
      await page.click('#to-layout-guard');

      await expect(page.locator('#guard-error')).toHaveText('401 Sign in');
      await expect(page.locator('#section-data')).toHaveText('section data');
      await expect(page.locator('#guard-layout')).toHaveCount(0);
      await expect(page).toHaveURL(`${base}layout-guard/`);
      expect(await isSameDocument(page)).toBe(true);
    });
  });
});
