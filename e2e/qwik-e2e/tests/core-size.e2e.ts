import { expect, test } from '@playwright/test';

const getDownloadedJs = (page: import('@playwright/test').Page) =>
  page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .filter(
        (entry) => entry.name.includes('/core-size.prod/build/') && entry.name.endsWith('.js')
      )
      .map((entry) => {
        const resource = entry as PerformanceResourceTiming;
        return {
          name: new URL(resource.name).pathname,
          bytes: resource.encodedBodySize,
        };
      })
  );

test('keeps the minimal signal transfer small', async ({ page }) => {
  await page.goto('/core-size.prod/', { waitUntil: 'networkidle' });

  const initial = await getDownloadedJs(page);
  const initialBytes = initial.reduce((total, resource) => total + resource.bytes, 0);
  expect(initialBytes, JSON.stringify(initial, null, 2)).toBe(0);

  await page.locator('#count').click();
  await expect(page.locator('#count')).toHaveText('1');

  const initialNames = new Set(initial.map((resource) => resource.name));
  const lazy = (await getDownloadedJs(page)).filter((resource) => !initialNames.has(resource.name));
  const lazyBytes = lazy.reduce((total, resource) => total + resource.bytes, 0);
  expect(lazyBytes, JSON.stringify(lazy, null, 2)).toBeLessThanOrEqual(26_000);
});
