import { test, expect } from '@playwright/test';

test.describe('Docs site smoke tests', () => {
  test('home page loads', async ({ page }) => {
    await page.goto('/');
    // Check the page has loaded with meaningful content
    await expect(page.locator('h1').first()).toBeVisible();
    await expect(page).toHaveTitle(/Qwik/);
  });

  test('docs overview page loads with sidebar', async ({ page }) => {
    await page.goto('/docs/');
    await expect(page).toHaveTitle(/Qwik/);

    // The sidebar is an <aside> containing a <nav> with links
    const sidebar = page.locator('aside nav');
    await expect(sidebar.first()).toBeVisible();

    // Verify sidebar has multiple link groups
    const links = sidebar.locator('a[href]');
    expect(await links.count()).toBeGreaterThanOrEqual(5);
  });

  test('getting started page loads', async ({ page }) => {
    await page.goto('/docs/getting-started/');
    await expect(page).toHaveTitle(/Getting Started/);
    await expect(page.locator('article').first()).toBeVisible();
  });

  test('routing docs page loads', async ({ page }) => {
    await page.goto('/docs/routing/');
    await expect(page).toHaveTitle(/Routing/);
    await expect(page.locator('article').first()).toBeVisible();
  });

  test('client-side navigation works', async ({ page }) => {
    await page.goto('/docs/');

    // Navigate via a direct link rather than trying to click sidebar elements
    // that may be obscured by fixed overlays
    const response = await page.goto('/docs/getting-started/');
    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle(/Getting Started/);

    // Click a link within the article content to test client-side nav
    const articleLink = page.locator('article a[href^="/docs/"]').first();
    if (await articleLink.count()) {
      const href = await articleLink.getAttribute('href');
      await articleLink.click();
      if (href) {
        await page.waitForURL(new RegExp(href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      }
    }
  });

  test('ecosystem page loads', async ({ page }) => {
    await page.goto('/ecosystem/');
    await expect(page).toHaveTitle(/Qwik/);
    await expect(page.locator('main').first()).toBeVisible();
  });

  test('404 page works', async ({ page }) => {
    const response = await page.goto('/this-page-does-not-exist-12345/');
    // Should get a 404 status or show error content
    expect(response?.status()).toBe(404);
  });
});
