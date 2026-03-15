import { test, expect } from '@playwright/test';

test('Guides Qwik in a nutshell page loads', async ({ page }) => {
  await page.goto('/docs/guides/qwik-nutshell/');
  await expect(page).toHaveTitle('Qwik in a nutshell | Introduction 📚 Qwik Documentation');
});

test('Guides MDX page loads', async ({ page }) => {
  await page.goto('/docs/guides/mdx/');
  await expect(page).toHaveTitle('Markdown and MDX | Guides 📚 Qwik Documentation');
});

test('Guides SSG page loads', async ({ page }) => {
  await page.goto('/docs/guides/static-site-generation/');
  await expect(page).toHaveTitle(
    'Static Site Generation (SSG) Overview | Guides 📚 Qwik Documentation'
  );
});

test('Guides Capacitor page loads', async ({ page }) => {
  await page.goto('/docs/guides/capacitor/');
  await expect(page).toHaveTitle('Qwik Hybrid Native App Overview | Guides 📚 Qwik Documentation');
});

test('Guides React Cheat Sheet page loads', async ({ page }) => {
  await page.goto('/docs/guides/react-cheat-sheet/');
  await expect(page).toHaveTitle('Qwik for React developers 📚 Qwik Documentation');
});

test('Guides Best Practices page loads', async ({ page }) => {
  await page.goto('/docs/guides/best-practices/');
  await expect(page).toHaveTitle('Best Practices | Guides 📚 Qwik Documentation');
});

test('Guides Bundle Optimization page loads', async ({ page }) => {
  await page.goto('/docs/guides/bundle/');
  await expect(page).toHaveTitle('Bundle Optimization | Guides 📚 Qwik Documentation');
});

test('Guides Environment Variables page loads', async ({ page }) => {
  await page.goto('/docs/guides/env-variables/');
  await expect(page).toHaveTitle('Environment variables | Qwik Router 📚 Qwik Documentation');
});
