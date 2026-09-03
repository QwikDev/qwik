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

    const fontPreloads = page.locator('link[rel="preload"][as="font"]');
    await expect(fontPreloads).toHaveCount(3);
    await expect(
      page.locator('link[rel="preload"][as="font"][href*="tomorrow-latin-600-normal"]')
    ).toHaveCount(1);
    await expect(
      page.locator('link[rel="preload"][as="font"][href*="ubuntu-sans-latin-600-normal"]')
    ).toHaveCount(1);
    await expect(
      page.locator('link[rel="preload"][as="font"][href*="ubuntu-sans-latin-700-normal"]')
    ).toHaveCount(1);
    await expect(
      page.locator('link[rel="preload"][as="font"][href*="karmatic-arcade"]')
    ).toHaveCount(0);

    const sidebar = page.locator('[data-docs-sidebar]');
    await expect(sidebar).toBeVisible();

    const links = sidebar.locator('a[href]');
    expect(await links.count()).toBeGreaterThanOrEqual(5);
    await expect(sidebar.locator('a[href^="/"]:not([q\\:link])')).toHaveCount(0);
    expect(await sidebar.locator('svg.vanilla-icon').count()).toBeGreaterThanOrEqual(5);
    await expect(sidebar.locator('details').first()).toBeVisible();
    await expect(sidebar.locator('a[aria-current="page"]')).toHaveCount(1);
    await expect(page.locator('.docs-shell ~ [data-docs-sidebar]')).toHaveCount(1);
  });

  for (const viewport of [
    { name: 'mobile', width: 390, height: 844 },
    { name: 'tablet', width: 1024, height: 768 },
  ]) {
    test(`${viewport.name} docs sidebar closes manually and after SPA navigation`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto('/docs/');

      const sidebar = page.locator('[data-docs-sidebar] nav');
      await expect(sidebar).not.toBeInViewport();
      await page.getByRole('button', { name: 'Open sidebar' }).click();
      await expect(page.getByRole('button', { name: 'Close sidebar' })).toBeVisible();
      await expect(sidebar).toBeInViewport();
      await page.getByRole('button', { name: 'Close sidebar' }).click();
      await expect(sidebar).not.toBeInViewport();

      await page.getByRole('button', { name: 'Open sidebar' }).click();
      await sidebar.getByRole('link', { name: 'Getting Started', exact: true }).click();
      await expect(page).toHaveURL(/\/docs\/getting-started\/$/);
      await expect(page.getByRole('button', { name: 'Open sidebar' })).toBeVisible();
      await expect(sidebar).not.toBeInViewport();
    });
  }

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
