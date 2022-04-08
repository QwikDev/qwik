import { test, expect } from '@playwright/test';

test('rendered', async ({ page }) => {
  await page.goto('/starter-builder/');
  page.on('pageerror', (err) => expect(err).toEqual(undefined));

  const body = page.locator('body');
  await expect(body).toContainText('Made with');
});
