import { expect, test } from '@playwright/test';
import { assertNoBrowserErrors } from './e2e-helpers';

test.describe('externalized qwik library', () => {
  test('a library evaluated against a second core copy on the server renders and resumes', async ({
    page,
  }) => {
    assertNoBrowserErrors(page);
    await page.goto('/external-library/');

    // Proves the fixture: the server ran the library with its own copy of core.
    await expect(page.locator('#core-copies')).toHaveText('duplicated');
    await expect(page.locator('#lib-greeting')).toHaveText('Hello from the app');
    await expect(page.locator('#lib-count')).toHaveText('0');
    await expect(page.locator('#lib-task-runs')).toHaveText('1');

    await page.locator('#lib-increment').click();

    await expect(page.locator('#lib-count')).toHaveText('1');
    await expect(page.locator('#lib-task-runs')).toHaveText('2');
  });
});
