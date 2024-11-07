import { test, expect } from '@playwright/test';

test('should increment counter on click', async ({ page }) => {
  await page.goto('http://localhost:5111');

  const text = page.getByText('70');
  await expect(text).toBeVisible();

  await page.getByRole('button', { name: '+' }).click();

  const newText = page.getByText('71');
  await expect(newText).toBeVisible();
});
