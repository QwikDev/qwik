import { test, expect, type Page } from '@playwright/test';

const assertNoBrowserErrors = (page: Page) => {
  page.on('pageerror', (err) => expect(err).toEqual(undefined));
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      expect(msg.text()).toEqual(undefined);
    }
  });
};

const resolveSuspense = async (page: Page, id: string, resolveName: string) => {
  await page.waitForFunction(
    (name) => typeof (globalThis as any)[name] === 'function',
    resolveName
  );
  await page.locator(`#${id}-resolve`).click();
};

test.describe('suspense', () => {
  test.beforeEach(async ({ page }) => {
    assertNoBrowserErrors(page);
    await page.goto('/e2e/suspense');
  });

  function tests() {
    test('should show fallback while a descendant update is blocked', async ({ page }) => {
      await expect(page.locator('#single-value')).toHaveText('value=0');
      await expect(page.locator('#single-fallback')).toBeHidden();

      await page.locator('#single-button').click();
      await expect(page.locator('#single-fallback')).toBeVisible();
      await expect(page.locator('#single-value')).toHaveText('value=0');

      await resolveSuspense(page, 'single', '__resolveSingleSuspense');
      await expect(page.locator('#single-value')).toHaveText('value=1');
      await expect(page.locator('#single-fallback')).toBeHidden();
    });

    test('should keep stale content visible while showing fallback when a descendant update is blocked', async ({
      page,
    }) => {
      await expect(page.locator('#show-stale-value')).toHaveText('value=0');
      await expect(page.locator('#show-stale-value')).toBeVisible();
      await expect(page.locator('#show-stale-fallback')).toBeHidden();

      await page.locator('#show-stale-button').click();
      await page.waitForTimeout(40);
      await expect(page.locator('#show-stale-fallback')).toBeVisible();
      await expect(page.locator('#show-stale-value')).toHaveText('value=0');
      await expect(page.locator('#show-stale-value')).toBeVisible();

      await resolveSuspense(page, 'show-stale', '__resolveShowStaleSuspense');
      await expect(page.locator('#show-stale-value')).toHaveText('value=1');
      await expect(page.locator('#show-stale-fallback')).toBeHidden();

      await page.locator('#show-stale-button').click();
      await page.waitForTimeout(40);
      await expect(page.locator('#show-stale-fallback')).toBeVisible();
      await expect(page.locator('#show-stale-value')).toHaveText('value=1');
      await expect(page.locator('#show-stale-value')).toBeVisible();

      await resolveSuspense(page, 'show-stale', '__resolveShowStaleSuspense');
      await expect(page.locator('#show-stale-value')).toHaveText('value=2');
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

      await resolveSuspense(page, 'inner', '__resolveInnerSuspense');
      await expect(page.locator('#inner-value')).toHaveText('value=1');
      await expect(page.locator('#inner-fallback')).toBeHidden();
      await expect(page.locator('#outer-fallback')).toBeHidden();
    });

    test('should show fallback when mounting suspense around async JSX', async ({ page }) => {
      await expect(page.locator('#mounted-async-fallback')).toBeHidden();

      await page.locator('#mounted-async-button').click();
      await page.waitForTimeout(40);
      await expect(page.locator('#mounted-async-fallback')).toBeVisible();

      await resolveSuspense(page, 'mounted-async', '__resolveMountedAsyncSuspense');
      await expect(page.locator('#mounted-async-value')).toHaveText('Async content');
      await expect(page.locator('#mounted-async-fallback')).toBeHidden();
    });

    test('should reveal collapsed sequential boundaries in order', async ({ page }) => {
      await expect(page.locator('#reveal-first-value')).toHaveText('value=0');
      await expect(page.locator('#reveal-second-value')).toHaveText('value=0');
      await expect(page.locator('#reveal-first-fallback')).toBeHidden();
      await expect(page.locator('#reveal-second-fallback')).toBeHidden();

      await page.locator('#reveal-first-button').click();
      await page.locator('#reveal-second-button').click();
      await page.waitForTimeout(40);

      await expect(page.locator('#reveal-first-fallback')).toBeVisible();
      await expect(page.locator('#reveal-second-fallback')).toBeHidden();
      await expect(page.locator('#reveal-second-value')).toBeHidden();

      await resolveSuspense(page, 'reveal-second', '__resolveRevealSecondSuspense');
      await expect(page.locator('#reveal-second-fallback')).toBeHidden();
      await expect(page.locator('#reveal-second-value')).toBeHidden();

      await resolveSuspense(page, 'reveal-first', '__resolveRevealFirstSuspense');
      await expect(page.locator('#reveal-first-value')).toHaveText('value=1');
      await expect(page.locator('#reveal-second-value')).toHaveText('value=1');
      await expect(page.locator('#reveal-first-fallback')).toBeHidden();
      await expect(page.locator('#reveal-second-fallback')).toBeHidden();
    });
  }

  tests();

  test.describe('csr rendering', () => {
    test.beforeEach(async ({ page }) => {
      const toggleRender = page.locator('#force-rerender');
      await toggleRender.click();
      await expect(page.locator('#render-count')).toHaveText('1');
    });

    tests();
  });

  test.describe('pure csr rendering', () => {
    test.beforeEach(async ({ page }) => {
      const response = await page.goto('/e2e/suspense?csr=1');
      expect(response).not.toBeNull();
      const html = await response!.text();
      expect(html).toContain('/e2e/build/entry.dev.js');
      expect(html).not.toContain('single-value');
      await expect(page.locator('#single-value')).toHaveText('value=0');
    });

    tests();
  });
});
