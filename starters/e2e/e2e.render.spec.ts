import { test, expect } from '@playwright/test';

test.describe('render', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/e2e/render');
    page.on('pageerror', (err) => expect(err).toEqual(undefined));
  });

  test('should load', async ({ page }) => {
    const button = page.locator('button#increment');
    const text = page.locator('#rerenders');

    await expect(text).toHaveText('Rerender 0');
    await button.click();
    await expect(text).toHaveText('Rerender 1');
  });

  test('should render classes', async ({ page }) => {
    const increment = page.locator('button#increment');
    const toggle = page.locator('button#toggle');

    const attributes = page.locator('#attributes');

    await expect(attributes).toHaveClass('⭐️unvb18-1 even stable0');
    await expect(attributes).toHaveAttribute('aria-hidden', 'true');
    await expect(attributes).toHaveAttribute('preventdefault:click', '');

    await increment.click();

    await expect(attributes).toHaveClass('⭐️unvb18-1 stable0 odd');
    await expect(attributes).toHaveAttribute('aria-hidden', 'true');
    await expect(attributes).toHaveAttribute('preventdefault:click', '');

    await toggle.click();

    await expect(attributes).toHaveClass('⭐️unvb18-1');
    await expect(attributes).not.hasAttribute('aria-hidden');
    await expect(attributes).not.hasAttribute('preventdefault:click');

    await increment.click();

    await expect(attributes).toHaveClass('⭐️unvb18-1');
    await expect(attributes).not.hasAttribute('aria-hidden');
    await expect(attributes).not.hasAttribute('preventdefault:click');

    await toggle.click();

    await expect(attributes).toHaveClass('⭐️unvb18-1 even stable0');
    await expect(attributes).toHaveAttribute('aria-hidden', 'true');
    await expect(attributes).toHaveAttribute('preventdefault:click', '');
  });

  test('issue1475', async ({ page }) => {
    const button = await page.locator('#issue-1475-button');
    const result = await page.locator('#issue-1475-result');

    await button.click();
    await page.waitForTimeout(100);
    await expect(result).toHaveText('1. Before\n2. Some text\nMiddle\n3 After\n\nStuff', {
      useInnerText: true,
    });
  });

  test('counter toggle', async ({ page }) => {
    const button = await page.locator('#counter-toggle-btn');
    const show1 = await page.locator('#counter-toggle-show');
    const show2 = await page.locator('#counter-toggle-show-2');
    await expect(show1).toHaveText('even');
    await expect(show2).toHaveText('true');
    await button.click();
    await expect(show1).toHaveText('odd');
    await expect(show2).toHaveText('false');
    await button.click();
    await expect(show1).toHaveText('even');
    await expect(show2).toHaveText('true');
    await button.click();
    await expect(show1).toHaveText('odd');
    await expect(show2).toHaveText('false');
  });

  test('handle props destructuring', async ({ page }) => {
    const button = page.locator('button#increment');

    const message1 = await page.locator('#props-destructuring > span');
    const renders1 = await page.locator('#props-destructuring > .renders');

    const message2 = await page.locator('#props-destructuring-no > span');
    const renders2 = await page.locator('#props-destructuring-no > .renders');


    await expect(message1).toHaveText('Hello 0');
    await expect(renders1).toHaveText('1');
    await expect(message2).toHaveText('Default 0');
    await expect(renders2).toHaveText('1');

    await button.click();

    await expect(message1).toHaveText('Hello 1');
    await expect(renders1).toHaveText('1');
    await expect(message2).toHaveText('Default 1');
    await expect(renders2).toHaveText('2');

    await button.click();

    await expect(message1).toHaveText('Hello 2');
    await expect(renders1).toHaveText('1');
    await expect(message2).toHaveText('Default 2');
    await expect(renders2).toHaveText('3');
  });
});
