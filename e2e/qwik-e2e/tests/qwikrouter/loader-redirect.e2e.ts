import { expect, test, type Page } from '@playwright/test';

const base = '/qwikrouter-test/loader-redirect/';

async function holdRedirect(page: Page) {
  let releaseRedirect!: () => void;
  let releaseData!: () => void;
  const redirectGate = new Promise<void>((resolve) => (releaseRedirect = resolve));
  const dataGate = new Promise<void>((resolve) => (releaseData = resolve));
  await page.route('**/q-loader-*', async (route) => {
    const response = await route.fetch();
    await (new URL(route.request().url()).searchParams.has('sort') ? dataGate : redirectGate);
    await route.fulfill({ response });
  });
  return { releaseRedirect, releaseData };
}

// The layout and page loader requests both run the redirecting loader, which consumes the cookie.
async function sendLoaderRequestsTogether(page: Page) {
  let pending = 2;
  let sendAll!: () => void;
  const bothRequested = new Promise<void>((resolve) => (sendAll = resolve));
  await page.route('**/q-loader-*', async (route) => {
    if (--pending === 0) {
      sendAll();
    }
    await bothRequested;
    await route.continue();
  });
}

test.describe('route loader redirects', () => {
  const errors = new WeakMap<Page, string[]>();
  test.beforeEach(async ({ page }) => {
    errors.set(page, []);
    page.on('pageerror', (error) => errors.get(page)!.push(error.stack || error.message));
  });
  test.afterEach(async ({ page }) => {
    expect(errors.get(page)).toEqual([]);
  });

  test('keeps the first read pending until redirected data arrives', async ({ page }) => {
    await page.goto(base);
    await page.waitForFunction(() => (window as any)._qwikEv?.roots);
    const held = await holdRedirect(page);
    try {
      await page.locator('#loader-redirect-list-link').click();
      await expect(page.locator('#loader-redirect-list')).toBeVisible();
      held.releaseRedirect();
      await expect(page).toHaveURL(/list\/\?sort=new$/);
      await expect(page.locator('#loader-redirect-pending')).toHaveText('pending');
      await expect(page.locator('#loader-redirect-value')).toHaveCount(0);
      held.releaseData();
      await expect(page.locator('#loader-redirect-value')).toHaveText('3 items, sorted by new');
      await expect(page.locator('#loader-redirect-pending')).toHaveText('ready');
    } finally {
      held.releaseRedirect();
      held.releaseData();
    }
  });

  test('reports a blocked redirect without a previous value', async ({ page }) => {
    await page.goto(base);
    await page.waitForFunction(() => (window as any)._qwikEv?.roots);
    const held = await holdRedirect(page);
    try {
      await page.locator('#loader-redirect-list-link').click();
      await expect(page.locator('#loader-redirect-list')).toBeVisible();
      await page.locator('#loader-redirect-block').click();
      await expect(page.locator('#loader-redirect-block')).toHaveText('blocked');
      held.releaseRedirect();
      // Both layout and page loaders request the redirect.
      await expect(page.locator('#loader-redirect-blocked-attempts')).toHaveText('2');
      await expect(page.locator('#loader-redirect-pending')).toHaveText('ready');
      await expect(page.locator('#loader-redirect-error')).toHaveText(
        'Route loader redirect completed without data.'
      );
      await expect(page.locator('#loader-redirect-value')).toHaveCount(0);
      expect(new URL(page.url()).searchParams.has('sort')).toBe(false);
    } finally {
      held.releaseRedirect();
      held.releaseData();
    }
  });

  for (const mode of ['hash', 'same']) {
    test(`reports a ${mode} redirect without a previous value`, async ({ page, context }) => {
      await page.goto(base);
      await page.waitForFunction(() => (window as any)._qwikEv?.roots);
      await context.addCookies([
        { name: 'loader-redirect-mode', value: mode, url: new URL('/', page.url()).href },
      ]);
      await sendLoaderRequestsTogether(page);
      await page.locator('#loader-redirect-list-link').click();
      await expect(page.locator('#loader-redirect-error')).toHaveText(
        'Route loader redirect completed without data.'
      );
      await expect(page.locator('#loader-redirect-pending')).toHaveText('ready');
      await expect(page.locator('#loader-redirect-value')).toHaveCount(0);
    });
  }

  for (const previous of [
    { name: 'object', search: '?sort=old', text: '3 items, sorted by old', read: 'old' },
    {
      name: 'undefined',
      search: '?sort=undefined&kind=undefined',
      text: 'undefined',
      read: 'undefined',
    },
  ]) {
    test(`keeps a previous ${previous.name} readable during a redirect`, async ({ page }) => {
      await page.goto(`${base}list/${previous.search}`);
      await expect(page.locator('#loader-redirect-value')).toHaveText(previous.text);
      await page.waitForFunction(() => (window as any)._qwikEv?.roots);
      const held = await holdRedirect(page);
      try {
        await page.locator('#loader-redirect-again').click();
        await expect(page.locator('#loader-redirect-pending')).toHaveText('pending');
        held.releaseRedirect();
        await expect(page).toHaveURL(/list\/\?sort=new/);
        await expect(page.locator('#loader-redirect-pending')).toHaveText('pending');
        await expect(page.locator('#loader-redirect-value')).toHaveText(previous.text);
        await page.locator('#loader-redirect-read').click();
        await expect(page.locator('#loader-redirect-read-value')).toHaveText(previous.read);
        held.releaseData();
        await expect(page.locator('#loader-redirect-value')).toHaveText('3 items, sorted by new');
        await expect(page.locator('#loader-redirect-pending')).toHaveText('ready');
      } finally {
        held.releaseRedirect();
        held.releaseData();
      }
    });

    test(`settles a blocked redirect with a previous ${previous.name}`, async ({ page }) => {
      await page.goto(base);
      await page.waitForFunction(() => (window as any)._qwikEv?.roots);
      await page.locator(`#loader-redirect-${previous.name}-link`).click();
      await expect(page.locator('#loader-redirect-value')).toHaveText(previous.text);
      await expect(page.locator('#loader-redirect-pending')).toHaveText('ready');
      await page.locator('#loader-redirect-block').click();
      await expect(page.locator('#loader-redirect-block')).toHaveText('blocked');
      const held = await holdRedirect(page);
      try {
        await page.locator('#loader-redirect-again').click();
        await expect(page.locator('#loader-redirect-pending')).toHaveText('pending');
        held.releaseRedirect();
        await expect(page.locator('#loader-redirect-blocked-attempts')).toHaveText('2');
        await page.locator('#loader-redirect-settle').click();
        await expect(page.locator('#loader-redirect-completed')).toHaveText('1');
        await expect(page.locator('#loader-redirect-pending')).toHaveText('ready');
        await expect(page.locator('#loader-redirect-value')).toHaveText(previous.text);
        await page.locator('#loader-redirect-read').click();
        await expect(page.locator('#loader-redirect-read-value')).toHaveText(previous.read);
        expect(new URL(page.url()).searchParams.has('sort')).toBe(false);
      } finally {
        held.releaseRedirect();
        held.releaseData();
      }
    });

    test(`settles a hash redirect with a previous ${previous.name}`, async ({ page, context }) => {
      await page.goto(base);
      await page.waitForFunction(() => (window as any)._qwikEv?.roots);
      await page.locator(`#loader-redirect-${previous.name}-link`).click();
      await expect(page.locator('#loader-redirect-value')).toHaveText(previous.text);
      await context.addCookies([
        { name: 'loader-redirect-mode', value: 'hash', url: new URL('/', page.url()).href },
      ]);
      await page.locator('#loader-redirect-refresh').click();
      await expect(page).toHaveURL(/#items$/);
      await page.locator('#loader-redirect-settle').click();
      await expect(page.locator('#loader-redirect-completed')).toHaveText('1');
      await expect(page.locator('#loader-redirect-pending')).toHaveText('ready');
      await expect(page.locator('#loader-redirect-value')).toHaveText(previous.text);
      await page.locator('#loader-redirect-read').click();
      await expect(page.locator('#loader-redirect-read-value')).toHaveText(previous.read);
    });

    test(`settles a superseded redirect with a previous ${previous.name} when both attempts are blocked`, async ({
      page,
    }) => {
      await page.goto(base);
      await page.waitForFunction(() => (window as any)._qwikEv?.roots);
      await page.locator(`#loader-redirect-${previous.name}-link`).click();
      await expect(page.locator('#loader-redirect-value')).toHaveText(previous.text);
      await page.locator('#loader-redirect-block').click();
      await expect(page.locator('#loader-redirect-block')).toHaveText('blocked');
      await page.locator('#loader-redirect-defer').click();
      await expect(page.locator('#loader-redirect-defer')).toHaveText('deferred');
      const held = await holdRedirect(page);
      try {
        await page.locator('#loader-redirect-again').click();
        await expect(page.locator('#loader-redirect-pending')).toHaveText('pending');
        held.releaseRedirect();
        await expect(page.locator('#loader-redirect-release-guard')).toBeEnabled();
        await page.locator('#loader-redirect-home-link').click();
        await expect(page.locator('#loader-redirect-blocked-attempts')).toHaveText('1');
        await page.locator('#loader-redirect-settle').click();
        await expect(page.locator('#loader-redirect-completed')).toHaveText('1');
        await expect(page.locator('#loader-redirect-pending')).toHaveText('ready');
        await expect(page.locator('#loader-redirect-value')).toHaveText(previous.text);
        await expect(page.locator('#loader-redirect-release-guard')).toBeEnabled();
        await page.locator('#loader-redirect-release-guard').click();
        await expect(page.locator('#loader-redirect-release-guard')).toBeDisabled();
      } finally {
        held.releaseRedirect();
        held.releaseData();
      }
    });

    test(`settles a redirect that reuses a loader with a previous ${previous.name}`, async ({
      page,
      context,
    }) => {
      await page.goto(base);
      await page.waitForFunction(() => (window as any)._qwikEv?.roots);
      await page.locator(`#loader-redirect-${previous.name}-link`).click();
      await expect(page.locator('#loader-redirect-value')).toHaveText(previous.text);
      await expect(page.locator('#loader-redirect-pending')).toHaveText('ready');
      await expect(page.locator('#loader-redirect-navigation')).toHaveText('idle');
      const requests: string[] = [];
      page.on('request', (request) => {
        if (request.url().includes('/q-loader-redirect-list.')) {
          requests.push(request.url());
        }
      });
      await context.addCookies([
        { name: 'loader-redirect-mode', value: 'search', url: new URL('/', page.url()).href },
      ]);
      await page.locator('#loader-redirect-refresh').click();
      await expect(page).toHaveURL(/noise=one$/);
      await page.locator('#loader-redirect-settle').click();
      await expect(page.locator('#loader-redirect-completed')).toHaveText('1');
      await expect(page.locator('#loader-redirect-pending')).toHaveText('ready');
      await expect(page.locator('#loader-redirect-value')).toHaveText(previous.text);
      await page.locator('#loader-redirect-read').click();
      await expect(page.locator('#loader-redirect-read-value')).toHaveText(previous.read);
      await expect(page.locator('#loader-redirect-navigation')).toHaveText('idle');
      expect(requests).toHaveLength(1);
    });

    test(`finishes an accepted redirect with a previous ${previous.name} while a newer guard waits for its loader`, async ({
      page,
      context,
    }) => {
      await page.goto(base);
      await page.waitForFunction(() => (window as any)._qwikEv?.roots);
      await page.locator(`#loader-redirect-${previous.name}-link`).click();
      await expect(page.locator('#loader-redirect-navigation')).toHaveText('idle');
      await page.locator('#loader-redirect-wait-before-leave').click();
      await context.addCookies([
        { name: 'loader-redirect-mode', value: 'search', url: new URL('/', page.url()).href },
      ]);
      await page.locator('#loader-redirect-refresh').click();
      await expect(page.locator('#loader-redirect-blocked-attempts')).toHaveText('1');
      await page.locator('#loader-redirect-settle').click();
      await expect(page.locator('#loader-redirect-completed')).toHaveText('1');
      await expect(page.locator('#loader-redirect-navigation')).toHaveText('idle');
      await expect(page.locator('#loader-redirect-pending')).toHaveText('ready');
      await expect(page.locator('#loader-redirect-value')).toHaveText(previous.text);
      await expect(page).toHaveURL(/noise=one$/);
    });
  }

  test('keeps a deferred redirect pending when the current navigation is repeated', async ({
    page,
  }) => {
    await page.goto(base);
    await page.waitForFunction(() => (window as any)._qwikEv?.roots);
    const held = await holdRedirect(page);
    try {
      await page.locator('#loader-redirect-list-link').click();
      await expect(page.locator('#loader-redirect-list')).toBeVisible();
      await page.locator('#loader-redirect-defer').click();
      await expect(page.locator('#loader-redirect-defer')).toHaveText('deferred');
      held.releaseRedirect();
      await expect(page.locator('#loader-redirect-release-guard')).toBeEnabled();
      await page.locator('#loader-redirect-repeat').click();
      await expect(page.locator('#loader-redirect-repeated')).toHaveText('1');
      await expect(page.locator('#loader-redirect-pending')).toHaveText('pending');
      await expect(page.locator('#loader-redirect-error')).toHaveCount(0);
      await page.locator('#loader-redirect-release-guard').click();
      await expect(page.locator('#loader-redirect-error')).toHaveText(
        'Route loader redirect completed without data.'
      );
      await expect(page.locator('#loader-redirect-pending')).toHaveText('ready');
    } finally {
      held.releaseRedirect();
      held.releaseData();
    }
  });

  test('reports a rejected navigation preparation as a loader error', async ({ page }) => {
    await page.goto(base);
    await page.waitForFunction(() => (window as any)._qwikEv?.roots);
    const held = await holdRedirect(page);
    try {
      await page.locator('#loader-redirect-list-link').click();
      await expect(page.locator('#loader-redirect-list')).toBeVisible();
      await page.locator('#loader-redirect-defer').click();
      await expect(page.locator('#loader-redirect-defer')).toHaveText('deferred');
      held.releaseRedirect();
      await expect(page.locator('#loader-redirect-fail-guard')).toBeEnabled();
      await page.locator('#loader-redirect-fail-guard').click();
      await expect(page.locator('#loader-redirect-error')).toHaveText('Navigation guard failed.');
      await expect(page.locator('#loader-redirect-pending')).toHaveText('ready');
    } finally {
      held.releaseRedirect();
      held.releaseData();
    }
  });

  test('waits for an allowed replacement after a deferred redirect is superseded', async ({
    page,
  }) => {
    await page.goto(base);
    await page.waitForFunction(() => (window as any)._qwikEv?.roots);
    const held = await holdRedirect(page);
    try {
      await page.locator('#loader-redirect-list-link').click();
      await expect(page.locator('#loader-redirect-list')).toBeVisible();
      await page.locator('#loader-redirect-defer').click();
      await expect(page.locator('#loader-redirect-defer')).toHaveText('deferred');
      held.releaseRedirect();
      await expect(page.locator('#loader-redirect-release-guard')).toBeEnabled();
      await page.locator('#loader-redirect-other-link').click();
      await expect(page).toHaveURL(/sort=other$/);
      await page.locator('#loader-redirect-release-guard').click();
      await expect(page.locator('#loader-redirect-release-guard')).toBeDisabled();
      await expect(page.locator('#loader-redirect-pending')).toHaveText('pending');
      await expect(page.locator('#loader-redirect-error')).toHaveCount(0);
      held.releaseData();
      await expect(page.locator('#loader-redirect-value')).toHaveText('3 items, sorted by other');
      await expect(page.locator('#loader-redirect-pending')).toHaveText('ready');
    } finally {
      held.releaseRedirect();
      held.releaseData();
    }
  });
});
