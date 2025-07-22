import { test, expect } from '@playwright/test';

test('Cookbook Overview page loads', async ({ page }) => {
  await page.goto('/docs/cookbook/');
  await expect(page).toHaveTitle('Cookbook | Overview 📚 Qwik Documentation');
});

test('Cookbook Algolia Search page loads', async ({ page }) => {
  await page.goto('/docs/cookbook/algolia-search/');
  await expect(page).toHaveTitle('Cookbook | Algolia Search 📚 Qwik Documentation');
});

test('Cookbook Combine Request Handlers page loads', async ({ page }) => {
  await page.goto('/docs/cookbook/combine-request-handlers/');
  await expect(page).toHaveTitle('Cookbook | Combine Request Handlers 📚 Qwik Documentation');
});

test('Cookbook Debouncer page loads', async ({ page }) => {
  await page.goto('/docs/cookbook/debouncer/');
  await expect(page).toHaveTitle('Cookbook | Debouncer 📚 Qwik Documentation');
});

test('Cookbook Fonts page loads', async ({ page }) => {
  await page.goto('/docs/cookbook/fonts/');
  await expect(page).toHaveTitle('Cookbook | Font optimization 📚 Qwik Documentation');
});

test('Cookbook Glob Import & Dynamic Import page loads', async ({ page }) => {
  await page.goto('/docs/cookbook/glob-import/');
  await expect(page).toHaveTitle(
    'Cookbook | Glob Import with import.meta.glob 📚 Qwik Documentation'
  );
});

test('Cookbook NavLink Component page loads', async ({ page }) => {
  await page.goto('/docs/cookbook/nav-link/');
  await expect(page).toHaveTitle('Cookbook | Navbar link 📚 Qwik Documentation');
});

test('Cookbook Deploy with Node using Docker page loads', async ({ page }) => {
  await page.goto('/docs/cookbook/node-docker-deploy/');
  await expect(page).toHaveTitle('Cookbook | Deploy with Node using Docker 📚 Qwik Documentation');
});

test('Cookbook Portals page loads', async ({ page }) => {
  await page.goto('/docs/cookbook/portals/');
  await expect(page).toHaveTitle('Cookbook | Portals 📚 Qwik Documentation');
});

test('Cookbook Streaming/deferred loaders page loads', async ({ page }) => {
  await page.goto('/docs/cookbook/streaming-deferred-loaders/');
  await expect(page).toHaveTitle('Cookbook | Streaming/deferred loaders 📚 Qwik Documentation');
});

test('Cookbook sync$ Events  page loads', async ({ page }) => {
  await page.goto('/docs/cookbook/sync-events/');
  await expect(page).toHaveTitle('Cookbook | Synchronous Events with State 📚 Qwik Documentation');
});

test('Cookbook Theme Management page loads', async ({ page }) => {
  await page.goto('/docs/cookbook/theme-management/');
  await expect(page).toHaveTitle('Cookbook | Dark and Light Theme 📚 Qwik Documentation');
});

test('Cookbook Drag & Drop page loads', async ({ page }) => {
  await page.goto('/docs/cookbook/drag&drop/');
  await expect(page).toHaveTitle('Cookbook | Drag & Drop 📚 Qwik Documentation');
});

test('Cookbook View Transition API page loads', async ({ page }) => {
  await page.goto('/docs/cookbook/view-transition/');
  await expect(page).toHaveTitle('Cookbook | View Transition API 📚 Qwik Documentation');
});
