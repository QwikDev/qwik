import { expect, test } from '@playwright/test';
import { pathToFileURL } from 'url';

test.describe('actions', () => {
  test.describe('mpa', () => {
    test.use({ javaScriptEnabled: false });
    tests();
  });

  test.describe('spa', () => {
    test.use({ javaScriptEnabled: true });
    tests();
  });

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
  }
});

function toPath(href: string) {
  const url = new URL(href);
  return url.pathname + url.search + url.hash;
}
