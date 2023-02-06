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

    const message3 = await page.locator('#props-destructuring-count > span');
    const renders3 = await page.locator('#props-destructuring-count > .renders');

    await expect(message1).toHaveText('Hello 0');
    await expect(renders1).toHaveText('1');
    await expect(message2).toHaveText('Default 0');
    await expect(renders2).toHaveText('1');
    await expect(message3).toHaveText('Count 0');
    await expect(message3).toHaveAttribute('aria-count', '0');
    await expect(renders3).toHaveText('1');

    await button.click();

    await expect(message1).toHaveText('Hello 1');
    await expect(renders1).toHaveText('1');
    await expect(message2).toHaveText('Default 1');
    await expect(renders2).toHaveText('1');
    await expect(message3).toHaveText('Count 1');
    await expect(message3).toHaveAttribute('aria-count', '1');
    await expect(renders3).toHaveText('2');

    await button.click();

    await expect(message1).toHaveText('Hello 2');
    await expect(renders1).toHaveText('1');
    await expect(message2).toHaveText('Default 2');
    await expect(renders2).toHaveText('1');
    await expect(message3).toHaveText('Count 2');
    await expect(message3).toHaveAttribute('aria-count', '2');
    await expect(renders3).toHaveText('3');
  });

  test('issue2563', async ({ page }) => {
    const string = await page.locator('#issue-2563-string');
    const obj = await page.locator('#issue-2563-obj');
    const operation = await page.locator('#issue-2563-operation');

    await expect(string).toHaveText('4=4');
    await expect(obj).toHaveText('4=4');
    await expect(operation).toHaveText('4+1=5');
  });

  test('issue2608', async ({ page }) => {
    const toggle = await page.locator('#issue-2608-btn');
    const input = await page.locator('#issue-2608-input');

    await expect(input).toHaveValue('');
    await input.fill('some text');
    await expect(input).toHaveValue('some text');
    await toggle.click();
    await page.waitForTimeout(100);
    await expect(input).toHaveValue('some text');
    await toggle.click();
    await page.waitForTimeout(100);
    await expect(input).toHaveValue('some text');
  });

  test('issue2800', async ({ page }) => {
    const button = await page.locator('#issue-2800-btn');
    const results = await page.locator('#issue-2800-result > li');

    await expect(results).toHaveText(['alpha - 1', 'bravo - 2', 'charlie - 3']);

    await button.click();
    await expect(results).toHaveText(['alpha - 1', 'bravo - 2', 'charlie - 3', 'extra3 - 1']);
    await button.click();
    await expect(results).toHaveText([
      'alpha - 1',
      'bravo - 2',
      'charlie - 3',
      'extra3 - 1',
      'extra4 - 1',
    ]);
  });
});
