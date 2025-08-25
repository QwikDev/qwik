import { test, expect } from '@playwright/test';

test('Qwik Labs Overview page loads', async ({ page }) => {
  await page.goto('/docs/labs/');
  await expect(page).toHaveTitle('🧪 Qwik Labs | Overview 📚 Qwik Documentation');
});

test('Qwik Labs Insights page loads', async ({ page }) => {
  await page.goto('/docs/labs/insights/');
  await expect(page).toHaveTitle('🧪 Insights | Qwik Labs 📚 Qwik Documentation');
});

test('Qwik Labs usePreventNavigate page loads', async ({ page }) => {
  await page.goto('/docs/labs/usePreventNavigate/');
  await expect(page).toHaveTitle('🧪 usePreventNavigate | Qwik Labs 📚 Qwik Documentation');
});
