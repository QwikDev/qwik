import { test, expect } from '@playwright/test';

test.describe('backpatching', () => {
  test.beforeEach(async ({ page }) => {
    page.on('pageerror', (err) => expect(err).toEqual(undefined));
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        expect(msg.text()).toEqual(undefined);
      }
    });
    await page.goto('/e2e/backpatching');
  });

  test('should backpatch attributes', async ({ page }) => {
    const input = page.locator('#attribute-backpatching-input');
    await expect(input).toHaveAttribute('aria-describedby', 'final-id');
  });
});
