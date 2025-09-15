import { test, expect } from '@playwright/test';

test('Advanced Dollar Function page loads', async ({ page }) => {
  await page.goto('/docs/advanced/dollar/');

  await expect(page).toHaveTitle('The $ dollar sign | Advanced 📚 Qwik Documentation');
});

test('Advanced Containers page loads', async ({ page }) => {
  await page.goto('/docs/advanced/containers/');
  await expect(page).toHaveTitle('Containers | Advanced 📚 Qwik Documentation');
});

test('Advanced QRL page loads', async ({ page }) => {
  await page.goto('/docs/advanced/qrl/');
  await expect(page).toHaveTitle('QRL | Advanced 📚 Qwik Documentation');
});

test('Advanced Library page loads', async ({ page }) => {
  await page.goto('/docs/advanced/library/');
  await expect(page).toHaveTitle('Component library | Advanced 📚 Qwik Documentation');
});

test('Advanced Qwikloader page loads', async ({ page }) => {
  await page.goto('/docs/advanced/qwikloader/');
  await expect(page).toHaveTitle('Qwikloader | Advanced 📚 Qwik Documentation');
});

test('Advanced Optimizer page loads', async ({ page }) => {
  await page.goto('/docs/advanced/optimizer/');
  await expect(page).toHaveTitle('Optimizer Rules | Advanced 📚 Qwik Documentation');
});

test('Advanced Prefetching Modules page loads', async ({ page }) => {
  await page.goto('/docs/advanced/modules-prefetching/');
  await expect(page).toHaveTitle('Prefetching | Advanced 📚 Qwik Documentation');
});

test('Advanced Custom Build Directory page loads', async ({ page }) => {
  await page.goto('/docs/advanced/custom-build-dir/');
  await expect(page).toHaveTitle('Custom Build Output Directory | Advanced 📚 Qwik Documentation');
});

test('Advanced Vite page loads', async ({ page }) => {
  await page.goto('/docs/advanced/vite/');
  await expect(page).toHaveTitle('Vite | Advanced 📚 Qwik Documentation');
});

test('Advanced Routing page loads', async ({ page }) => {
  await page.goto('/docs/advanced/routing/');
  await expect(page).toHaveTitle('Advanced Routing | Qwik Router 📚 Qwik Documentation');
});

test('Advanced Plugins page loads', async ({ page }) => {
  await page.goto('/docs/advanced/plugins/');
  await expect(page).toHaveTitle('Qwik Plugins | Qwik Router 📚 Qwik Documentation');
});

test('Advanced Request Handling page loads', async ({ page }) => {
  await page.goto('/docs/advanced/request-handling/');
  await expect(page).toHaveTitle('Request Handling | Advanced 📚 Qwik Documentation');
});

test('Advanced Speculative Module Fetching page loads', async ({ page }) => {
  await page.goto('/docs/advanced/speculative-module-fetching/');
  await expect(page).toHaveTitle('Speculative Module Fetching | Advanced 📚 Qwik Documentation');
});

test('Advanced Menu page loads', async ({ page }) => {
  await page.goto('/docs/advanced/menu/');
  await expect(page).toHaveTitle('Menu | Advanced 📚 Qwik Documentation');
});

test('Advanced Generating Sitemaps page loads', async ({ page }) => {
  await page.goto('/docs/advanced/sitemaps/');
  await expect(page).toHaveTitle('Generating Sitemaps | Advanced 📚 Qwik Documentation');
});

test('Advanced ESLint-Rules page loads', async ({ page }) => {
  await page.goto('/docs/advanced/eslint/');
  //   currently does not have a custom title
  await expect(page).toHaveTitle('Qwik - Framework reimagined for the edge');
});

test('Advanced Content Security Policy page loads', async ({ page }) => {
  await page.goto('/docs/advanced/content-security-policy/');
  await expect(page).toHaveTitle('Content Security Policy | Advanced 📚 Qwik Documentation');
});

test('Advanced Complex Forms page loads', async ({ page }) => {
  await page.goto('/docs/advanced/complex-forms/');
  await expect(page).toHaveTitle('Complex Forms | Advanced 📚 Qwik Documentation');
});
