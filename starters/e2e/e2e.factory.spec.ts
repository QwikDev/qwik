import { test, expect } from '@playwright/test';

test.describe('factory', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/e2e/factory');
    page.on('pageerror', (err) => expect(err).toEqual(undefined));
  });

  test('should render correctly', async ({ page }) => {
    const body = page.locator('body');

    expect((await body.innerText()).trim()).toEqual('A\nB\nLight: wow!');
  });
});
