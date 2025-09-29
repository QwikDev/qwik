// todo V2: rename file to qwik-router-pages-load.spec.ts
// todo V2: replace all instances of Qwik Router with Qwik Router
import { test, expect } from '@playwright/test';

test('Qwik Router Overview page loads', async ({ page }) => {
  await page.goto('/docs/qwikrouter/');
  await expect(page).toHaveTitle('Overview | Qwik Router 📚 Qwik Documentation');
});

test('Qwik Router Routing page loads', async ({ page }) => {
  await page.goto('/docs/routing/');
  await expect(page).toHaveTitle('Routing | Qwik Router 📚 Qwik Documentation');
});

test('Qwik Router Pages page loads', async ({ page }) => {
  await page.goto('/docs/pages/');
  await expect(page).toHaveTitle('Pages | Qwik Router 📚 Qwik Documentation');
});

test('Qwik Router Layout page loads', async ({ page }) => {
  await page.goto('/docs/layout/');
  await expect(page).toHaveTitle('Layout & Middleware | Guides 📚 Qwik Documentation');
});

test('Qwik Router Route Loader page loads', async ({ page }) => {
  await page.goto('/docs/route-loader/');
  await expect(page).toHaveTitle('RouteLoader$ | Qwik Router 📚 Qwik Documentation');
});

test('Qwik Router Route Action page loads', async ({ page }) => {
  await page.goto('/docs/action/');
  await expect(page).toHaveTitle('RouteAction$ | Qwik Router 📚 Qwik Documentation');
});

test('Qwik Router Endpoints page loads', async ({ page }) => {
  await page.goto('/docs/endpoints/');
  await expect(page).toHaveTitle('Endpoints | Qwik Router 📚 Qwik Documentation');
});

test('Qwik Router Middleware page loads', async ({ page }) => {
  await page.goto('/docs/middleware/');
  await expect(page).toHaveTitle('Middleware | Guides 📚 Qwik Documentation');
});

test('Qwik Router server$ page loads', async ({ page }) => {
  await page.goto('/docs/server$/');
  await expect(page).toHaveTitle('server$ | Qwik Router 📚 Qwik Documentation');
});

test('Qwik Router Error Handling page loads', async ({ page }) => {
  await page.goto('/docs/error-handling/');
  await expect(page).toHaveTitle('Error handling | Qwik Router 📚 Qwik Documentation');
});

test('Qwik Router Re-exporting Loaders page loads', async ({ page }) => {
  await page.goto('/docs/re-exporting-loaders/');
  await expect(page).toHaveTitle('Cookbook | Re-exporting loaders 📚 Qwik Documentation');
});

test('Qwik Router HTML Attributes page loads', async ({ page }) => {
  await page.goto('/docs/html-attributes/');
  await expect(page).toHaveTitle('HTML attributes | Qwik Router 📚 Qwik Documentation');
});

test('Qwik Router API Reference page loads', async ({ page }) => {
  await page.goto('/docs/api/');
  await expect(page).toHaveTitle('API Reference | Qwik Router 📚 Qwik Documentation');
});
