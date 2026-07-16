import { expect, test } from '@playwright/test';

test('Qwik Router Fallback', async ({ context }) => {
  const page = await context.newPage();
  const response = (await page.goto('/qwikrouter-test/idk/'))!;

  expect(response.status()).toBe(404);

  // The (common)/[...catchall] route throws error(404), so the error boundary (error.tsx) renders.
  const heading = page.locator('h1');
  await expect(heading).toHaveText('Custom Error Page');

  const status = page.locator('.error-status');
  await expect(status).toHaveText('404');
});

test('error@layout renders the error boundary inside its named layout', async ({ context }) => {
  const page = await context.newPage();
  const response = (await page.goto('/qwikrouter-test/error-layout/'))!;

  expect(response.status()).toBe(500);

  // The thrown error renders error@narrow.tsx nested inside its `narrow` override layout.
  await expect(page.locator('[data-narrow-layout] [data-error-narrow]')).toBeVisible();
});
