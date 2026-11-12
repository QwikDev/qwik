import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    let release!: () => void;
    const wait = new Promise<void>((resolve) => (release = resolve));
    (window as any).__independentRenderCommit = { wait, release, entered: false, order: [] };
  });
  await page.goto('/e2e/independent-render-commits');
  await page.waitForFunction(() => (window as any)._qwikEv?.roots);
  await page.evaluate(() => ((window as any).__independentRenderCommit.order.length = 0));
});

test.afterEach(async ({ page }) => {
  await page.evaluate(() => (window as any).__independentRenderCommit.release());
});

test('commits the ready counter without rendering later siblings before the pending toast', async ({
  page,
}) => {
  await page.locator('#independent-update').click();
  await page.waitForFunction(() => (window as any).__independentRenderCommit.entered);
  expect(await page.locator('#independent-count').textContent()).toBe('1');
  await expect(page.locator('#independent-toast')).toHaveText('old toast');
  await expect(page.locator('#independent-tail')).toHaveText('0');
  expect(await page.evaluate(() => (window as any).__independentRenderCommit.order)).toEqual([
    'parent',
    'counter',
    'toast',
  ]);
  await page.evaluate(() => (window as any).__independentRenderCommit.release());
  await expect(page.locator('#independent-toast')).toHaveText('toast 1');
  await expect(page.locator('#independent-tail')).toHaveText('1');
  expect(await page.evaluate(() => (window as any).__independentRenderCommit.order)).toEqual([
    'parent',
    'counter',
    'toast',
    'tail',
  ]);
});

test('keeps the old page visible until the replacement is ready', async ({ page }) => {
  await page.evaluate(() => {
    const gate = (window as any).__independentRenderCommit;
    const watch = () => {
      if (
        !document.querySelector('#independent-old-page') &&
        !document.querySelector('#independent-new-page')
      ) {
        gate.sawBlank = true;
      }
      requestAnimationFrame(watch);
    };
    requestAnimationFrame(watch);
  });
  await page.locator('#independent-navigate').click();
  await page.waitForFunction(() => (window as any).__independentRenderCommit.entered);
  await expect(page.locator('#independent-old-page')).toBeVisible();
  await expect(page.locator('#independent-new-page')).toHaveCount(0);
  await page.evaluate(() => (window as any).__independentRenderCommit.release());
  await expect(page.locator('#independent-navigation-ready')).toHaveText('toast 1');
  await expect(page.locator('#independent-old-page')).toHaveCount(0);
  expect(await page.evaluate(() => !!(window as any).__independentRenderCommit.sawBlank)).toBe(
    false
  );
});

test('does not restore a pending subtree removed by its parent', async ({ page }) => {
  await page.locator('#independent-update').click();
  await page.waitForFunction(() => (window as any).__independentRenderCommit.entered);
  await page.locator('#independent-remove').click();
  await expect(page.locator('#independent-removed')).toHaveText('removed');
  await page.evaluate(() => (window as any).__independentRenderCommit.release());
  await expect(page.locator('#independent-toast')).toHaveCount(0);
  await expect(page.locator('#independent-removed')).toHaveText('removed');
});
