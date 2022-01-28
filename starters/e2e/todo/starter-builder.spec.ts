import { test, expect } from '@playwright/test';

test('rendered', async ({ page }) => {
  await page.goto('/starter-builder/');

  const body = page.locator('body');
  await expect(body).toContainText('Made with');
});
