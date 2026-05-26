import { test, expect, type Page } from '@playwright/test';

const assertNoBrowserErrors = (page: Page) => {
  page.on('pageerror', (err) => expect(err).toEqual(undefined));
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      expect(msg.text()).toEqual(undefined);
    }
  });
};

const getOutOfOrderSuspenseUrl = (browserName: string, searchParams?: URLSearchParams): string => {
  const params = new URLSearchParams(searchParams);
  if (browserName === 'webkit') {
    params.set('webkitFlush', '1');
  }
  const search = params.toString();
  return search ? `/e2e/suspense-ooos?${search}` : '/e2e/suspense-ooos';
};

const releaseOutOfOrderSuspense = async (page: Page, selector: string) => {
  const releaseButton = page.locator(selector);
  await expect(releaseButton).toBeVisible();
  const releaseUrl = await releaseButton.getAttribute('data-release-url');
  expect(releaseUrl).not.toBeNull();
  const response = await page.request.post(new URL(releaseUrl!, page.url()).toString());
  expect(response.ok()).toBeTruthy();
};

test.describe('out-of-order suspense streaming', () => {
  test.beforeEach(async ({ page }) => {
    assertNoBrowserErrors(page);
  });

  test('streams fallback, swaps resolved content, and keeps both interactive', async ({
    page,
    browserName,
  }) => {
    await page.goto(getOutOfOrderSuspenseUrl(browserName), { waitUntil: 'commit' });

    await expect(page.locator('#ooos-title')).toHaveText('OOOS Suspense', { timeout: 10000 });
    await expect(page.locator('#ooos-fallback')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#ooos-footer')).toHaveText('Footer shell', { timeout: 10000 });
    await expect(page.locator('#ooos-resolved')).toHaveCount(0);

    await page.waitForFunction(() => !!(window as any)._qwikEv?.roots);
    await page.locator('#ooos-fallback-button').click();
    await expect(page.locator('#ooos-fallback-count')).toHaveText('1');

    await expect(page.locator('#ooos-resolved')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#ooos-fallback')).toBeHidden();

    await page.locator('#ooos-resolved-button').click();
    await expect(page.locator('#ooos-resolved-count')).toHaveText('1');
    await page.locator('#ooos-shell-button').click();
    await expect(page.locator('#ooos-shell-count')).toHaveText('1');
    await expect(page.locator('#ooos-footer')).toHaveText('Footer shell');

    await page.waitForLoadState('load');
  });

  test('renders with ssr when out-of-order streaming is disabled', async ({
    page,
    browserName,
  }) => {
    await page.goto(
      getOutOfOrderSuspenseUrl(
        browserName,
        new URLSearchParams({
          delay: '10',
          outOfOrder: 'false',
        })
      )
    );

    await expect(page.locator('#ooos-title')).toHaveText('OOOS Suspense', { timeout: 10000 });
    await expect(page.locator('#ooos-resolved')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#ooos-fallback')).toBeHidden();

    await page.waitForFunction(() => !!(window as any)._qwikEv?.roots);
    await page.locator('#ooos-resolved-button').click();
    await expect(page.locator('#ooos-resolved-count')).toHaveText('1');
    await page.locator('#ooos-shell-button').click();
    await expect(page.locator('#ooos-shell-count')).toHaveText('1');

    expect(await page.content()).not.toContain('qO(');
  });

  test('renders streamed suspense after a csr rerender', async ({ page, browserName }) => {
    await page.goto(getOutOfOrderSuspenseUrl(browserName), { waitUntil: 'commit' });

    await expect(page.locator('#ooos-title')).toHaveText('OOOS Suspense', { timeout: 10000 });
    await expect(page.locator('#ooos-fallback')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#ooos-resolved')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#ooos-fallback')).toBeHidden();

    await page.waitForFunction(() => !!(window as any)._qwikEv?.roots);
    await page.locator('#ooos-resolved-button').click();
    await expect(page.locator('#ooos-resolved-count')).toHaveText('1');

    await page.locator('#ooos-force-rerender').click();
    await expect(page.locator('#ooos-render-count')).toHaveText('1');
    await expect(page.locator('#ooos-resolved')).toBeVisible();
    await expect(page.locator('#ooos-fallback')).toBeHidden();
    await expect(page.locator('#ooos-resolved-count')).toHaveText('0');

    await page.locator('#ooos-resolved-button').click();
    await expect(page.locator('#ooos-resolved-count')).toHaveText('1');
    await page.waitForLoadState('load');
  });

  test('renders the suspense fixture with a pure csr mount', async ({ page, browserName }) => {
    const response = await page.goto(
      getOutOfOrderSuspenseUrl(browserName, new URLSearchParams({ csr: '1' }))
    );
    expect(response).not.toBeNull();
    const html = await response!.text();
    expect(html).toContain('/e2e/build/entry.dev.js');
    expect(html).not.toContain('ooos-title');

    await expect(page.locator('#ooos-title')).toHaveText('OOOS Suspense', { timeout: 10000 });
    await expect(page.locator('#ooos-resolved')).toBeVisible();
    await expect(page.locator('#ooos-fallback')).toBeHidden();

    await page.locator('#ooos-resolved-button').click();
    await expect(page.locator('#ooos-resolved-count')).toHaveText('1');
  });

  test('keeps the streamed shell interactive while suspense content is pending', async ({
    page,
    browserName,
  }, testInfo) => {
    const releaseId = `pending-shell-${testInfo.workerIndex}-${Date.now()}`;
    await page.goto(
      getOutOfOrderSuspenseUrl(browserName, new URLSearchParams({ release: releaseId })),
      { waitUntil: 'commit' }
    );

    await expect(page.locator('#ooos-title')).toHaveText('OOOS Suspense', { timeout: 10000 });
    await expect(page.locator('#ooos-fallback')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#ooos-shell-button')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#ooos-footer')).toHaveText('Footer shell', { timeout: 10000 });
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

    await releaseOutOfOrderSuspense(page, '#ooos-default-release');
    await expect(page.locator('#ooos-resolved')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#ooos-fallback')).toBeHidden();
    await page.waitForLoadState('load');
  });

  test('streams and resolves multiple suspense boundaries independently', async ({
    page,
    browserName,
  }, testInfo) => {
    const firstReleaseId = `multi-first-${testInfo.workerIndex}-${Date.now()}`;
    const secondReleaseId = `multi-second-${testInfo.workerIndex}-${Date.now()}`;
    const params = new URLSearchParams({
      scenario: 'multiple',
      multiFirst: firstReleaseId,
      multiSecond: secondReleaseId,
    });
    await page.goto(getOutOfOrderSuspenseUrl(browserName, params), {
      waitUntil: 'commit',
    });

    await expect(page.locator('#ooos-title')).toHaveText('OOOS Suspense', { timeout: 10000 });
    await expect(page.locator('#ooos-multi-first-fallback')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#ooos-multi-second-fallback')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#ooos-multi-first-resolved')).toHaveCount(0);
    await expect(page.locator('#ooos-multi-second-resolved')).toHaveCount(0);

    await page.waitForFunction(() => !!(window as any)._qwikEv?.roots);
    await page.locator('#ooos-multi-first-fallback-button').click();
    await page.locator('#ooos-multi-second-fallback-button').click();
    await expect(page.locator('#ooos-multi-first-fallback-count')).toHaveText('1');
    await expect(page.locator('#ooos-multi-second-fallback-count')).toHaveText('1');

    await releaseOutOfOrderSuspense(page, '#ooos-multi-second-release');
    await expect(page.locator('#ooos-multi-second-resolved')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#ooos-multi-second-fallback')).toBeHidden();
    await expect(page.locator('#ooos-multi-first-fallback')).toBeVisible();
    await expect(page.locator('#ooos-multi-first-resolved')).toHaveCount(0);

    await page.locator('#ooos-multi-second-resolved-button').click();
    await expect(page.locator('#ooos-multi-second-resolved-count')).toHaveText('1');

    await releaseOutOfOrderSuspense(page, '#ooos-multi-first-release');
    await expect(page.locator('#ooos-multi-first-resolved')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#ooos-multi-first-fallback')).toBeHidden();
    await page.locator('#ooos-multi-first-resolved-button').click();
    await expect(page.locator('#ooos-multi-first-resolved-count')).toHaveText('1');
    await page.waitForLoadState('load');

    await page.reload({ waitUntil: 'commit' });
    await expect(page.locator('#ooos-title')).toHaveText('OOOS Suspense', { timeout: 10000 });
    await expect(page.locator('#ooos-multi-first-fallback')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#ooos-multi-second-fallback')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#ooos-multi-first-resolved')).toHaveCount(0);
    await expect(page.locator('#ooos-multi-second-resolved')).toHaveCount(0);

    await releaseOutOfOrderSuspense(page, '#ooos-multi-first-release');
    await releaseOutOfOrderSuspense(page, '#ooos-multi-second-release');
    await expect(page.locator('#ooos-multi-first-resolved')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#ooos-multi-second-resolved')).toBeVisible({ timeout: 10000 });
  });

  test('shares root state between fallback and resolved suspense content', async ({
    page,
    browserName,
  }, testInfo) => {
    const releaseId = `cross-state-${testInfo.workerIndex}-${Date.now()}`;
    const params = new URLSearchParams({
      scenario: 'cross-state',
      cross: releaseId,
    });
    await page.goto(getOutOfOrderSuspenseUrl(browserName, params), {
      waitUntil: 'commit',
    });

    await expect(page.locator('#ooos-title')).toHaveText('OOOS Suspense', { timeout: 10000 });
    await expect(page.locator('#ooos-cross-fallback')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#ooos-cross-shell-count')).toHaveText('shared=0');
    await expect(page.locator('#ooos-cross-fallback-count')).toHaveText('shared=0');
    await expect(page.locator('#ooos-cross-resolved')).toHaveCount(0);

    await page.waitForFunction(() => !!(window as any)._qwikEv?.roots);
    await page.locator('#ooos-cross-fallback-button').click();
    await expect(page.locator('#ooos-cross-shell-count')).toHaveText('shared=1');
    await expect(page.locator('#ooos-cross-fallback-count')).toHaveText('shared=1');

    await releaseOutOfOrderSuspense(page, '#ooos-cross-release');
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
    await page.waitForLoadState('load');
  });

  test('reveals delayed fallback when delay resolves before content', async ({
    page,
    browserName,
  }, testInfo) => {
    const releaseId = `delay-before-content-${testInfo.workerIndex}-${Date.now()}`;
    const params = new URLSearchParams({
      scenario: 'delay',
      delayRelease: releaseId,
      fallbackDelay: '1000',
    });
    await page.goto(getOutOfOrderSuspenseUrl(browserName, params), {
      waitUntil: 'commit',
    });

    await expect(page.locator('#ooos-title')).toHaveText('OOOS Suspense', { timeout: 10000 });
    await expect(page.locator('#ooos-delay-fallback')).toHaveCount(1);
    await expect(page.locator('#ooos-delay-fallback')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#ooos-delay-resolved')).toHaveCount(0);

    await page.waitForFunction(() => !!(window as any)._qwikEv?.roots);
    await page.locator('#ooos-delay-fallback-button').click();
    await expect(page.locator('#ooos-delay-fallback-count')).toHaveText('1');

    await releaseOutOfOrderSuspense(page, '#ooos-delay-release');
    await expect(page.locator('#ooos-delay-resolved')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#ooos-delay-fallback')).toBeHidden();
    await page.waitForLoadState('load');
  });

  test('does not reveal delayed fallback when content resolves before delay', async ({
    page,
    browserName,
  }) => {
    await page.addInitScript(() => {
      (window as any).__ooosDelayFallbackWasVisible = false;
      const checkFallbackVisibility = () => {
        const fallback = document.querySelector('#ooos-delay-fallback');
        if (fallback && fallback.getClientRects().length > 0) {
          (window as any).__ooosDelayFallbackWasVisible = true;
        }
      };
      const observe = () => {
        checkFallbackVisibility();
        new MutationObserver(checkFallbackVisibility).observe(document.documentElement, {
          attributes: true,
          childList: true,
          subtree: true,
        });
        setInterval(checkFallbackVisibility, 50);
      };
      if (document.documentElement) {
        observe();
      } else {
        document.addEventListener('DOMContentLoaded', observe, { once: true });
      }
    });
    const params = new URLSearchParams({
      scenario: 'delay',
      fallbackDelay: '2000',
    });
    await page.goto(getOutOfOrderSuspenseUrl(browserName, params), {
      waitUntil: 'commit',
    });

    await expect(page.locator('#ooos-title')).toHaveText('OOOS Suspense', { timeout: 10000 });
    await expect(page.locator('#ooos-delay-fallback')).toHaveCount(1);
    await expect(page.locator('#ooos-delay-resolved')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#ooos-delay-fallback')).toBeHidden();

    await page.waitForTimeout(2200);
    await expect(page.locator('#ooos-delay-resolved')).toBeVisible();
    await expect(page.locator('#ooos-delay-fallback')).toBeHidden();
    expect(await page.evaluate(() => (window as any).__ooosDelayFallbackWasVisible)).toBe(false);
    await page.waitForLoadState('load');
  });

  test('coordinates out-of-order suspense boundaries inside collapsed reveal', async ({
    page,
    browserName,
  }, testInfo) => {
    const firstReleaseId = `reveal-first-${testInfo.workerIndex}-${Date.now()}`;
    const secondReleaseId = `reveal-second-${testInfo.workerIndex}-${Date.now()}`;
    const params = new URLSearchParams({
      scenario: 'reveal',
      revealFirst: firstReleaseId,
      revealSecond: secondReleaseId,
    });
    await page.goto(getOutOfOrderSuspenseUrl(browserName, params), {
      waitUntil: 'commit',
    });

    await expect(page.locator('#ooos-title')).toHaveText('OOOS Suspense', { timeout: 10000 });
    await expect(page.locator('#ooos-reveal-first-fallback')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#ooos-reveal-second-fallback')).toBeHidden({ timeout: 10000 });
    await expect(page.locator('#ooos-reveal-first-resolved')).toHaveCount(0);
    await expect(page.locator('#ooos-reveal-second-resolved')).toHaveCount(0);

    await releaseOutOfOrderSuspense(page, '#ooos-reveal-second-release');
    await page.waitForTimeout(300);
    await expect(page.locator('#ooos-reveal-first-fallback')).toBeVisible();
    await expect(page.locator('#ooos-reveal-second-fallback')).toBeHidden();
    await expect(page.locator('#ooos-reveal-first-resolved')).toHaveCount(0);
    await expect(page.locator('#ooos-reveal-second-resolved')).toBeHidden();

    await releaseOutOfOrderSuspense(page, '#ooos-reveal-first-release');
    await expect(page.locator('#ooos-reveal-first-resolved')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#ooos-reveal-second-resolved')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#ooos-reveal-first-fallback')).toBeHidden();
    await expect(page.locator('#ooos-reveal-second-fallback')).toBeHidden();

    await page.locator('#ooos-reveal-first-resolved-button').click();
    await page.locator('#ooos-reveal-second-resolved-button').click();
    await expect(page.locator('#ooos-reveal-first-resolved-count')).toHaveText('1');
    await expect(page.locator('#ooos-reveal-second-resolved-count')).toHaveText('1');
    await page.waitForLoadState('load');
  });

  test('keeps vnode structure stable when resolved suspense content is keyed rerendered', async ({
    page,
    browserName,
  }, testInfo) => {
    const releaseId = `rerender-${testInfo.workerIndex}-${Date.now()}`;
    const params = new URLSearchParams({
      scenario: 'rerender',
      rerender: releaseId,
    });
    await page.goto(getOutOfOrderSuspenseUrl(browserName, params), {
      waitUntil: 'commit',
    });

    await expect(page.locator('#ooos-title')).toHaveText('OOOS Suspense', { timeout: 10000 });
    await expect(page.locator('#ooos-rerender-fallback')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#ooos-rerender-resolved')).toHaveCount(0);
    await expect(page.locator('#ooos-rerender-keyed')).toHaveAttribute('data-value', '0');

    await releaseOutOfOrderSuspense(page, '#ooos-rerender-release');
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
    await page.waitForLoadState('load');
  });

  test('keeps out-of-order swaps scoped to streamed containers', async ({
    page,
    browserName,
  }, testInfo) => {
    const firstReleaseId = `container-first-${testInfo.workerIndex}-${Date.now()}`;
    const secondReleaseId = `container-second-${testInfo.workerIndex}-${Date.now()}`;
    const params = new URLSearchParams({
      scenario: 'containers',
      first: firstReleaseId,
      second: secondReleaseId,
    });
    await page.goto(getOutOfOrderSuspenseUrl(browserName, params), {
      waitUntil: 'commit',
    });

    await expect(page.locator('#ooos-container-first-fallback')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#ooos-container-first-resolved')).toHaveCount(0);

    await releaseOutOfOrderSuspense(page, '#ooos-container-first-release');
    await expect(page.locator('#ooos-container-first-resolved')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#ooos-container-first-fallback')).toBeHidden();

    await expect(page.locator('#ooos-container-second-fallback')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#ooos-container-second-resolved')).toHaveCount(0);

    await releaseOutOfOrderSuspense(page, '#ooos-container-second-release');
    await expect(page.locator('#ooos-container-second-resolved')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#ooos-container-second-fallback')).toBeHidden();
    await expect(page.locator('#ooos-container-first-resolved')).toBeVisible();

    await page.locator('#ooos-container-first-resolved-button').click();
    await page.locator('#ooos-container-second-resolved-button').click();
    await expect(page.locator('#ooos-container-first-resolved-count')).toHaveText('1');
    await expect(page.locator('#ooos-container-second-resolved-count')).toHaveText('1');
    await page.waitForLoadState('load');
  });
});
