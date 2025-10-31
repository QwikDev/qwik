import { test, expect } from '@playwright/test';

test('Experimental Overview page loads', async ({ page }) => {
  await page.goto('/docs/labs/');
  await expect(page).toHaveTitle('🧪 Experimental | Overview 📚 Qwik Documentation');
});

test('Experimental Insights page loads', async ({ page }) => {
  await page.goto('/docs/labs/insights/');
  await expect(page).toHaveTitle('🧪 Insights | Experimental 📚 Qwik Documentation');
});

test('Experimental usePreventNavigate page loads', async ({ page }) => {
  await page.goto('/docs/labs/usePreventNavigate/');
  await expect(page).toHaveTitle('🧪 usePreventNavigate | Experimental 📚 Qwik Documentation');
});
