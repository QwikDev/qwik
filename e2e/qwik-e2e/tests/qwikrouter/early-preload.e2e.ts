import { expect, test } from '@playwright/test';
import type { QwikManifest } from '@qwik.dev/core/optimizer';

test.use({ baseURL: 'http://localhost:3301' });

test('client Link reports route demand before its page module finishes loading', async ({
  page,
}) => {
  const start = '/qwikrouter-test.prod/early-preload/';
  await page.request.get(start);
  const manifest: QwikManifest = await (
    await page.request.get('/qwikrouter-test.prod/q-manifest.json')
  ).json();
  const target = Object.keys(manifest.bundles).find((file) =>
    manifest.bundles[file].origins?.some((origin) =>
      origin.endsWith('/routes/redirect-only/final/index.tsx')
    )
  );
  expect(target).toBeDefined();
  let releasePage!: () => void;
  const pendingPage = new Promise<void>((resolve) => (releasePage = resolve));
  await page.route(`**/build/${target}`, async (route) => {
    await pendingPage;
    await route.continue();
  });
  try {
    await page.goto(start);
    await page.waitForFunction(() => (window as any)._qwikEv?.roots);
    await page.locator('#show-link').click();
    const link = page.locator('#client-link');
    await expect(link).toBeVisible();
    expect(await link.getAttribute('data-q-route')).toBeNull();
    await page.evaluate(() => {
      const runtime = window as any;
      const preload = runtime.qPreload;
      runtime.routeHints = [];
      runtime.qPreload = (...args: any[]) => {
        runtime.routeHints.push(args);
        preload?.(...args);
      };
    });
    await link.click();
    await expect
      .poll(() =>
        page.evaluate(() =>
          (window as any).routeHints.some(
            ([name, probability]: [unknown, number]) =>
              typeof name === 'string' && name.endsWith('redirect-only/final/') && probability === 1
          )
        )
      )
      .toBe(true);
  } finally {
    releasePage();
  }
  await expect(page.locator('#redirect-only-final')).toBeVisible();
});
