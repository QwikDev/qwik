import { expect, test } from '@playwright/test';

test.describe('visible task order', () => {
  test.beforeEach(async ({ page }) => {
    page.on('pageerror', (err) => expect(err).toEqual(undefined));
  });

  test('should run a visible task after the render of the signal it tracks', async ({ page }) => {
    await page.goto('/e2e/visible-task-order');

    await expect(page.locator('#ref-status')).toHaveText('found');
    await expect(page.locator('#query-status')).toHaveText('found');
  });

  test('should not hold back other renders while a visible task chunk loads', async ({ page }) => {
    let loadVisibleTaskChunk!: () => void;
    const visibleTaskChunk = new Promise<void>((resolve) => (loadVisibleTaskChunk = resolve));
    let markChunkRequested!: () => void;
    const chunkRequested = new Promise<void>((resolve) => (markChunkRequested = resolve));
    await page.route(/SlowVisibleTask_component_useVisibleTask/, async (route) => {
      markChunkRequested();
      await visibleTaskChunk;
      await route.continue();
    });

    await page.goto('/e2e/visible-task-order');
    await chunkRequested;

    const counter = page.locator('#slow-task-counter');
    await counter.click();
    await expect(counter).toHaveText('1');
    await expect(page.locator('#slow-task-status')).toHaveText('pending');

    loadVisibleTaskChunk();
    await expect(page.locator('#slow-task-status')).toHaveText('ran');
  });

  test('should load the chunks of several visible tasks in parallel', async ({ page }) => {
    let loadFirstTaskChunk!: () => void;
    const firstTaskChunk = new Promise<void>((resolve) => (loadFirstTaskChunk = resolve));
    // The second task's segment is suffixed with `_1_`.
    await page.route(/ParallelVisibleTasks_component_useVisibleTask_(?!1_)/, async (route) => {
      await firstTaskChunk;
      await route.continue();
    });

    await page.goto('/e2e/visible-task-order');

    await expect(page.locator('#second-task-status')).toHaveText('ran');
    await expect(page.locator('#first-task-status')).toHaveText('pending');

    loadFirstTaskChunk();
    await expect(page.locator('#first-task-status')).toHaveText('ran');
  });
});
