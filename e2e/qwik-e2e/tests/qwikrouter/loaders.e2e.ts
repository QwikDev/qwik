import { expect, test } from '@playwright/test';

test.describe('loaders', () => {
  test.describe('mpa', () => {
    test.use({ javaScriptEnabled: false });
    tests();
  });

  test.describe('spa', () => {
    test.use({ javaScriptEnabled: true });
    tests();

    test('falls back to a full-page load when an SPA-navigated loader throws error()', async ({
      page,
    }) => {
      await page.goto('/qwikrouter-test/loaders/loader-fail/?ok=1');
      await expect(page.locator('#loader-fail-value')).toHaveText('tshirt');

      const documentRequest = page.waitForRequest(
        (request) =>
          request.isNavigationRequest() && request.url().includes('/loaders/loader-error')
      );
      await page.locator('#link-loader-error').click();
      const request = await documentRequest;
      const response = await request.response();
      expect(response?.status()).toBe(401);
      await expect(page.locator('body')).toContainText('loader-error-caught');
    });

    test('should reuse filtered search loaders only for the same SPA route path', async ({
      page,
    }) => {
      const routePath = page.locator('#search-cache-route-path');
      const keep = page.locator('#search-cache-keep');
      const noise = page.locator('#search-cache-noise');
      const token = page.locator('#search-cache-token');

      await page.goto('/qwikrouter-test/loaders/search-cache/');
      await page.locator('#link-search-cache-alpha').click();
      await page.waitForURL(
        (url) =>
          url.pathname.endsWith('/loaders/search-cache/alpha/') &&
          url.searchParams.get('keep') === 'one' &&
          url.searchParams.get('noise') === 'first'
      );
      await expect(routePath).toHaveText('routePath: alpha');
      await expect(keep).toHaveText('keep: one');
      await expect(noise).toHaveText('noise: none');
      const alphaToken = await token.innerText();

      await page.locator('#link-search-cache-alpha-second').click();
      await page.waitForURL(
        (url) =>
          url.pathname.endsWith('/loaders/search-cache/alpha/') &&
          url.searchParams.get('keep') === 'one' &&
          url.searchParams.get('noise') === 'second'
      );
      await expect(routePath).toHaveText('routePath: alpha');
      await expect(keep).toHaveText('keep: one');
      await expect(noise).toHaveText('noise: none');
      await expect(token).toHaveText(alphaToken);

      await page.locator('#link-search-cache-beta').click();
      await page.waitForURL(
        (url) =>
          url.pathname.endsWith('/loaders/search-cache/beta/') &&
          url.searchParams.get('keep') === 'one' &&
          url.searchParams.get('noise') === 'second'
      );
      await expect(routePath).toHaveText('routePath: beta');
      await expect(keep).toHaveText('keep: one');
      await expect(noise).toHaveText('noise: none');
      await expect(token).not.toHaveText(alphaToken);
    });
  });

  function tests() {
    test('should run loaders', async ({ page }) => {
      await page.goto('/qwikrouter-test/loaders/hola');

      const date = page.locator('#date');
      const slow = page.locator('#slow');

      const title = page.locator('title');
      const nestedDate = page.locator('#nested-date');
      const nestedDep = page.locator('#nested-dep');
      const nestedName = page.locator('#nested-name');
      const formName = page.locator('#form-name');
      const metaDate = page.locator('meta[name="date"]');
      const metaDep = page.locator('meta[name="dep"]');

      const submit = page.locator('#form-submit');

      await expect(title).toHaveText('Loaders - Qwik', { useInnerText: true });
      await expect(date).toHaveText('date: 2021-01-01T00:00:00.000Z');
      await expect(slow).toHaveText('slow: 123');
      await expect(nestedDate).toHaveText('date: 2021-01-01T00:00:00.000Z');
      await expect(nestedDep).toHaveText('dep: 84');
      await expect(metaDate).toHaveAttribute('content', '2021-01-01T00:00:00.000Z');
      await expect(metaDep).toHaveAttribute('content', '42');

      await expect(nestedName).toHaveText('name: hola');
      await formName.fill('Manuel');
      await submit.click();
      await expect(title).toHaveText('Loaders - ACTION: Manuel - Qwik', {
        useInnerText: true,
      });
      await expect(date).toHaveText('date: 2021-01-01T00:00:00.000Z');
      await expect(slow).toHaveText('slow: 123');
      await expect(nestedDate).toHaveText('date: 2021-01-01T00:00:00.000Z');
      await expect(nestedDep).toHaveText('dep: 84');
      // The loader-derived name is unchanged after the action: route loaders
      // refetched after an action submission run as standalone GETs without
      // action context, so they don't see action state via resolveValue().
      // Action state is observable directly via the action signal — see the title.
      await expect(nestedName).toHaveText('name: hola');

      await page.locator('#link-stuff').click();
      // Wait for URL to change first, then verify content
      await page.waitForURL('**/loaders/stuff/**');
      await expect(nestedName).toHaveText('name: stuff');
      await expect(title).toHaveText('Loaders - Qwik', { useInnerText: true });
      await expect(date).toHaveText('date: 2021-01-01T00:00:00.000Z');
      await expect(slow).toHaveText('slow: 123');
      await expect(nestedDate).toHaveText('date: 2021-01-01T00:00:00.000Z');
      await expect(nestedDep).toHaveText('dep: 84');

      await page.locator('#link-welcome').click();
      // Wait for URL to change first, then verify content
      await page.waitForURL('**/loaders/welcome/**');
      await expect(nestedName).toHaveText('name: welcome');
      await expect(title).toHaveText('Loaders - Qwik', { useInnerText: true });
      await expect(date).toHaveText('date: 2021-01-01T00:00:00.000Z');
      await expect(slow).toHaveText('slow: 123');
      await expect(nestedDate).toHaveText('date: 2021-01-01T00:00:00.000Z');
      await expect(nestedDep).toHaveText('dep: 84');
    });

    test('should pass reactivity issue', async ({ page }) => {
      await page.goto('/qwikrouter-test/issue-loader');

      const realDate = page.locator('#real-date');
      const value = await realDate.textContent();
      const submit = page.locator('#submit');

      await submit.click();

      await expect(realDate).not.toHaveText(value!);
    });

    test('serialization of loaders', async ({ page, javaScriptEnabled }) => {
      await page.goto('/qwikrouter-test/issue-loader-serialization/');
      const loaderData = page.locator('.loader-data');

      await expect(loaderData).toHaveText([
        javaScriptEnabled ? 'loader-cmp1' : 'empty',
        'empty',
        'loader-cmp4',
        '{"message":"loader-cmp5"}',
      ]);

      if (javaScriptEnabled) {
        await page.locator('#update-cmp2').click();
        await expect(loaderData).toHaveText([
          'loader-cmp1',
          'loader-cmp2',
          'loader-cmp4',
          '{"message":"loader-cmp5"}',
        ]);

        await page.locator('#update-cmp3').click();
        await expect(loaderData).toHaveText([
          'loader-cmp1',
          'loader-cmp2',
          'loader-cmp3',
          'loader-cmp4',
          '{"message":"loader-cmp5"}',
        ]);

        await page.locator('#update-cmp5').click();
        await expect(loaderData).toHaveText([
          'loader-cmp1',
          'loader-cmp2',
          'loader-cmp3',
          'loader-cmp4',
          '{"message":"loader-cmp5"}',
        ]);
      }
    });

    test('should work loader result as component prop', async ({ page }) => {
      await page.goto('/qwikrouter-test/loaders/prop');
      await expect(page.locator('#prop')).toHaveText('test');
      await expect(page.locator('#prop-unwrapped')).toHaveText('test');
    });

    test('renders inline error UI with the fail() status', async ({ page }) => {
      const response = await page.goto('/qwikrouter-test/loaders/loader-fail/');
      const contentType = await response?.headerValue('Content-Type');
      const status = response?.status();

      expect(status).toEqual(429);
      expect(contentType).toEqual('text/html; charset=utf-8');
      expect(await response?.headerValue('Cache-Control')).toBeNull();
      await expect(page.locator('#loader-fail-error')).toHaveText('429 Rate limited');
    });

    test('should modify ServerError in middleware', async ({ page }) => {
      const response = await page.goto('/qwikrouter-test/loaders/loader-error');
      const contentType = await response?.headerValue('Content-Type');
      const status = response?.status();

      expect(status).toEqual(401);
      expect(contentType).toEqual('text/html; charset=utf-8');
      const body = page.locator('body');
      await expect(body).toContainText('loader-error-caught');
    });

    test('should return html with uncaught ServerErrors thrown in loaders', async ({ page }) => {
      const response = await page.goto('/qwikrouter-test/loaders/loader-error/uncaught-server');
      const contentType = await response?.headerValue('Content-Type');
      const status = response?.status();

      expect(status).toEqual(401);
      expect(contentType).toEqual('text/html; charset=utf-8');
      const body = page.locator('body');
      await expect(body).toContainText('server-error-data');
    });

    test('should not serialize loaders by default and serialize with serializationStrategy: always', async ({
      page,
      javaScriptEnabled,
    }) => {
      await page.goto('/qwikrouter-test/loaders-serialization/');
      const stateData = page.locator('script[type="qwik/state"]');

      expect(await stateData.textContent()).not.toContain('some test value');
      expect(await stateData.textContent()).not.toContain('should not serialize this');
      expect(await stateData.textContent()).toContain('some eager test value');
      expect(await stateData.textContent()).toContain('should serialize this');

      if (javaScriptEnabled) {
        await page.locator('#toggle-child').click();
        await expect(page.locator('#prop1')).toHaveText('some test value');
        await expect(page.locator('#prop2')).toHaveText('should not serialize this');
        await expect(page.locator('#prop3')).toHaveText('some eager test value');
        await expect(page.locator('#prop4')).toHaveText('should serialize this');
        await expect(page.locator('#prop5')).toHaveText('some test value nested');
        await expect(page.locator('#prop6')).toHaveText('should not serialize this nested');
      }
    });

    test('imported loaders keep sharedMap data after resume', async ({
      page,
      javaScriptEnabled,
    }) => {
      await page.goto('/qwikrouter-test/loaders-serialization/');

      await expect(page.locator('#imported-never-ssr')).toHaveText('shared loader value');
      await expect(page.locator('#imported-always-ssr')).toHaveText('shared loader value');

      if (javaScriptEnabled) {
        const qLoaderRequest = page.waitForRequest((request) => {
          const url = request.url();
          return url.includes('/q-loader-') && url.endsWith('.json');
        });
        await page.locator('#toggle-imported-child').click();
        await qLoaderRequest;
        await expect(page.locator('#imported-always-child')).toHaveText('shared loader value');
        await expect(page.locator('#imported-never-child')).toHaveText('shared loader value');
      }
    });
  }
});
