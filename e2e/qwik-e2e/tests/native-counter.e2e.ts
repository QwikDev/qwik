import { expect, test } from '@playwright/test';

// Served by the Rust native SSR host (crates/qwik-ssr-host); the browser resumes
// native-rendered HTML through manifest-mapped production chunks.
test.describe('native counter (rust ssr host)', () => {
  test.beforeEach(async ({ page }) => {
    // './' resolves against the baseURL path; '/' would hit the host homepage
    await page.goto('./');
  });

  test('renders the server state', async ({ page }) => {
    await expect(page.locator('#count')).toHaveText('0');
    await expect(page.locator('#doubled')).toHaveText('0');
    await expect(page.locator('#filter')).toHaveText('all');
    await expect(page.locator('#filter-all')).toHaveClass('selected');
  });

  test('resumes signal and computed on click', async ({ page }) => {
    await page.locator('#inc').click();
    await expect(page.locator('#count')).toHaveText('1');
    await expect(page.locator('#doubled')).toHaveText('2');
    await page.locator('#inc').click();
    await expect(page.locator('#count')).toHaveText('2');
    await expect(page.locator('#doubled')).toHaveText('4');
  });

  test('local component store writes flip subscriptions', async ({ page }) => {
    await page.locator('#filter-active').click();
    await expect(page.locator('#filter')).toHaveText('active');
    await expect(page.locator('#filter-active')).toHaveClass('selected');
    await expect(page.locator('#filter-all')).toHaveClass('');
    await page.locator('#filter-all').click();
    await expect(page.locator('#filter')).toHaveText('all');
    await expect(page.locator('#filter-all')).toHaveClass('selected');
  });
});
