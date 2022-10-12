import { test, expect } from '@playwright/test';

test.describe('watch', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/e2e/watch');
    page.on('pageerror', (err) => expect(err).toEqual(undefined));
  });

  test('should watch correctly', async ({ page }) => {
    const server = page.locator('#server-content');

    const parent = page.locator('#parent');
    const child = page.locator('#child');
    const debounced = page.locator('#debounced');
    const addButton = page.locator('#add');

    await expect(server).toHaveText('comes from server');
    await expect(parent).toHaveText('2');
    await expect(child).toHaveText('2 / 4');
    await expect(debounced).toHaveText('Debounced: 0');

    await addButton.click();
    await page.waitForTimeout(100);

    await expect(server).toHaveText('comes from server');
    await expect(parent).toHaveText('3');
    await expect(child).toHaveText('3 / 6');
    await expect(debounced).toHaveText('Debounced: 0');

    await addButton.click();
    await page.waitForTimeout(100);

    await expect(server).toHaveText('comes from server');
    await expect(parent).toHaveText('4');
    await expect(child).toHaveText('4 / 8');
    await expect(debounced).toHaveText('Debounced: 0');

    // Wait for debouncer
    await page.waitForTimeout(2000);
    await expect(server).toHaveText('comes from server');
    await expect(parent).toHaveText('4');
    await expect(child).toHaveText('4 / 8');
    await expect(debounced).toHaveText('Debounced: 8');
  });
});
