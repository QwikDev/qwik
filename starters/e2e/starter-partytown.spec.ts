import { test, expect } from '@playwright/test';

test('rendered', async ({ page }) => {
  await page.goto('/starter-partytown/');

  const congrats = page.locator('.congrats');
  await expect(congrats).toContainText('Congratulations Qwik with Partytown is working!');
});

test('update text', async ({ page }) => {
  await page.goto('/starter-partytown/');

  await page.fill('input', 'QWIK');
  await page.dispatchEvent('input', 'keyup');
  await page.waitForTimeout(100);
  await expect(page.locator('ol')).toContainText('Hello QWIK!');
});
