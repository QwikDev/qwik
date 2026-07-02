import { expect, test } from '@playwright/test';
import { assertNoBrowserErrors, streamingUrl } from './error-boundary-helpers';

// The error-boundary.prod app builds both bundles with qDev=false (dev-server.ts keys production
// mode off the ".prod" app-name suffix), covering the prod client axis the dev app cannot.
const prodUrl = (scenario: string | null) =>
  streamingUrl(scenario, true, '/error-boundary.prod/eb');

test.describe('ErrorBoundary prod build (qDev=false)', () => {
  test('client throw after resume shows the redacted fallback, raw message nowhere in the page', async ({
    page,
  }) => {
    assertNoBrowserErrors(page);
    await page.goto(prodUrl('client'), { waitUntil: 'commit' });

    await expect(page.locator('#eb-content')).toHaveText('content ok', { timeout: 10000 });
    await expect(page.locator('#eb-fallback')).toHaveCount(0);

    await page.locator('#eb-client-throw').click();

    await expect(page.locator('#eb-fallback')).toBeVisible({ timeout: 10000 });
    // qDev=false client redacts the raw client message to the generic form.
    await expect(page.locator('#eb-fallback-msg')).toHaveText('caught: An error occurred');
    // Rendered text only: qwik/state still carries the raw string as the fixture's own
    // serialized `message` prop (input data), not as the caught error.
    expect(await page.locator('body').innerText()).not.toContain('client click boom');

    await page.locator('#eb-fallback-button').click();
    await expect(page.locator('#eb-fallback-count')).toHaveText('1');
  });

  test('SSR swap: the prod-built client resumes the swapped page, fallback interactive', async ({
    page,
  }) => {
    assertNoBrowserErrors(page);
    await page.goto(prodUrl(null), { waitUntil: 'commit' });

    await expect(page.locator('#eb-fallback')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#eb-fallback-msg')).toHaveText('caught: An error occurred');
    await expect(page.locator('#eb-content')).toBeHidden();

    await page.locator('#eb-fallback-button').click();
    await expect(page.locator('#eb-fallback-count')).toHaveText('1');
  });

  test('reset round-trips through the prod serializer and re-executes the children', async ({
    page,
  }) => {
    assertNoBrowserErrors(page);
    await page.goto(prodUrl('reset'), { waitUntil: 'commit' });

    await expect(page.locator('#eb-fallback')).toBeVisible({ timeout: 10000 });

    await page.locator('#eb-reset').click();

    await expect(page.locator('#eb-content')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#eb-fallback')).toHaveCount(0);

    await page.locator('#eb-content-button').click();
    await expect(page.locator('#eb-content-count')).toHaveText('1');
  });
});
