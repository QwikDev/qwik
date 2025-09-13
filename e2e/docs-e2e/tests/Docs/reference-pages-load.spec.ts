import { test, expect } from '@playwright/test';

test('API Reference page loads', async ({ page }) => {
  await page.goto('/api/');
  await expect(page).toHaveTitle('Qwik - Framework reimagined for the edge');
});

test('API Reference Deprecated Features page loads', async ({ page }) => {
  await page.goto('/docs/deprecated-features/');
  await expect(page).toHaveTitle('Deprecated Features | Guides 📚 Qwik Documentation');
});
