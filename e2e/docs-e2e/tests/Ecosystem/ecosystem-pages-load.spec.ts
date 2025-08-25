import { test, expect } from '@playwright/test';

test('Ecosystem page loads', async ({ page }) => {
  await page.goto('/ecosystem//');
  await expect(page).toHaveTitle('Qwik Ecosystem 📚 Qwik Documentation');
});

test('Ecosystem Media Blogs Page loads', async ({ page }) => {
  await page.goto('/media/');
  await expect(page).toHaveTitle(
    'Qwik Presentations, Talks, Videos and Podcasts 📚 Qwik Documentation'
  );
});
