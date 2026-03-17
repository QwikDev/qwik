import { expect, test } from '@playwright/test';

test('Qwik Router Fallback', async ({ context }) => {
  const page = await context.newPage();
  const response = (await page.goto('/qwikrouter-test/idk/'))!;

  expect(response.status()).toBe(404);

  // The custom error.tsx should render for 404 errors
  const heading = page.locator('h1');
  await expect(heading).toHaveText('Custom Error Page');

  const status = page.locator('.error-status');
  await expect(status).toHaveText('404');
});
