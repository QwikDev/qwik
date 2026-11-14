import { expect, test, type Page } from '@playwright/test';

/**
 * Holds back the visible task chunk whose code matches, so the test does not depend on how the
 * compiler names or numbers the segment. Resolves to the function that lets the chunk through.
 */
async function holdTaskChunk(page: Page, code: RegExp, onRequest?: () => void) {
  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  await page.route(/useVisibleTask/, async (route) => {
    const response = await route.fetch();
    if (code.test(await response.text())) {
      onRequest?.();
      await released;
    }
    await route.fulfill({ response });
  });
  return release;
}

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
    let markChunkRequested!: () => void;
    const chunkRequested = new Promise<void>((resolve) => (markChunkRequested = resolve));
    const loadVisibleTaskChunk = await holdTaskChunk(
      page,
      /hasRun\.value\s*=\s*true/,
      markChunkRequested
    );

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
    const loadFirstTaskChunk = await holdTaskChunk(page, /firstStatus\.value\s*=\s*["']ran["']/);

    await page.goto('/e2e/visible-task-order');

    await expect(page.locator('#second-task-status')).toHaveText('ran');
    await expect(page.locator('#first-task-status')).toHaveText('pending');

    loadFirstTaskChunk();
    await expect(page.locator('#first-task-status')).toHaveText('ran');
  });
});
