import { test, expect } from '@playwright/test';

test('Integrations Overview page loads', async ({ page }) => {
  await page.goto('/docs/integrations/');
  await expect(page).toHaveTitle('Qwik Router Integrations | Guides 📚 Qwik Documentation');
});

test('Integrations Astro page loads', async ({ page }) => {
  await page.goto('/docs/integrations/astro/');
  await expect(page).toHaveTitle('Astro | Integrations 📚 Qwik Documentation');
});

test('Integrations Auth.js page loads', async ({ page }) => {
  await page.goto('/docs/integrations/authjs/');
  await expect(page).toHaveTitle('Auth.js | Integrations 📚 Qwik Documentation');
});

test('Integrations Bootstrap page loads', async ({ page }) => {
  await page.goto('/docs/integrations/bootstrap/');
  await expect(page).toHaveTitle('Bootstrap | Integrations 📚 Qwik Documentation');
});

test('Integrations Builder.io page loads', async ({ page }) => {
  await page.goto('/docs/integrations/builderio/');
  await expect(page).toHaveTitle('Builder.io | Integrations 📚 Qwik Documentation');
});

test('Integrations Cypress page loads', async ({ page }) => {
  await page.goto('/docs/integrations/cypress/');
  await expect(page).toHaveTitle('Cypress | Integrations 📚 Qwik Documentation');
});

test('Integrations Drizzle page loads', async ({ page }) => {
  await page.goto('/docs/integrations/drizzle/');
  await expect(page).toHaveTitle('Drizzle | Integrations 📚 Qwik Documentation');
});

test('Integrations Internationalization page loads', async ({ page }) => {
  await page.goto('/docs/integrations/i18n/');
  await expect(page).toHaveTitle('Internationalization | Integrations 📚 Qwik Documentation');
});

test('Integrations Icons page loads', async ({ page }) => {
  await page.goto('/docs/integrations/icons/');
  await expect(page).toHaveTitle('Icons | Integrations 📚 Qwik Documentation');
});

test('Integrations Image Optimization page loads', async ({ page }) => {
  await page.goto('/docs/integrations/image-optimization/');
  await expect(page).toHaveTitle('Image Optimization | Integrations 📚 Qwik Documentation');
});

test('Integrations LeafletJS Map page loads', async ({ page }) => {
  await page.goto('/docs/integrations/leaflet-map/');
  await expect(page).toHaveTitle('LeafletJS Map | Integrations 📚 Qwik Documentation');
});

test('Integrations Modular Forms page loads', async ({ page }) => {
  await page.goto('/docs/integrations/modular-forms/');
  await expect(page).toHaveTitle('Modular Forms | Integrations 📚 Qwik Documentation');
});

test('Integrations Nx and enterprise scale monorepos page loads', async ({ page }) => {
  await page.goto('/docs/integrations/nx/');
  await expect(page).toHaveTitle('Nx Monorepos | Integrations 📚 Qwik Documentation');
});

test('Integrations OG Image / Open Graph Image page loads', async ({ page }) => {
  await page.goto('/docs/integrations/og-img/');
  await expect(page).toHaveTitle('OG Image (og-img) | Integrations 📚 Qwik Documentation');
});

test('Integrations Orama page loads', async ({ page }) => {
  await page.goto('/docs/integrations/orama/');
  await expect(page).toHaveTitle('Qwik Router and Orama 📚 Qwik Documentation');
});

test('Integrations Panda CSS page loads', async ({ page }) => {
  await page.goto('/docs/integrations/panda-css/');
  await expect(page).toHaveTitle('Panda CSS | Integrations 📚 Qwik Documentation');
});

test('Integrations Partytown page loads', async ({ page }) => {
  await page.goto('/docs/integrations/partytown/');
  await expect(page).toHaveTitle('Partytown | Integrations 📚 Qwik Documentation');
});

test('Integrations Playwright page loads', async ({ page }) => {
  await page.goto('/docs/integrations/playwright/');
  await expect(page).toHaveTitle('Playwright | Integrations 📚 Qwik Documentation');
});

test('Integrations PostCSS page loads', async ({ page }) => {
  await page.goto('/docs/integrations/postcss/');
  await expect(page).toHaveTitle('PostCSS | Integrations 📚 Qwik Documentation');
});

test('Integrations Prisma page loads', async ({ page }) => {
  await page.goto('/docs/integrations/prisma/');
  await expect(page).toHaveTitle('Prisma | Integrations 📚 Qwik Documentation');
});

test('Integrations Qwik React page loads', async ({ page }) => {
  await page.goto('/docs/integrations/react/');
  await expect(page).toHaveTitle('React | Integrations 📚 Qwik Documentation');
});

test('Integrations Storybook page loads', async ({ page }) => {
  await page.goto('/docs/integrations/storybook/');
  await expect(page).toHaveTitle('Storybook | Integrations 📚 Qwik Documentation');
});

test('Integrations Styled Vanilla Extract page loads', async ({ page }) => {
  await page.goto('/docs/integrations/styled-vanilla-extract/');
  await expect(page).toHaveTitle('Styled Vanilla Extract | Integrations 📚 Qwik Documentation');
});

test('Integrations Supabase page loads', async ({ page }) => {
  await page.goto('/docs/integrations/supabase/');
  await expect(page).toHaveTitle('Supabase | Integrations 📚 Qwik Documentation');
});

test('Integrations Tailwind page loads', async ({ page }) => {
  await page.goto('/docs/integrations/tailwind/');
  await expect(page).toHaveTitle('Tailwind | Integrations 📚 Qwik Documentation');
});

test('Integrations Tauri page loads', async ({ page }) => {
  await page.goto('/docs/integrations/tauri/');
  await expect(page).toHaveTitle('Tauri | Integrations 📚 Qwik Documentation');
});

test('Integrations Turso page loads', async ({ page }) => {
  await page.goto('/docs/integrations/turso/');
  await expect(page).toHaveTitle('Turso | Integrations 📚 Qwik Documentation');
});

test('Integrations Vitest page loads', async ({ page }) => {
  await page.goto('/docs/integrations/vitest/');
  await expect(page).toHaveTitle('Vitest | Integrations 📚 Qwik Documentation');
});
