import { expect, test } from '@playwright/test';

test.describe('Bufferring', () => {
  test.beforeEach(async ({ page }) => {
    // Clear cache before each test
    await page.goto('/');
    await page.evaluate(async () => {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((name) => caches.delete(name)));
    });
  });

  test('should buffer all the bundles', async ({ page }) => {
    await page.goto('/');

    await page.waitForFunction(() => navigator.serviceWorker?.controller);

    const requests = new Set<string>();

    page.route('**/*.js', (route) => {
      requests.add(route.request().url());
      console.log('route', route.request().url());
      route.continue();
    });

    // Interact with the page
    const button = page.getByRole('button', { name: /click me/i });
    await button.click();

    console.log('requests', requests);
    const jsBundles = Array.from(requests).filter((url) => url.includes('.js'));
    console.log(jsBundles);

    const cachedBundles = await page.evaluate(async (bundles) => {
      const cache = await caches.open('QwikBuild');
      const keys = await cache.keys();
      console.log('keys', keys);
      const cachedBundles = keys.map((key) => key.url);
      console.log('cachedBundles', cachedBundles);
      return cachedBundles;
    }, jsBundles);

    await expect(page.getByTestId('hi')).toBeVisible();
    expect(cachedBundles).toEqual(jsBundles);
  });
});
