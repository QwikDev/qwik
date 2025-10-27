import { test, expect } from '@playwright/test';

test('Components Overview page loads', async ({ page }) => {
  await page.goto('/docs/core/overview/');
  await expect(page).toHaveTitle('Overview | Components 📚 Qwik Documentation');
});

test('Components State page loads', async ({ page }) => {
  await page.goto('/docs/core/state/');
  await expect(page).toHaveTitle('State | Components 📚 Qwik Documentation');
});

test('Components Tasks and Lifecycle page loads', async ({ page }) => {
  await page.goto('/docs/core/tasks/');
  await expect(page).toHaveTitle('Tasks and Lifecycle | Components 📚 Qwik Documentation');
});

test('Components Context page loads', async ({ page }) => {
  await page.goto('/docs/core/context/');
  await expect(page).toHaveTitle('Context | Components 📚 Qwik Documentation');
});

test('Components Slots page loads', async ({ page }) => {
  await page.goto('/docs/core/slots/');
  await expect(page).toHaveTitle('Slots | Components 📚 Qwik Documentation');
});

test('Components Rendering page loads', async ({ page }) => {
  await page.goto('/docs/core/rendering/');
  await expect(page).toHaveTitle('Rendering | Components 📚 Qwik Documentation');
});

test('Components Styles page loads', async ({ page }) => {
  await page.goto('/docs/core/styles/');
  await expect(page).toHaveTitle('Styles | Components 📚 Qwik Documentation');
});

test('Components API Reference page loads', async ({ page }) => {
  await page.goto('/api/qwik/');

  await expect(page).toHaveTitle('@qwik.dev/qwik API Reference 📚 Qwik Documentation');
});
