import { test, expect } from '@playwright/test';

test('Deployments Overview page loads', async ({ page }) => {
  await page.goto('/docs/deployments/');
  await expect(page).toHaveTitle('Deployments | Guides 📚 Qwik Documentation');
});

test('Deployments Azure Static Web Apps Middleware page loads', async ({ page }) => {
  await page.goto('/docs/deployments/azure-swa/');
  await expect(page).toHaveTitle('Azure Static Web Apps | Deployments 📚 Qwik Documentation');
});

test('Deployments AWS Adapter page loads', async ({ page }) => {
  await page.goto('/docs/deployments/aws-lambda/');
  await expect(page).toHaveTitle('AWS Lambda | Deployments 📚 Qwik Documentation');
});

test('Deployments Firebase Adapter page loads', async ({ page }) => {
  await page.goto('/docs/deployments/firebase/');
  await expect(page).toHaveTitle('Firebase | Deployments 📚 Qwik Documentation');
});

test('Deployments Google Cloud Run Middleware page loads', async ({ page }) => {
  await page.goto('/docs/deployments/gcp-cloud-run/');
  await expect(page).toHaveTitle('Cloud Run Middleware | Deployments 📚 Qwik Documentation');
});

test('Deployments Cloudflare Pages Adapter page loads', async ({ page }) => {
  await page.goto('/docs/deployments/cloudflare-pages/');
  await expect(page).toHaveTitle(
    'Cloudflare Pages Adapter and Middleware | Deployments 📚 Qwik Documentation'
  );
});

test('Deployments Deno Middleware page loads', async ({ page }) => {
  await page.goto('/docs/deployments/deno/');
  await expect(page).toHaveTitle('Deno Middleware | Deployments 📚 Qwik Documentation');
});

test('Deployments Bun Middleware page loads', async ({ page }) => {
  await page.goto('/docs/deployments/bun/');
  await expect(page).toHaveTitle('Bun Middleware | Deployments 📚 Qwik Documentation');
});

test('Deployments Netlify Edge Adapter page loads', async ({ page }) => {
  await page.goto('/docs/deployments/netlify-edge/');
  await expect(page).toHaveTitle(
    'Netlify Edge Adapter and Middleware | Deployments 📚 Qwik Documentation'
  );
});

test('Deployments Node Middleware page loads', async ({ page }) => {
  await page.goto('/docs/deployments/node/');
  await expect(page).toHaveTitle('Node Middleware | Deployments 📚 Qwik Documentation');
});

test('Deployments Vercel Edge Adapter page loads', async ({ page }) => {
  await page.goto('/docs/deployments/vercel-edge/');
  await expect(page).toHaveTitle(
    'Vercel Edge Adapter and Middleware | Deployments 📚 Qwik Documentation'
  );
});

test('Deployments Static Site Adapter page loads', async ({ page }) => {
  await page.goto('/docs/deployments/static/');
  await expect(page).toHaveTitle('Static Site 📚 Qwik Documentation');
});

test('Deployments GitHub Pages Adapter page loads', async ({ page }) => {
  await page.goto('/docs/deployments/github-pages/');
  await expect(page).toHaveTitle('GitHub Pages 📚 Qwik Documentation');
});
