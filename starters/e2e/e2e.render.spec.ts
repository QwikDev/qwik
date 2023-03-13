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

    await expect(attributes).toHaveClass('⭐️unvb18-1 odd stable0');
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
    const button = page.locator('#issue-1475-button');
    const result = page.locator('#issue-1475-result');

    await button.click();
    await page.waitForTimeout(100);
    await expect(result).toHaveText('1. Before\n2. Some text\nMiddle\n3 After\n\nStuff', {
      useInnerText: true,
    });
  });

  test('counter toggle', async ({ page }) => {
    const button = page.locator('#counter-toggle-btn');
    const show1 = page.locator('#counter-toggle-show');
    const show2 = page.locator('#counter-toggle-show-2');
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

    const message1 = page.locator('#props-destructuring > span');
    const renders1 = page.locator('#props-destructuring > .renders');

    const message2 = page.locator('#props-destructuring-no > span');
    const renders2 = page.locator('#props-destructuring-no > .renders');

    const message3 = page.locator('#props-destructuring-count > span');
    const renders3 = page.locator('#props-destructuring-count > .renders');

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
    const string = page.locator('#issue-2563-string');
    const obj = page.locator('#issue-2563-obj');
    const operation = page.locator('#issue-2563-operation');

    await expect(string).toHaveText('4=4');
    await expect(obj).toHaveText('4=4');
    await expect(operation).toHaveText('4+1=5');
  });

  test('issue2608', async ({ page }) => {
    const toggle = page.locator('#issue-2608-btn');
    const input = page.locator('#issue-2608-input');

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
    const button = page.locator('#issue-2800-btn');
    const results = page.locator('#issue-2800-result > li');

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

  test('issue2889', async ({ page }) => {
    const result1 = page.locator('#issue-2889-result1');
    const result2 = page.locator('#issue-2889-result2');

    await expect(result1).toHaveText('Deeds: 4');
    await expect(result2).toHaveText('Filtered Deeds: 2');
  });

  test('issue3116', async ({ page }) => {
    const result = page.locator('#issue-3116-result');

    await expect(result).toHaveText('this comes from render$');
  });

  test('issue reorder', async ({ page }) => {
    const result = page.locator('.issue-order');
    const button = page.locator('#issue-order-btn');
    await expect(result).toHaveText(['TOP', '1. First', '2. Second']);

    await button.click();
    await expect(result).toHaveText(['1. First', '2. Second', 'BOTTOM']);
  });

  test('issue2414', async ({ page }) => {
    const sortByAge = page.locator('#issue-2414-age');
    const sortBySize = page.locator('#issue-2414-size');
    const sortById = page.locator('#issue-2414-id');

    const age = page.locator('.issue-2414-age');
    const size = page.locator('.issue-2414-size');
    const id = page.locator('.issue-2414-id');

    const list = [
      [1, 9, 4],
      [2, 27, 3],
      [3, 3, 2],
      [4, 1, 1],
      [7, 21, 5],
      [8, 12, 6],
      [9, 7, 7],
    ];
    await expect(size).toHaveText(list.map((a) => String(a[0])));
    await expect(age).toHaveText(list.map((a) => String(a[1])));
    await expect(id).toHaveText(list.map((a) => String(a[2])));

    // Sort by age
    list.sort((a, b) => a[1] - b[1]);
    await sortByAge.click();

    await expect(size).toHaveText(list.map((a) => String(a[0])));
    await expect(age).toHaveText(list.map((a) => String(a[1])));
    await expect(id).toHaveText(list.map((a) => String(a[2])));

    list.sort((a, b) => a[2] - b[2]);
    await sortById.click();

    await expect(size).toHaveText(list.map((a) => String(a[0])));
    await expect(age).toHaveText(list.map((a) => String(a[1])));
    await expect(id).toHaveText(list.map((a) => String(a[2])));

    list.sort((a, b) => a[0] - b[0]);
    await sortBySize.click();

    await expect(size).toHaveText(list.map((a) => String(a[0])));
    await expect(age).toHaveText(list.map((a) => String(a[1])));
    await expect(id).toHaveText(list.map((a) => String(a[2])));
  });
});
