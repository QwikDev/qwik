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

  test('a router link from the external library navigates without a reload', async ({ page }) => {
    assertNoBrowserErrors(page);
    await page.goto('/external-library/');
    await page.evaluate(() => ((window as any).spaMarker = true));

    await page.locator('#lib-link').click();

    await expect(page.locator('#other-page')).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/external-library/other/');
    expect(await page.evaluate(() => (window as any).spaMarker)).toBe(true);
  });

  test('the external library shares the request with the app router', async ({ page }) => {
    assertNoBrowserErrors(page);
    await page.goto('/external-library/');

    await expect(page.locator('#lib-request-path')).toHaveText('/external-library/');
    await expect(page.locator('#lib-request-event')).toHaveText('true');
    await expect(page.locator('#lib-base-pathname')).toHaveText('/external-library/');
    await expect(page.locator('#lib-routes')).toHaveText('true');
  });

  test('a ServerError thrown by the external library keeps its status', async ({ page }) => {
    // The browser logs the 403 response, so this test does not assert a clean console.
    await page.goto('/external-library/');

    await page.locator('#lib-reject').click();

    await expect(page.locator('#lib-rejection')).toHaveText('rejected by the library');
  });
});
