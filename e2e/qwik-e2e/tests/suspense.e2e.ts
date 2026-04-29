import { test, expect, type Page } from '@playwright/test';

const resolveSuspense = async (page: Page, resolveName: string) => {
  await page.waitForFunction(
    (name) => typeof (globalThis as any)[name] === 'function',
    resolveName
  );
  await page.evaluate((name) => (globalThis as any)[name](), resolveName);
};

test.describe('suspense', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/e2e/suspense');
    page.on('pageerror', (err) => expect(err).toEqual(undefined));
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        expect(msg.text()).toEqual(undefined);
      }
    });
  });

  function tests() {
    test('should show fallback while a descendant update is blocked', async ({ page }) => {
      await expect(page.locator('#single-value')).toHaveText('value=0');
      await expect(page.locator('#single-fallback')).toBeHidden();

      await page.locator('#single-button').click();
      await expect(page.locator('#single-fallback')).toBeVisible();
      await expect(page.locator('#single-value')).toHaveText('value=0');

      await resolveSuspense(page, '__resolveSingleSuspense');
      await expect(page.locator('#single-value')).toHaveText('value=1');
      await expect(page.locator('#single-fallback')).toBeHidden();
    });

    test('should keep stale content visible while a descendant update is blocked', async ({
      page,
    }) => {
      await expect(page.locator('#show-stale-value')).toHaveText('value=0');
      await expect(page.locator('#show-stale-value')).toBeVisible();
      await expect(page.locator('#show-stale-fallback')).toBeHidden();

      await page.locator('#show-stale-button').click();
      await expect(page.locator('#show-stale-fallback')).toBeVisible();
      await expect(page.locator('#show-stale-value')).toHaveText('value=0');
      await expect(page.locator('#show-stale-value')).toBeVisible();

      await resolveSuspense(page, '__resolveShowStaleSuspense');
      await expect(page.locator('#show-stale-value')).toHaveText('value=1');
      await expect(page.locator('#show-stale-fallback')).toBeHidden();
    });

    test('should use the nearest nested fallback for blocked descendant updates', async ({
      page,
    }) => {
      await expect(page.locator('#inner-value')).toHaveText('value=0');
      await expect(page.locator('#outer-fallback')).toBeHidden();
      await expect(page.locator('#inner-fallback')).toBeHidden();

      await page.locator('#inner-button').click();
      await expect(page.locator('#inner-fallback')).toBeVisible();
      await expect(page.locator('#outer-fallback')).toBeHidden();
      await expect(page.locator('#inner-value')).toHaveText('value=0');

      await resolveSuspense(page, '__resolveInnerSuspense');
      await expect(page.locator('#inner-value')).toHaveText('value=1');
      await expect(page.locator('#inner-fallback')).toBeHidden();
      await expect(page.locator('#outer-fallback')).toBeHidden();
    });
  }

  tests();

  test.describe('client rerender', () => {
    test.beforeEach(async ({ page }) => {
      const toggleRender = page.locator('#force-rerender');
      await toggleRender.click();
      await expect(page.locator('#render-count')).toHaveText('1');
    });

    tests();
  });
});
