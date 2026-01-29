import { test, expect } from '@playwright/test';

test.describe('Sandbox Routing ', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/examples/introduction/hello-world/');
    const Links = page.locator('.examples-menu a');
    const linkCount = await Links.count();
    expect(linkCount).toBe(8);
  });

  test.afterEach(async ({ page }) => {
    const link = page.getByRole('link', { name: '🌎 Hello World The simplest' });
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveTitle('Hello World - Qwik');
  });

  test('Routing runtime-less link test', async ({ page }) => {
    const link = page.getByRole('link', { name: '🪶 Runtime-less' });
    await expect(link).toBeVisible();
    await link.click();
    await page.waitForLoadState('networkidle');
    expect(page.url()).toContain('/examples/introduction/runtime-less');
  });

  test('Routing useTask() link test', async ({ page }) => {
    const link = page.getByRole('link', { name: '👀 Simple useTask()' });
    await expect(link).toBeVisible();
    await link.click();
    await page.waitForLoadState('networkidle');
    expect(page.url()).toContain('/examples/reactivity/task/');
  });

  test('Routing Counter link test', async ({ page }) => {
    const link = page.getByRole('link', { name: '⏲ Counter' });
    await expect(link).toBeVisible();
    await link.click();
    await page.waitForLoadState('networkidle');
    expect(page.url()).toContain('/examples/reactivity/counter/');
  });

  test('Routing Auto Complete link test', async ({ page }) => {
    const link = page.getByRole('link', { name: '🎬 Auto-complete' });
    await expect(link).toBeVisible();
    await link.click();
    await page.waitForLoadState('networkidle');
    expect(page.url()).toContain('/examples/reactivity/auto-complete/');
  });

  test('Routing Below the fold Clock  link test', async ({ page }) => {
    const link = page.getByRole('link', { name: '⏰ Below the fold Clock' });
    await expect(link).toBeVisible();
    await link.click();
    await page.waitForLoadState('networkidle');
    expect(page.url()).toContain('/examples/visibility/clock/');
  });
  test('Routing Partials HN link test', async ({ page }) => {
    const link = page.getByRole('link', { name: '📰 HackerNews HackerNews' });
    await expect(link).toBeVisible();
    await link.click();
    await page.waitForLoadState('networkidle');
    expect(page.url()).toContain('/examples/partial/hackernews-index/');
  });
});
