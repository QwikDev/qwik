import { test, expect, type Page } from '@playwright/test';

test.describe('Sandbox smoke tests', () => {
  test('counter example page loads', async ({ page }) => {
    await page.goto('/examples/reactivity/counter/');
    await expect(page).toHaveTitle(/Counter/);
  });

  test.describe('REPL interactive', () => {
    test('bundler failures appear in the preview', async ({ page }) => {
      await page.addInitScript(() => {
        const NativeWorker = window.Worker;
        window.Worker = class extends NativeWorker {
          constructor(url: string | URL, options?: WorkerOptions) {
            if (String(url).includes('repl-bundler-worker')) {
              url = URL.createObjectURL(
                new Blob(
                  [
                    'self.postMessage({type: "ready"}); self.onmessage = ({data}) => { if (data.type === "bundle") throw new Error("Bundler <failure>"); };',
                  ],
                  { type: 'text/javascript' }
                )
              );
            }
            super(url, options);
          }
        };
      });
      await page.goto('/playground/');
      await expect(page.frameLocator('iframe').locator('body')).toContainText('Bundler <failure>');
    });

    test('SSR worker startup errors appear in the preview', async ({ page }) => {
      await page.addInitScript(() => {
        const NativeWorker = window.Worker;
        window.Worker = class extends NativeWorker {
          constructor(url: string | URL, options?: WorkerOptions) {
            if (String(url).includes('repl-ssr-worker')) {
              url = URL.createObjectURL(
                new Blob(['throw new Error("SSR startup <failure>");'], {
                  type: 'text/javascript',
                })
              );
            }
            super(url, options);
          }
        };
      });
      await page.goto('/playground/');
      await expect(page.frameLocator('iframe').locator('body')).toContainText(
        'SSR startup <failure>'
      );
    });

    test('output tabs list the client bundles and SSR module', async ({ page }) => {
      await page.goto('/playground/');
      const preview = page.locator('iframe').contentFrame();
      await expect(preview.locator('body')).not.toBeEmpty();
      await expect(preview.getByRole('heading', { name: / Error$/ })).toHaveCount(0);

      // Each panel shows its own header only when it lists outputs.
      for (const [tab, header] of [
        ['Client Bundles', '/dist/'],
        ['SSR Module', '/server/'],
      ]) {
        await page.getByRole('button', { name: tab, exact: true }).click();
        await expect(page.locator('.output-modules .file-tree-header')).toHaveText(header);
        await expect(page.locator('.output-modules .file-item').first()).toBeVisible();
      }
    });

    test.describe('Rust optimizer', () => {
      // A share URL is only applied when it carries files; this is the default app.
      const appFiles = 'f=Q040psaDsymCJ20ZmmJNW6mJuShpCyaIkcZQvETlFIZmKa6UBlQxIlIaAA';

      const failFirstRequest = async (page: Page, url: RegExp) => {
        let hasFailed = false;
        await page.context().route(url, (route) => {
          if (hasFailed) {
            return route.continue();
          }
          hasFailed = true;
          return route.abort();
        });
      };

      const expectRetryRenders = async (page: Page) => {
        const preview = page.locator('iframe').contentFrame();
        await expect(preview.getByRole('heading', { name: / Error$/ })).toBeVisible();

        await page.getByRole('button', { name: 'Options', exact: true }).click();
        await page.getByLabel('Debug').check();
        await expect(preview.getByRole('heading', { name: / Error$/ })).toHaveCount(0, {
          timeout: 60_000,
        });
        await expect(preview.locator('body')).toContainText('Hello from Qwik');
      };

      test('builds again after its version lookup fails once', async ({ page }) => {
        // Without cached npm versions, the REPL swaps a shared version for the bundled one.
        await page.addInitScript(() => {
          const npmData = {
            tags: { latest: '2.0.0-rc.4' },
            versions: ['2.0.0-rc.4'],
            timestamp: Date.now(),
          };
          localStorage.setItem('qwikNpmData', JSON.stringify(npmData));
        });
        await failFirstRequest(page, /\/@qwik\.dev\/core@2\.0\.0-rc\.4\/package\.json$/);
        await page.goto(`/playground/#v=2.0.0-rc.4&rust=1&${appFiles}`);
        await expectRetryRenders(page);
      });

      test('builds again after its loader fails to download once', async ({ page }) => {
        await failFirstRequest(page, /\/@qwik\.dev\/optimizer@[^/]+\/bindings\/qwik\.wasm\.mjs$/);
        await page.goto(`/playground/#rust=1&${appFiles}`);
        await expectRetryRenders(page);
      });
    });

    test('counter click works in REPL', async ({ page }) => {
      await page.goto('/examples/reactivity/counter/');

      // The REPL renders the app inside a single iframe
      const replFrame = page.locator('iframe').contentFrame();

      const countValue = replFrame.locator('main>p').first();
      const clickButton = replFrame.getByRole('button', { name: 'Click' });

      await expect(countValue).toHaveText('Count: 0', { timeout: 30_000 });
      await clickButton.click();
      await expect(countValue).toHaveText('Count: 1');
    });

    test('Client Bundles tab lists the bundles and shows their code', async ({ page }) => {
      await page.goto('/playground/');
      await page.getByRole('button', { name: 'Client Bundles' }).click();

      const bundlePaths = page.locator('.output-modules .file-tree-items a');
      const bundles = page.locator('.output-modules .file-item');
      await expect(bundlePaths.first()).not.toBeEmpty();
      await expect(bundles.first().locator('pre code')).not.toBeEmpty();
    });

    test('a truncated bundle expands when asked to show more', async ({ page }) => {
      await page.goto('/playground/');
      await page.getByRole('button', { name: 'Client Bundles' }).click();

      const longBundle = page
        .locator('.output-modules .file-item')
        .filter({ has: page.locator('.file-toggle-button') })
        .first();
      const toggle = longBundle.locator('.file-toggle-button');
      const code = longBundle.locator('pre code');
      await expect(toggle).toHaveText('Truncated - show more');
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      const truncatedLength = (await code.innerText()).length;

      await toggle.click();

      await expect(toggle).toHaveText('Show less');
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await expect
        .poll(async () => (await code.innerText()).length)
        .toBeGreaterThan(truncatedLength);
    });

    test('an expanded bundle stays expanded when switching output tabs', async ({ page }) => {
      await page.goto('/playground/');
      await page.getByRole('button', { name: 'Client Bundles' }).click();
      const toggle = page.locator('.output-modules .file-toggle-button').first();
      await toggle.click();
      await expect(toggle).toHaveText('Show less');

      await page.getByRole('button', { name: 'SSR Module', exact: true }).click();
      await expect(page.locator('.output-modules .file-tree-header')).toHaveText('/server/');
      await page.getByRole('button', { name: 'Client Bundles' }).click();

      await expect(toggle).toHaveText('Show less');
    });

    test('an expanded bundle stays expanded when the playground rebuilds', async ({ page }) => {
      await page.goto('/playground/');
      await page.getByRole('button', { name: 'Client Bundles' }).click();
      const toggle = page.locator('.output-modules .file-toggle-button').first();
      await toggle.click();
      await expect(toggle).toHaveText('Show less');

      const rebuilt = page.waitForEvent('console', (msg) => msg.text().includes('Client build:'));
      await page.getByRole('button', { name: 'Options' }).click();
      await page.getByLabel('Debug').click();
      await rebuilt;
      await page.getByRole('button', { name: 'Client Bundles' }).click();

      await expect(toggle).toHaveText('Show less');
    });
  });
});
