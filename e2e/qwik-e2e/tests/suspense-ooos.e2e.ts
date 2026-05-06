import { test, expect } from '@playwright/test';

test.describe('out-of-order suspense streaming', () => {
  test.beforeEach(async ({ page }) => {
    page.on('pageerror', (err) => expect(err).toEqual(undefined));
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        expect(msg.text()).toEqual(undefined);
      }
    });
  });

  test('streams fallback, swaps resolved content, and keeps both interactive', async ({ page }) => {
    const navigation = page.goto('/e2e/suspense-ooos', { waitUntil: 'commit' });

    await expect(page.locator('#ooos-title')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#ooos-fallback')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#ooos-footer')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#ooos-resolved')).toHaveCount(0);

    await page.waitForFunction(() => !!(window as any)._qwikEv?.roots);
    await page.locator('#ooos-fallback-button').click();
    await expect(page.locator('#ooos-fallback-count')).toHaveText('1');

    await expect(page.locator('#ooos-resolved')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#ooos-fallback')).toBeHidden();

    await page.locator('#ooos-resolved-button').click();
    await expect(page.locator('#ooos-resolved-count')).toHaveText('1');

    await navigation;
  });

  test('keeps the streamed shell interactive while suspense content is pending', async ({
    page,
  }, testInfo) => {
    const releaseId = `pending-shell-${testInfo.workerIndex}-${Date.now()}`;
    const navigation = page.goto(`/e2e/suspense-ooos?release=${releaseId}`, {
      waitUntil: 'commit',
    });

    await expect(page.locator('#ooos-title')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#ooos-fallback')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#ooos-shell-button')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#ooos-footer')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#ooos-resolved')).toHaveCount(0);

    await page.waitForFunction(() => !!(window as any)._qwikEv?.roots);
    await expect(page.locator('#ooos-resolved')).toHaveCount(0);
    await page.locator('#ooos-fallback-button').click();
    await expect(page.locator('#ooos-fallback-count')).toHaveText('1');
    await page.locator('#ooos-shell-button').click();
    await expect(page.locator('#ooos-shell-count')).toHaveText('1');
    await expect(page.locator('#ooos-fallback-count')).toHaveText('1');
    await expect(page.locator('#ooos-fallback')).toBeVisible();
    await expect(page.locator('#ooos-resolved')).toHaveCount(0);

    await page.locator('#ooos-default-release').click();
    await expect(page.locator('#ooos-resolved')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#ooos-fallback')).toBeHidden();
    await navigation;
  });

  test('streams and resolves multiple suspense boundaries independently', async ({
    page,
  }, testInfo) => {
    const firstReleaseId = `multi-first-${testInfo.workerIndex}-${Date.now()}`;
    const secondReleaseId = `multi-second-${testInfo.workerIndex}-${Date.now()}`;
    const params = new URLSearchParams({
      scenario: 'multiple',
      multiFirst: firstReleaseId,
      multiSecond: secondReleaseId,
    });
    const navigation = page.goto(`/e2e/suspense-ooos?${params}`, { waitUntil: 'commit' });

    await expect(page.locator('#ooos-title')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#ooos-multi-first-fallback')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#ooos-multi-second-fallback')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#ooos-multi-first-resolved')).toHaveCount(0);
    await expect(page.locator('#ooos-multi-second-resolved')).toHaveCount(0);

    await page.waitForFunction(() => !!(window as any)._qwikEv?.roots);
    await page.locator('#ooos-multi-first-fallback-button').click();
    await page.locator('#ooos-multi-second-fallback-button').click();
    await expect(page.locator('#ooos-multi-first-fallback-count')).toHaveText('1');
    await expect(page.locator('#ooos-multi-second-fallback-count')).toHaveText('1');

    await page.locator('#ooos-multi-second-release').click();
    await expect(page.locator('#ooos-multi-second-resolved')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#ooos-multi-second-fallback')).toBeHidden();
    await expect(page.locator('#ooos-multi-first-fallback')).toBeVisible();
    await expect(page.locator('#ooos-multi-first-resolved')).toHaveCount(0);

    await page.locator('#ooos-multi-second-resolved-button').click();
    await expect(page.locator('#ooos-multi-second-resolved-count')).toHaveText('1');

    await page.locator('#ooos-multi-first-release').click();
    await expect(page.locator('#ooos-multi-first-resolved')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#ooos-multi-first-fallback')).toBeHidden();
    await page.locator('#ooos-multi-first-resolved-button').click();
    await expect(page.locator('#ooos-multi-first-resolved-count')).toHaveText('1');
    await navigation;

    await page.reload({ waitUntil: 'commit' });
    await expect(page.locator('#ooos-title')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#ooos-multi-first-fallback')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#ooos-multi-second-fallback')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#ooos-multi-first-resolved')).toHaveCount(0);
    await expect(page.locator('#ooos-multi-second-resolved')).toHaveCount(0);

    await page.locator('#ooos-multi-first-release').click();
    await page.locator('#ooos-multi-second-release').click();
    await expect(page.locator('#ooos-multi-first-resolved')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#ooos-multi-second-resolved')).toBeVisible({ timeout: 10000 });
  });

  test('shares root state between fallback and resolved suspense content', async ({
    page,
  }, testInfo) => {
    const releaseId = `cross-state-${testInfo.workerIndex}-${Date.now()}`;
    const params = new URLSearchParams({
      scenario: 'cross-state',
      cross: releaseId,
    });
    const navigation = page.goto(`/e2e/suspense-ooos?${params}`, { waitUntil: 'commit' });

    await expect(page.locator('#ooos-title')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#ooos-cross-fallback')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#ooos-cross-shell-count')).toHaveText('shared=0');
    await expect(page.locator('#ooos-cross-fallback-count')).toHaveText('shared=0');
    await expect(page.locator('#ooos-cross-resolved')).toHaveCount(0);

    await page.waitForFunction(() => !!(window as any)._qwikEv?.roots);
    await page.locator('#ooos-cross-fallback-button').click();
    await expect(page.locator('#ooos-cross-shell-count')).toHaveText('shared=1');
    await expect(page.locator('#ooos-cross-fallback-count')).toHaveText('shared=1');

    await page.locator('#ooos-cross-release').click();
    await expect(page.locator('#ooos-cross-resolved')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#ooos-cross-fallback')).toBeHidden();
    await expect(page.locator('#ooos-cross-resolved-count')).toHaveText('shared=1');

    // The resolved HTML was rendered on the server before the fallback click. Processing the
    // segment metadata should merge and schedule the content subscription so it catches up before
    // the next user interaction.
    await page.locator('#ooos-cross-resolved-button').click();
    await expect(page.locator('#ooos-cross-shell-count')).toHaveText('shared=2');
    await expect(page.locator('#ooos-cross-resolved-count')).toHaveText('shared=2');
    await page.locator('#ooos-cross-shell-button').click();
    await expect(page.locator('#ooos-cross-shell-count')).toHaveText('shared=3');
    await expect(page.locator('#ooos-cross-resolved-count')).toHaveText('shared=3');
    await navigation;
  });

  test('coordinates out-of-order suspense boundaries inside collapsed reveal', async ({
    page,
  }, testInfo) => {
    const firstReleaseId = `reveal-first-${testInfo.workerIndex}-${Date.now()}`;
    const secondReleaseId = `reveal-second-${testInfo.workerIndex}-${Date.now()}`;
    const params = new URLSearchParams({
      scenario: 'reveal',
      revealFirst: firstReleaseId,
      revealSecond: secondReleaseId,
    });
    const navigation = page.goto(`/e2e/suspense-ooos?${params}`, { waitUntil: 'commit' });

    await expect(page.locator('#ooos-title')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#ooos-reveal-first-fallback')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#ooos-reveal-second-fallback')).toBeHidden({ timeout: 10000 });
    await expect(page.locator('#ooos-reveal-first-resolved')).toHaveCount(0);
    await expect(page.locator('#ooos-reveal-second-resolved')).toHaveCount(0);

    await page.locator('#ooos-reveal-second-release').click();
    await page.waitForTimeout(300);
    await expect(page.locator('#ooos-reveal-first-fallback')).toBeVisible();
    await expect(page.locator('#ooos-reveal-second-fallback')).toBeHidden();
    await expect(page.locator('#ooos-reveal-first-resolved')).toHaveCount(0);
    await expect(page.locator('#ooos-reveal-second-resolved')).toHaveCount(0);

    await page.locator('#ooos-reveal-first-release').click();
    await expect(page.locator('#ooos-reveal-first-resolved')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#ooos-reveal-second-resolved')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#ooos-reveal-first-fallback')).toBeHidden();
    await expect(page.locator('#ooos-reveal-second-fallback')).toBeHidden();

    await page.locator('#ooos-reveal-first-resolved-button').click();
    await page.locator('#ooos-reveal-second-resolved-button').click();
    await expect(page.locator('#ooos-reveal-first-resolved-count')).toHaveText('1');
    await expect(page.locator('#ooos-reveal-second-resolved-count')).toHaveText('1');
    await navigation;
  });

  test('keeps vnode structure stable when resolved suspense content is keyed rerendered', async ({
    page,
  }, testInfo) => {
    const releaseId = `rerender-${testInfo.workerIndex}-${Date.now()}`;
    const params = new URLSearchParams({
      scenario: 'rerender',
      rerender: releaseId,
    });
    const navigation = page.goto(`/e2e/suspense-ooos?${params}`, { waitUntil: 'commit' });

    await expect(page.locator('#ooos-title')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#ooos-rerender-fallback')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#ooos-rerender-resolved')).toHaveCount(0);
    await expect(page.locator('#ooos-rerender-keyed')).toHaveAttribute('data-value', '0');

    await page.locator('#ooos-rerender-release').click();
    await expect(page.locator('#ooos-rerender-resolved')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#ooos-rerender-fallback')).toBeHidden();
    await expect(page.locator('#ooos-rerender-resolved-label')).toHaveText('Resolved rerender 0');

    await page.locator('#ooos-rerender-resolved-button').click();
    await expect(page.locator('#ooos-rerender-resolved-count')).toHaveText('1');

    await page.locator('#ooos-rerender-button').click();
    await expect(page.locator('#ooos-rerender-count')).toHaveText('1');
    await expect(page.locator('#ooos-rerender-keyed')).toHaveAttribute('data-value', '1');
    await expect(page.locator('#ooos-rerender-resolved')).toBeVisible();
    await expect(page.locator('#ooos-rerender-resolved-label')).toHaveText('Resolved rerender 1');
    await expect(page.locator('#ooos-rerender-resolved-count')).toHaveText('0');

    await page.locator('#ooos-rerender-resolved-button').click();
    await expect(page.locator('#ooos-rerender-resolved-count')).toHaveText('1');
    await navigation;
  });

  test('keeps out-of-order swaps scoped to streamed containers', async ({ page }, testInfo) => {
    const firstReleaseId = `container-first-${testInfo.workerIndex}-${Date.now()}`;
    const secondReleaseId = `container-second-${testInfo.workerIndex}-${Date.now()}`;
    const params = new URLSearchParams({
      scenario: 'containers',
      first: firstReleaseId,
      second: secondReleaseId,
    });
    const navigation = page.goto(`/e2e/suspense-ooos?${params}`, { waitUntil: 'commit' });

    await expect(page.locator('#ooos-container-first-fallback')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#ooos-container-first-resolved')).toHaveCount(0);

    await page.locator('#ooos-container-first-release').click();
    await expect(page.locator('#ooos-container-first-resolved')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#ooos-container-first-fallback')).toBeHidden();

    await expect(page.locator('#ooos-container-second-fallback')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#ooos-container-second-resolved')).toHaveCount(0);

    await page.locator('#ooos-container-second-release').click();
    await expect(page.locator('#ooos-container-second-resolved')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#ooos-container-second-fallback')).toBeHidden();
    await expect(page.locator('#ooos-container-first-resolved')).toBeVisible();

    await page.locator('#ooos-container-first-resolved-button').click();
    await page.locator('#ooos-container-second-resolved-button').click();
    await expect(page.locator('#ooos-container-first-resolved-count')).toHaveText('1');
    await expect(page.locator('#ooos-container-second-resolved-count')).toHaveText('1');
    await navigation;
  });
});
