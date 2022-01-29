import { test, expect } from '@playwright/test';

test('rendered', async ({ page }) => {
  await page.goto('/starter/');

  const ol = page.locator('.my-app');
  await expect(ol).toContainText('Congratulations Qwik is working!');
});

test('update text', async ({ page }) => {
  await page.goto('/starter/');

  await page.fill('input', 'QWIK');
  await page.dispatchEvent('input', 'keyup');
  await expect(page.locator('ol')).toContainText('Hello QWIK!');
});
