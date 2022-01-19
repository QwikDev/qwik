import { test, expect } from '@playwright/test';

test('todo title', async ({ page }) => {
  await page.goto('/todo/');

  const title = page.locator('title');
  await expect(title).toHaveText('Qwik Demo: ToDo');
});
