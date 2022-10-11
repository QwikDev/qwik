import { test, expect } from '@playwright/test';

test.describe('styles', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/e2e/styles');
    page.on('pageerror', (err) => expect(err).toEqual(undefined));
  });

  test('should load', async ({ page }) => {
    const parent = await page.locator('.parent');
    const child2 = await page.locator('text=Child 2');
    const inline2 = await page.locator('text=Inline 2');

    const addChild = await page.locator('button');

    await expect(parent).toHaveAttribute('class', '⭐️yalzmy-0 parent count-10');
    await expect(parent).toHaveCSS('font-size', '200px');
    await expect(child2).toHaveCSS('font-size', '20px');
    await expect(inline2).toHaveCSS('font-size', '40px');

    const el = await page.$$('[q\\:style]');
    await expect(el.length).toBe(4);
    await addChild.click();
    await page.waitForTimeout(100);

    const child10 = await page.locator('text=Child 10');
    const inline10 = await page.locator('text=Inline 10');

    await expect(parent).toHaveAttribute('class', '⭐️yalzmy-0 parent count-11');
    await expect(parent).toHaveCSS('font-size', '200px');
    await expect(child2).toHaveCSS('font-size', '20px');
    await expect(inline2).toHaveCSS('font-size', '40px');
    await expect(child10).toHaveCSS('font-size', '20px');
    await expect(inline10).toHaveCSS('font-size', '40px');

    const el2 = await page.$$('[q\\:style]');
    await expect(el2.length).toBe(4);
  });
});
