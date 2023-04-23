import { expect, test } from '@playwright/test';
import {
  assertPage,
  getScrollHeight,
  getWindowScrollXY,
  linkNavigate,
  load,
  scrollDetector,
  scrollTo,
} from './util.js';

test.describe('actions', () => {
  test.describe('mpa', () => {
    test.use({ javaScriptEnabled: false });
    tests();
  });

  test.describe('spa', () => {
    test.use({ javaScriptEnabled: true });
    tests();
    spaOnlyTests();
  });

  function spaOnlyTests() {
    test.describe('scroll-restoration', () => {
      test('should not refresh again on popstate after manual refresh', async ({ page }) => {
        await page.goto('/qwikcity-test/scroll-restoration/page-long/');
        const link = page.locator('#to-page-short');
        await link.click();

        await expect(page.locator('h1')).toHaveText('Page Short');

        await page.reload();
        await expect(page.locator('h1')).toHaveText('Page Short');

        page.addListener('domcontentloaded', () => {
          throw new Error('Full-page refresh should not happen on popstate');
        });
        await page.goBack();

        await expect(page.locator('h1')).toHaveText('Page Long');
      });
      test('should scroll on hash change', async ({ page }) => {
        await page.goto('/qwikcity-test/scroll-restoration/hash/');

        const link = page.locator('#hash-1');
        await link.click();

        await page.waitForTimeout(50);
        expect(toPath(page.url())).toEqual('/qwikcity-test/scroll-restoration/hash/#hash-2');
        await page.waitForTimeout(50);
        const scrollY1 = (await getWindowScrollXY(page))[1];
        expect(scrollY1).toBeGreaterThan(1090);
        expect(scrollY1).toBeLessThan(1110);

        const link2 = page.locator('#hash-2');
        await scrollTo(page, 0, 1000);
        await link2.click();

        await page.waitForTimeout(50);
        expect(toPath(page.url())).toEqual('/qwikcity-test/scroll-restoration/hash/#hash-1');
        await page.waitForTimeout(50);
        const scrollY2 = (await getWindowScrollXY(page))[1];
        expect(scrollY2).toBeGreaterThan(70);
        expect(scrollY2).toBeLessThan(90);

        const link3 = page.locator('#no-hash');
        await scrollTo(page, 0, 2000);
        await link3.click();

        await page.waitForTimeout(50);
        expect(toPath(page.url())).toEqual('/qwikcity-test/scroll-restoration/hash/');
        await page.waitForTimeout(50);
        expect(await getWindowScrollXY(page)).toStrictEqual([0, 0]);
      });
      test('should restore scroll on back and forward navigations', async ({ page }) => {
        await page.goto('/qwikcity-test/scroll-restoration/page-long/');

        const link = page.locator('#to-page-short');
        const scrollHeightLong = await getScrollHeight(page);
        await scrollTo(page, 0, scrollHeightLong);
        const scrollDetector1 = scrollDetector(page);
        await link.click();

        await scrollDetector1;
        await expect(page.locator('h1')).toHaveText('Page Short');
        await page.waitForTimeout(50);
        expect(toPath(page.url())).toEqual('/qwikcity-test/scroll-restoration/page-short/');
        expect(await getWindowScrollXY(page)).toStrictEqual([0, 0]);

        const scrollHeightShort = await getScrollHeight(page);
        await scrollTo(page, 0, scrollHeightShort);

        const scrollDetector2 = scrollDetector(page);
        await page.goBack();

        await scrollDetector2;
        await expect(page.locator('h1')).toHaveText('Page Long');
        await page.waitForTimeout(50);
        expect(toPath(page.url())).toEqual('/qwikcity-test/scroll-restoration/page-long/');
        expect(await getWindowScrollXY(page)).toStrictEqual([0, scrollHeightLong]);

        const scrollDetector3 = scrollDetector(page);
        await page.goForward();

        await scrollDetector3;
        await expect(page.locator('h1')).toHaveText('Page Short');
        await page.waitForTimeout(50);
        expect(toPath(page.url())).toEqual('/qwikcity-test/scroll-restoration/page-short/');
        expect(await getWindowScrollXY(page)).toStrictEqual([0, scrollHeightShort]);
      });
    });
  }

  function tests() {
    test.describe('issue2829', () => {
      test('should navigate with context', async ({ page }) => {
        await page.goto('/qwikcity-test/issue2829/a/');
        const link = page.locator('#issue2829-link');
        await link.click();

        await expect(page.locator('h1')).toHaveText('Profile');
        await expect(page.locator('#issue2829-context')).toHaveText('context: __CONTEXT_VALUE__');
        await expect(new URL(page.url()).pathname).toBe('/qwikcity-test/issue2829/b/');
      });
    });
    test.describe('issue2890', () => {
      test('should navigate (link 0)', async ({ page, javaScriptEnabled }) => {
        await page.goto('/qwikcity-test/issue2890/a/');
        const link = page.locator('#issue2890-link-0');
        await link.click();

        await expect(page.locator('h1')).toHaveText('Query');
        await expect(toPath(page.url())).toEqual('/qwikcity-test/issue2890/b/');
        await expect(page.locator('#loader')).toHaveText('LOADER: {"query":"NONE","hash":"NONE"}');
        if (javaScriptEnabled) {
          await expect(page.locator('#browser')).toHaveText('BROWSER: {"query":"NONE","hash":""}');
        } else {
          await expect(page.locator('#browser')).toHaveText('BROWSER: {}');
        }
      });

      test('should navigate (link 1)', async ({ page, javaScriptEnabled }) => {
        await page.goto('/qwikcity-test/issue2890/a/');
        const link = page.locator('#issue2890-link-1');
        await link.click();

        await expect(page.locator('h1')).toHaveText('Query');
        await expect(toPath(page.url())).toEqual('/qwikcity-test/issue2890/b/?query=123');
        await expect(page.locator('#loader')).toHaveText('LOADER: {"query":"123","hash":"NONE"}');
        if (javaScriptEnabled) {
          await expect(page.locator('#browser')).toHaveText('BROWSER: {"query":"123","hash":""}');
        } else {
          await expect(page.locator('#browser')).toHaveText('BROWSER: {}');
        }
      });
      test('should navigate (link 2)', async ({ page, javaScriptEnabled }) => {
        await page.goto('/qwikcity-test/issue2890/a/');
        const link = page.locator('#issue2890-link-2');
        await link.click();

        await expect(page.locator('h1')).toHaveText('Query');
        await expect(toPath(page.url())).toEqual('/qwikcity-test/issue2890/b/?query=321');
        await expect(page.locator('#loader')).toHaveText('LOADER: {"query":"321","hash":"NONE"}');
        if (javaScriptEnabled) {
          await expect(page.locator('#browser')).toHaveText('BROWSER: {"query":"321","hash":""}');
        } else {
          await expect(page.locator('#browser')).toHaveText('BROWSER: {}');
        }
      });
      test('should navigate (link 3)', async ({ page, javaScriptEnabled }) => {
        await page.goto('/qwikcity-test/issue2890/a/');
        const link = page.locator('#issue2890-link-3');
        await link.click();

        await expect(page.locator('h1')).toHaveText('Query');
        await expect(toPath(page.url())).toEqual(
          '/qwikcity-test/issue2890/b/?query=321&hash=true#h2'
        );
        await expect(page.locator('#loader')).toHaveText('LOADER: {"query":"321","hash":"true"}');
        if (javaScriptEnabled) {
          await expect(page.locator('#browser')).toHaveText(
            'BROWSER: {"query":"321","hash":"#h2"}'
          );
        } else {
          await expect(page.locator('#browser')).toHaveText('BROWSER: {}');
        }
      });
      test('should navigate (link 4)', async ({ page, javaScriptEnabled }) => {
        await page.goto('/qwikcity-test/issue2890/a/');
        const link = page.locator('#issue2890-link-4');
        await link.click();

        await expect(page.locator('h1')).toHaveText('Query');
        await expect(toPath(page.url())).toEqual(
          '/qwikcity-test/issue2890/b/?query=321&hash=true#h2'
        );
        await expect(page.locator('#loader')).toHaveText('LOADER: {"query":"321","hash":"true"}');
        if (javaScriptEnabled) {
          await expect(page.locator('#browser')).toHaveText(
            'BROWSER: {"query":"321","hash":"#h2"}'
          );
        } else {
          await expect(page.locator('#browser')).toHaveText('BROWSER: {}');
        }
      });
    });

    test.describe('issue 2751', () => {
      test('should navigate without crash', async ({ context, javaScriptEnabled }) => {
        const ctx = await load(context, javaScriptEnabled, '/qwikcity-test/actions/');

        await linkNavigate(ctx, '[data-test-link="docs-home"]');
        await assertPage(ctx, {
          pathname: '/qwikcity-test/docs/',
          title: 'Docs: Welcome! - Qwik',
          layoutHierarchy: ['docs'],
          h1: 'Welcome to the Docs!',
        });

        await linkNavigate(ctx, '[data-test-link="docs-actions"]');
        await assertPage(ctx, {
          pathname: '/qwikcity-test/actions/',
          title: 'Actions - Qwik',
          layoutHierarchy: ['root'],
          h1: 'Actions Test',
        });

        await linkNavigate(ctx, '[data-test-link="api-home"]');
        await assertPage(ctx, {
          pathname: '/qwikcity-test/api/',
          title: 'API: /qwikcity-test/api/ - Qwik',
          layoutHierarchy: ['root', 'api'],
          h1: 'Qwik City Test API!',
        });
      });
    });
  }
});

function toPath(href: string) {
  const url = new URL(href);
  return url.pathname + url.search + url.hash;
}
