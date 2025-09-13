import { test, expect, devices } from '@playwright/test';

test.use({
  ...devices['iPhone 13'],
});

test('navbar on mobile', async ({ page }) => {
  await page.goto('/');
  const openIcon = page.locator('.mobile-menu > .more-icon > svg');
  const closeIcon = page.locator('.mobile-menu > .close-icon > svg');
  const navToolKit = page.locator('.menu-toolkit');
  const body = page.locator('body');

  expect(body).not.toHaveClass('header-open');
  await expect(openIcon).toBeVisible();
  await openIcon.click();
  expect(body).toHaveClass('header-open');
  await expect(closeIcon).toBeVisible();

  await expect(navToolKit).toBeVisible();
  const menuItems = await page.locator('.menu-toolkit > li > a').allTextContents();
  const expectedMenuLinks = [
    'Docs',
    'Ecosystem',
    'Tutorial',
    'Qwik Sandbox',
    'Blog',
    'GitHub',
    '@QwikDev',
    'Discord',
  ];

  expect(menuItems).toStrictEqual(expectedMenuLinks);

  await closeIcon.click();
  expect(body).not.toHaveClass('header-open');
  await expect(closeIcon).not.toBeVisible();
  await expect(openIcon).toBeVisible();
  await expect(navToolKit).not.toBeVisible();
});
