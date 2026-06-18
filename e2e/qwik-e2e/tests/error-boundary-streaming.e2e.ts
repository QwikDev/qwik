import { test, expect, type Page } from '@playwright/test';

const assertNoBrowserErrors = (page: Page) => {
  page.on('pageerror', (err) => expect(err).toEqual(undefined));
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      expect(msg.text()).toEqual(undefined);
    }
  });
};

const releaseDeferred = async (page: Page, selector: string) => {
  const releaseButton = page.locator(selector);
  await expect(releaseButton).toBeVisible();
  const releaseUrl = await releaseButton.getAttribute('data-release-url');
  expect(releaseUrl).not.toBeNull();
  const response = await page.request.post(new URL(releaseUrl!, page.url()).toString());
  expect(response.ok()).toBeTruthy();
};

test.describe('ErrorBoundary streaming swap', () => {
  test('sync throw: streams the shell, swaps to the fallback, keeps it interactive', async ({
    page,
  }) => {
    assertNoBrowserErrors(page);
    await page.goto('/e2e/error-boundary-streaming', { waitUntil: 'commit' });

    // The boundary never blocks streaming: the title and the footer AFTER the boundary both render.
    await expect(page.locator('#eb-title')).toHaveText('EB Streaming', { timeout: 10000 });
    await expect(page.locator('#eb-footer')).toHaveText('Footer shell', { timeout: 10000 });

    // The descendant threw during SSR, so the inline swap hides the content and reveals the fallback.
    await expect(page.locator('#eb-fallback')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#eb-fallback-msg')).toHaveText('caught: eb sync boom');
    await expect(page.locator('#eb-content')).toBeHidden();

    // The swapped-in fallback is interactive once the framework resumes.
    await page.locator('#eb-fallback-button').click();
    await expect(page.locator('#eb-fallback-count')).toHaveText('1');
  });

  test('async deferred throw: streams siblings + skeleton, then tears down the whole boundary', async ({
    page,
  }) => {
    assertNoBrowserErrors(page);
    await page.goto('/e2e/error-boundary-streaming?scenario=async&release=eb', {
      waitUntil: 'commit',
    });

    // Everything streams immediately — the boundary does not wait on the deferred child.
    await expect(page.locator('#eb-title')).toHaveText('EB Streaming', { timeout: 10000 });
    await expect(page.locator('#eb-sibling')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#eb-skel')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#eb-footer')).toHaveText('Footer shell', { timeout: 10000 });
    await expect(page.locator('#eb-fallback')).toHaveCount(0);

    // Release the deferred child so it rejects.
    await releaseDeferred(page, '#eb-release');

    // The whole boundary — the streamed sibling and the Suspense — is torn down to the fallback.
    await expect(page.locator('#eb-fallback')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#eb-fallback-msg')).toHaveText('caught: eb async boom');
    await expect(page.locator('#eb-sibling')).toBeHidden();

    await page.locator('#eb-fallback-button').click();
    await expect(page.locator('#eb-fallback-count')).toHaveText('1');
  });
});
