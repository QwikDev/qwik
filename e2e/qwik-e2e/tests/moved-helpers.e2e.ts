import { expect, test } from '@playwright/test';
import { assertNoBrowserErrors } from './e2e-helpers';

test.describe('same-file helpers used by one component', () => {
  test.beforeEach(async ({ page }) => {
    assertNoBrowserErrors(page);
    await page.goto('/e2e/moved-helpers');
    await expect.poll(() => page.evaluate(() => !!(window as any)._qwikEv?.roots)).toBe(true);
  });

  test('an inline component renders on the client and runs its onClick$', async ({ page }) => {
    await page.locator('#show-arrow-row').click();
    const row = page.locator('#arrow-row');
    await row.click();
    await expect(row).toHaveText('arrow clicked');
  });

  test('an inline component declared with function renders on the client and runs its onClick$', async ({
    page,
  }) => {
    await page.locator('#show-function-row').click();
    const row = page.locator('#function-row');
    await row.click();
    await expect(row).toHaveText('function clicked');
  });

  test("a hook's useTask$ runs when its component renders on the client", async ({ page }) => {
    await page.locator('#show-task-hook').click();
    await expect(page.locator('#task-status')).toHaveText('task ran');
  });
});
