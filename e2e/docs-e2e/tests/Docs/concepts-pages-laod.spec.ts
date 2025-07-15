import { test, expect } from '@playwright/test';

test('Concepts Think Qwik page loads', async ({ page }) => {
  await page.goto('/docs/concepts/think-qwik/');
  await expect(page).toHaveTitle('Think Qwik | Concepts 📚 Qwik Documentation');
});

test('Concepts Resumable page loads', async ({ page }) => {
  await page.goto('/docs/concepts/resumable/');
  await expect(page).toHaveTitle('Resumable | Concepts 📚 Qwik Documentation');
});

test('Concepts Progressive page loads', async ({ page }) => {
  await page.goto('/docs/concepts/progressive/');
  await expect(page).toHaveTitle('Progressive | Concepts 📚 Qwik Documentation');
});

test('Concepts Reactivity page loads', async ({ page }) => {
  await page.goto('/docs/concepts/reactivity/');
  await expect(page).toHaveTitle('Reactivity | Concepts 📚 Qwik Documentation');
});
