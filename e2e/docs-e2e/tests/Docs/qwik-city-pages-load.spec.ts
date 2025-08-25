// todo V2: rename file to qwik-router-pages-load.spec.ts
// todo V2: replace all instances of Qwik City with Qwik Router
import { test, expect } from '@playwright/test';

test('Qwik City Overview page loads', async ({ page }) => {
  await page.goto('/docs/qwikcity/');
  await expect(page).toHaveTitle('Overview | Qwik City 📚 Qwik Documentation');
});

test('Qwik City Routing page loads', async ({ page }) => {
  await page.goto('/docs/routing/');
  await expect(page).toHaveTitle('Routing | Qwik City 📚 Qwik Documentation');
});

test('Qwik City Pages page loads', async ({ page }) => {
  await page.goto('/docs/pages/');
  await expect(page).toHaveTitle('Pages | Qwik City 📚 Qwik Documentation');
});

test('Qwik City Layout page loads', async ({ page }) => {
  await page.goto('/docs/layout/');
  await expect(page).toHaveTitle('Layout & Middleware | Guides 📚 Qwik Documentation');
});

test('Qwik City Route Loader page loads', async ({ page }) => {
  await page.goto('/docs/route-loader/');
  await expect(page).toHaveTitle('RouteLoader$ | Qwik City 📚 Qwik Documentation');
});

test('Qwik City Route Action page loads', async ({ page }) => {
  await page.goto('/docs/action/');
  await expect(page).toHaveTitle('RouteAction$ | QwikCity 📚 Qwik Documentation');
});

test('Qwik City Endpoints page loads', async ({ page }) => {
  await page.goto('/docs/endpoints/');
  await expect(page).toHaveTitle('Endpoints | Qwik City 📚 Qwik Documentation');
});

test('Qwik City Middleware page loads', async ({ page }) => {
  await page.goto('/docs/middleware/');
  await expect(page).toHaveTitle('Middleware | Guides 📚 Qwik Documentation');
});

test('Qwik City server$ page loads', async ({ page }) => {
  await page.goto('/docs/server$/');
  await expect(page).toHaveTitle('server$ | Qwik City 📚 Qwik Documentation');
});

test('Qwik City Error Handling page loads', async ({ page }) => {
  await page.goto('/docs/error-handling/');
  await expect(page).toHaveTitle('Error handling | Qwik City 📚 Qwik Documentation');
});

test('Qwik City Re-exporting Loaders page loads', async ({ page }) => {
  await page.goto('/docs/re-exporting-loaders/');
  await expect(page).toHaveTitle('Cookbook | Re-exporting loaders 📚 Qwik Documentation');
});

test('Qwik City HTML Attributes page loads', async ({ page }) => {
  await page.goto('/docs/html-attributes/');
  await expect(page).toHaveTitle('HTML attributes | QwikCity 📚 Qwik Documentation');
});

test('Qwik City API Reference page loads', async ({ page }) => {
  await page.goto('/docs/api/');
  await expect(page).toHaveTitle('API Reference | Qwik City 📚 Qwik Documentation');
});
