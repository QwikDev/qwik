import { test, expect } from '@playwright/test';

test.describe('slot', () => {
  function tests() {
    test('should implement basic computed values', async ({ page }) => {
      const result = page.locator('.result');
      const increment = page.locator('#increment');

      await expect(result).toHaveText([
        'count: 0',
        'double: 0',
        'plus3: 3',
        'triple: 9',
        'sum: 12',
      ]);

      await increment.click();
      await expect(result).toHaveText([
        'count: 1',
        'double: 2',
        'plus3: 5',
        'triple: 15',
        'sum: 22',
      ]);

      await increment.click();
      await expect(result).toHaveText([
        'count: 2',
        'double: 4',
        'plus3: 7',
        'triple: 21',
        'sum: 32',
      ]);
    });
  }

  test.beforeEach(async ({ page }) => {
    await page.goto('/e2e/computed');
    page.on('pageerror', (err) => expect(err).toEqual(undefined));
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        expect(msg.text()).toEqual(undefined);
      }
    });
  });

  tests();

  test.describe('client rerender', () => {
    test.beforeEach(async ({ page }) => {
      const rerender = page.locator('#rerender');
      await rerender.click();
      await page.waitForTimeout(100);
    });
    tests();
  });
});
