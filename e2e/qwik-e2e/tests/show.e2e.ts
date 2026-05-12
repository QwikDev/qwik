import { expect, test } from '@playwright/test';

test.describe('show', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/e2e/show');
    page.on('pageerror', (err) => expect(err).toEqual(undefined));
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        expect(msg.text()).toEqual(undefined);
      }
    });
  });

  test('should render initial branches during SSR', async ({ page }) => {
    await expect(page.locator('#initial-true')).toHaveText('Initial then');
    await expect(page.locator('#initial-false')).toHaveText('Else');
    await expect(page.locator('#initial-empty')).toHaveText('');
  });

  test('should update then and else branches after resume', async ({ page }) => {
    const result = page.locator('#toggle-with-else-result');

    await expect(result).toHaveText('Hidden');
    await page.locator('#toggle-with-else').click();
    await expect(result).toHaveText('Shown');
    await page.locator('#toggle-with-else').click();
    await expect(result).toHaveText('Hidden');
  });

  test('should update empty fallback after resume', async ({ page }) => {
    const result = page.locator('#toggle-without-else-result');

    await expect(result).toHaveText('');
    await page.locator('#toggle-without-else').click();
    await expect(result).toHaveText('Present');
    await page.locator('#toggle-without-else').click();
    await expect(result).toHaveText('');
  });

  test('should keep event handlers in rendered branches working', async ({ page }) => {
    await expect(page.locator('#branch-action')).toHaveText('Inside 0');
    await page.locator('#branch-action').click();
    await expect(page.locator('#branch-action')).toHaveText('Inside 1');
    await expect(page.locator('#branch-count')).toHaveText('1');

    await page.locator('#toggle-interactive').click();
    await expect(page.locator('#interactive-result')).toHaveText('Interactive else');
    await page.locator('#toggle-interactive').click();
    await expect(page.locator('#branch-action')).toHaveText('Inside 1');
  });
});
