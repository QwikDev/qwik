import { expect, test } from '@playwright/test';

test.describe('qvisible', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/e2e/qvisible');
    page.on('pageerror', (err) => expect(err).toEqual(undefined));
  });

  test('should fire onQVisible$ when a server-rendered element scrolls into view', async ({
    page,
  }) => {
    const log = page.locator('#log');
    await expect(log).toHaveText('');
    await page.locator('#ssr-sentinel').scrollIntoViewIfNeeded();
    await expect(log).toHaveText('ssr-visible;');
  });

  test('should fire onQVisible$ when a client-rendered element scrolls into view', async ({
    page,
  }) => {
    const log = page.locator('#log');
    await page.locator('#show').click();
    const csrSentinel = page.locator('#csr-sentinel');
    await expect(csrSentinel).toHaveText('client-rendered sentinel');
    await expect(log).toHaveText('');
    await csrSentinel.scrollIntoViewIfNeeded();
    await expect(log).toHaveText('csr-visible;');
  });

  test('should run a server-rendered visible task when it scrolls into view', async ({ page }) => {
    const log = page.locator('#log');
    const taskRuns = page.locator('#task-runs');
    await expect(log).toHaveText('');
    await page.locator('#ssr-task-sentinel').scrollIntoViewIfNeeded();
    await expect(log).toContainText('ssr-task;');
    await expect(taskRuns).toHaveText('1');
  });

  test('should run a client-created visible task when it scrolls into view, exactly once', async ({
    page,
  }) => {
    const log = page.locator('#log');
    const taskRuns = page.locator('#task-runs');
    await page.locator('#show-task').click();
    const csrTaskSentinel = page.locator('#csr-task-sentinel');
    await expect(csrTaskSentinel).toHaveText('csr-task sentinel');
    await expect(log).toHaveText('');
    await csrTaskSentinel.scrollIntoViewIfNeeded();
    await expect(log).toContainText('csr-task;');
    await expect(taskRuns).toHaveText('1');
  });
});
