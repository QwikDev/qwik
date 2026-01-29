import { test, expect } from '@playwright/test';

test('search bar with click results', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Search' }).click();
  await page.getByPlaceholder('Search docs').fill('getting started qwikly');
  await page.waitForSelector('.DocSearch-Hit', { timeout: 5000 });
  const countOfSearchResults = await page.locator('.DocSearch-Hit').count();
  expect(countOfSearchResults).toBeGreaterThan(0);
  await page.getByRole('link', { name: 'Getting Started Qwikly', exact: true }).click();
  await expect(page).toHaveURL('docs/getting-started/#getting-started-qwikly');
});

test('search with no results', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Search' }).click();
  await page.getByPlaceholder('Search docs').fill('xyz123nonexistentquery');
  await page.waitForTimeout(1000);
  const noResults = page.locator('.DocSearch-NoResults, .DocSearch-EmptyState');
  await expect(noResults).toBeVisible();
});

test('search bar opens and closes', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page.getByPlaceholder('Search docs')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByPlaceholder('Search docs')).not.toBeVisible();
});
