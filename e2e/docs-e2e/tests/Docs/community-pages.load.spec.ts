import { test, expect } from '@playwright/test';

test('Community Projects page loads', async ({ page }) => {
  await page.goto('/community/projects/');
  await expect(page).toHaveTitle('Projects | Qwik Community 📚 Qwik Documentation');
});

test('Community Groups page loads', async ({ page }) => {
  await page.goto('/community/groups/');
  await expect(page).toHaveTitle('Groups | Qwik Community 📚 Qwik Documentation');
});

test('Community Values page loads', async ({ page }) => {
  await page.goto('/community/values/');
  await expect(page).toHaveTitle('Values | Qwik Community 📚 Qwik Documentation');
});
