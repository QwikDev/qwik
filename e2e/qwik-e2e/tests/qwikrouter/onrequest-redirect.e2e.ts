import { expect, test } from '@playwright/test';

const base = '/qwikrouter-test/issue9333/';

test('waits for an onRequest redirect before committing the route', async ({ page }) => {
  let releaseResponse!: () => void;
  let markRequestReceived!: () => void;
  const responseGate = new Promise<void>((resolve) => (releaseResponse = resolve));
  const requestReceived = new Promise<void>((resolve) => (markRequestReceived = resolve));

  await page.route('**/issue9333/redirecting/q-loader-*.json*', async (route) => {
    const response = await route.fetch({ maxRedirects: 0 });
    markRequestReceived();
    await responseGate;
    await route.fulfill({ response });
  });

  try {
    await page.goto(`${base}start/`);
    await page.waitForFunction(() => (window as any)._qwikEv?.roots);
    await page.getByRole('link', { name: 'Redirect' }).click();
    await requestReceived;

    await expect
      .poll(async () => ({
        pathname: new URL(page.url()).pathname,
        redirectingVisible: await page.locator('#issue9333-redirecting').isVisible(),
        layoutTaskUrls: await page.locator('#issue9333-layout-task-urls').textContent(),
      }))
      .toEqual({
        pathname: `${base}start/`,
        redirectingVisible: false,
        layoutTaskUrls: '[]',
      });

    releaseResponse();
    await expect(page).toHaveURL(`${base}target/`);
    await expect(page.locator('#issue9333-target')).toBeVisible();
    await expect(page.locator('#issue9333-layout-task-urls')).toHaveText(
      JSON.stringify([`${base}target/`])
    );
  } finally {
    releaseResponse();
  }
});

test('a full page request follows the onRequest redirect', async ({ page }) => {
  await page.goto(`${base}redirecting/`, { waitUntil: 'domcontentloaded' });

  await expect(page).toHaveURL(`${base}target/`);
  await expect(page.locator('#issue9333-redirecting')).toHaveCount(0);
  await expect(page.locator('#issue9333-target')).toBeVisible();
});
