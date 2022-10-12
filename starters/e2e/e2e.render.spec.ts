import { test, expect } from '@playwright/test';

test.describe('render', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/e2e/render');
    page.on('pageerror', (err) => expect(err).toEqual(undefined));
  });

  test('should load', async ({ page }) => {
    const button = await page.locator('button#increment');
    const text = await page.locator('span');

    await expect(text).toHaveText('Rerender 0');
    await button.click();
    await expect(text).toHaveText('Rerender 1');
  });

  test('should render classes', async ({ page }) => {
    const increment = await page.locator('button#increment');
    const toggle = await page.locator('button#toggle');

    const attributes = await page.locator('#attributes');

    await expect(attributes).toHaveAttribute('class', '⭐️unvb18-1 even stable0');
    await expect(attributes).toHaveAttribute('aria-hidden', 'true');
    await expect(attributes).toHaveAttribute('preventdefault:click', '');

    await increment.click();

    await expect(attributes).toHaveAttribute('class', '⭐️unvb18-1 stable0 odd');
    await expect(attributes).toHaveAttribute('aria-hidden', 'true');
    await expect(attributes).toHaveAttribute('preventdefault:click', '');

    await toggle.click();

    await expect(attributes).toHaveAttribute('class', '⭐️unvb18-1');
    await expect(attributes).toHaveAttribute('aria-hidden', '');
    await expect(attributes).toHaveAttribute('preventdefault:click', '');

    await increment.click();

    await expect(attributes).toHaveAttribute('class', '⭐️unvb18-1');
    await expect(attributes).toHaveAttribute('aria-hidden', '');
    await expect(attributes).toHaveAttribute('preventdefault:click', '');

    await toggle.click();

    await expect(attributes).toHaveAttribute('class', '⭐️unvb18-1 even stable0');
    await expect(attributes).toHaveAttribute('aria-hidden', 'true');
    await expect(attributes).toHaveAttribute('preventdefault:click', '');
  });
});
