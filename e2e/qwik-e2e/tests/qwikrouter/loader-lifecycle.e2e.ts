import { expect, test, type Page } from '@playwright/test';
import { rm } from 'node:fs/promises';

const base = '/qwikrouter-test/loader-navigation/';
type Snapshot = {
  signals: Record<string, number>;
  values: string[];
  paths: string[];
};

async function snapshot(page: Page): Promise<Snapshot> {
  const output = page.locator('#loader-state');
  const previous = await output.textContent();
  await page.locator('#inspect-loader-state').click();
  await expect(output).not.toHaveText(previous!);
  return JSON.parse((await output.textContent())!);
}

async function completed(page: Page, path: string) {
  await expect(page.locator('#completed-loader-navigation')).toHaveText(base + path);
  await expect(page.locator('#loader-navigation-status')).toHaveText('idle');
}

async function holdLoader(page: Page, pattern: string) {
  const bodies: string[] = [];
  let release!: () => void;
  let started!: () => void;
  let delivered!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const requested = new Promise<void>((resolve) => (started = resolve));
  const finished = new Promise<void>((resolve) => (delivered = resolve));
  await page.route(pattern, async (route) => {
    const response = await route.fetch();
    bodies.push(await response.text());
    started();
    await gate;
    await route.fulfill({ response });
    delivered();
  });
  return { requested, release, finished, bodies };
}

async function holdActions(page: Page) {
  const releases: (() => void)[] = [];
  const starts: (() => void)[] = [];
  const requested = [0, 1].map(
    (i) =>
      new Promise<void>((resolve) => {
        starts[i] = resolve;
      })
  );
  const gates = [0, 1].map(
    (i) =>
      new Promise<void>((resolve) => {
        releases[i] = resolve;
      })
  );
  let calls = 0;
  await page.route('**/*qaction=*', async (route) => {
    const index = calls++;
    const response = await route.fetch();
    starts[index]();
    await gates[index];
    await route.fulfill({ response });
  });
  return { requested, releases, getCallCount: () => calls };
}

async function ignoreAbort(page: Page, needle: string) {
  await page.evaluate((needle) => {
    const fetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      return fetch(input, url.includes(needle) ? { ...init, signal: undefined } : init);
    };
  }, needle);
}

test.describe('loader lifecycle', () => {
  const errors = new WeakMap<Page, string[]>();
  test.beforeEach(async ({ page }) => {
    errors.set(page, []);
    page.on('pageerror', (error) => errors.get(page)!.push(error.message));
    await page.goto(base);
    await expect(page).toHaveTitle('parent - Qwik');
  });

  test.afterEach(async ({ page }) => {
    expect(errors.get(page)).toEqual([]);
  });

  for (const olderFinishesFirst of [true, false]) {
    test(`keeps the latest action state when older finishes ${olderFinishesFirst ? 'first' : 'last'}`, async ({
      page,
    }) => {
      const { requested, releases } = await holdActions(page);
      await page.evaluate(() => {
        (window as any).__completedSubmits = [];
        document.addEventListener(
          'submitcompleted',
          (event) => {
            (window as any).__completedSubmits.push((event as CustomEvent).detail.value.value);
          },
          true
        );
      });
      const input = page.getByRole('textbox', { name: 'Action value' });
      try {
        await input.fill('older');
        await page.locator('#loader-refresh-action').click();
        await requested[0];
        await page.locator('#navigate-static').click();
        await completed(page, 'child/');
        await input.fill('newer');
        await page.locator('#loader-refresh-action').click();
        await requested[1];
        await input.fill('unsent');
        releases[olderFinishesFirst ? 0 : 1]();
        if (olderFinishesFirst) {
          await expect
            .poll(() => page.evaluate(() => (window as any).__completedSubmits))
            .toEqual(['older']);
          await expect(page.locator('#loader-action-status')).toHaveText('running');
          await expect(input).toHaveValue('unsent');
          releases[1]();
        } else {
          await expect(page.locator('#loader-action-value')).toHaveText('newer');
          await input.fill('unsent');
          releases[0]();
        }
        await expect
          .poll(() => page.evaluate(() => (window as any).__completedSubmits.slice().sort()))
          .toEqual(['newer', 'older']);
        await expect(page.locator('#loader-navigation-status')).toHaveText('idle');
        await expect(page.locator('#loader-action-value')).toHaveText('newer');
        await expect(page.locator('#loader-action-status')).toHaveText('idle');
        await expect(input).toHaveValue(olderFinishesFirst ? '' : 'unsent');
      } finally {
        releases.forEach((release) => release());
      }
    });
  }

  for (const responseType of ['data', 'redirect', 'http redirect']) {
    test(`ignores superseded same-page action ${responseType}`, async ({ page }) => {
      if (responseType === 'http redirect') {
        await page.evaluate(() => {
          const fetch = window.fetch.bind(window);
          let first = true;
          window.fetch = async (input, init) => {
            const response = await fetch(input, init);
            if (response.url.includes('qaction=') && first) {
              first = false;
              Object.defineProperties(response, {
                redirected: { value: true },
                url: {
                  value: new URL('/qwikrouter-test/loader-navigation/42/', location.href).href,
                },
              });
            }
            return response;
          };
        });
      }
      const { requested, releases, getCallCount } = await holdActions(page);
      await page.evaluate(() => {
        (window as any).__completedActionCount = 0;
        document.addEventListener(
          'submitcompleted',
          () => {
            (window as any).__completedActionCount++;
          },
          true
        );
      });
      const requests: string[] = [];
      page.on('request', (request) => {
        if (/q-loader-(navigation-parent|lifecycle-layout)\./.test(request.url())) {
          requests.push(request.url());
        }
      });
      const input = page.getByRole('textbox', { name: 'Action value' });
      try {
        await input.fill(responseType === 'redirect' ? 'redirect' : 'older');
        await page.locator('#loader-refresh-action').click();
        await requested[0];
        await input.fill('newer');
        await page.locator('#loader-refresh-action').click();
        releases[0]();
        await requested[1];
        await expect
          .poll(() => page.evaluate(() => (window as any).__completedActionCount))
          .toBe(1);
        await expect(page).toHaveURL(base);
        expect(requests).toEqual([]);
        releases[1]();
        await expect(page.locator('#loader-action-value')).toHaveText('newer');
        await expect(page.locator('#loader-action-status')).toHaveText('idle');
        await expect(page.locator('#loader-navigation-status')).toHaveText('idle');
        await expect
          .poll(() => page.evaluate(() => (window as any).__completedActionCount))
          .toBe(2);
        expect(getCallCount()).toBe(2);
        expect(requests.filter((url) => url.includes('q-loader-navigation-parent.'))).toHaveLength(
          1
        );
        expect(requests.filter((url) => url.includes('q-loader-lifecycle-layout.'))).toHaveLength(
          1
        );
        await expect(page).toHaveURL(base);
      } finally {
        releases.forEach((release) => release());
      }
    });
  }

  test('rewrites to a layout stop retire source loaders', async ({ page, request }) => {
    const alias = base + 'projekte/';
    const response = await request.get(alias);
    expect(response.status()).toBe(200);
    const failed: string[] = [];
    const requests: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('q-loader-')) {
        requests.push(request.url());
      }
    });
    page.on('response', (response) => {
      if (response.url().includes('q-loader-') && response.status() === 404) {
        failed.push(response.url());
      }
    });
    await snapshot(page);
    await page.evaluate((alias) => (window as any).__navigateLoaderTest(alias), alias);
    await expect(page.locator('h1')).toHaveText(alias);
    await expect(page).toHaveTitle(alias + ' - Qwik');
    await page.waitForLoadState('networkidle');
    const state: Snapshot = await page.evaluate(() => (window as any).__readLoaderState());
    expect(Object.keys(state.signals)).toEqual(['navigation-rewritten']);
    expect(failed).toEqual([]);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toContain('/projekte/q-loader-navigation-rewritten.');
  });

  test('completes both navigation promises when a pending route is superseded', async ({
    page,
  }) => {
    await snapshot(page);
    const held = await holdLoader(page, '**/42/q-loader-navigation-dynamic-child.*');
    try {
      await page.evaluate(() => {
        (window as any).__navDone = [];
        void (window as any)
          .__navigateLoaderTest('/qwikrouter-test/loader-navigation/42/')
          .then(() => (window as any).__navDone.push('first'));
      });
      await held.requested;
      await page.evaluate(() => {
        void (window as any)
          .__navigateLoaderTest('/qwikrouter-test/loader-navigation/43/')
          .then(() => (window as any).__navDone.push('second'));
      });
      held.release();
      await expect(page).toHaveTitle('child 43 - Qwik');
      await expect
        .poll(() => page.evaluate(() => (window as any).__navDone.slice().sort()))
        .toEqual(['first', 'second']);
    } finally {
      held.release();
    }
  });

  test('hash change during rendering still commits the loader registry', async ({ page }) => {
    await snapshot(page);
    const held = await holdLoader(page, '**/42/q-loader-navigation-dynamic-child.*');
    try {
      await page.locator('#navigate-dynamic').click();
      await held.requested;
      await page.evaluate(() => {
        void (window as any).__navigateLoaderTest('/qwikrouter-test/loader-navigation/42/#anchor');
      });
      held.release();
      await expect(page).toHaveTitle('child 42 - Qwik');
      await expect(page.locator('#loader-navigation-status')).toHaveText('idle');
      await expect(page).toHaveURL(base + '42/#anchor');
      const current = await snapshot(page);
      expect(current.signals['navigation-parent']).toBeUndefined();
    } finally {
      held.release();
    }
  });

  test('a new page can render before superseded route modules arrive', async ({ page }) => {
    let release!: () => void;
    let started!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const requested = new Promise<void>((resolve) => {
      started = resolve;
    });
    await page.route('**/build/*.js', async (route) => {
      const response = await route.fetch();
      if ((await response.text()).includes('navigation-dynamic-child')) {
        started();
        await gate;
      }
      await route.fulfill({ response });
    });
    try {
      await page.locator('#navigate-dynamic').click();
      await requested;
      await page.locator('#navigate-static').click();
      await completed(page, 'child/');
      await expect(page).toHaveTitle('static child - Qwik');
    } finally {
      release();
    }
  });

  test('a new page can render before an old action returns', async ({ page }) => {
    await snapshot(page);
    const held = await holdLoader(page, '**/*qaction=*');
    try {
      await page.locator('#loader-refresh-action').click();
      await held.requested;
      await page.locator('#navigate-dynamic').click();
      await expect(page).toHaveTitle('child 42 - Qwik');
    } finally {
      held.release();
    }
  });

  test('layout-stop routes remove inherited layout loaders', async ({ page }) => {
    await snapshot(page);
    const failed: string[] = [];
    page.on('response', (response) => {
      if (response.status() === 404 && response.url().includes('q-loader-')) {
        failed.push(response.url());
      }
    });
    await page.locator('#navigate-static').click();
    await completed(page, 'child/');
    await page.evaluate(() => {
      void (window as any).__navigateLoaderTest('/qwikrouter-test/loader-navigation/isolated/');
    });
    await expect(page.locator('h1')).toHaveText('Isolated page');
    await page.waitForLoadState('networkidle');
    expect(failed).toEqual([]);
    const current = await page.evaluate(() => (window as any).__readLoaderState());
    expect(current.signals['lifecycle-layout']).toBeUndefined();
  });

  test('named layout loaders stay scoped to the selected layout chain', async ({ page }) => {
    const first = await snapshot(page);
    expect(first.signals['lifecycle-selected']).toBeUndefined();
    await page.evaluate(() =>
      (window as any).__navigateLoaderTest('/qwikrouter-test/loader-navigation/selected/')
    );
    await expect(page.locator('#selected-layout-value')).toHaveText('selected layout');
    const selected = await page.evaluate(() => (window as any).__readLoaderState());
    expect(selected.signals['lifecycle-selected']).toBeDefined();
    expect(selected.signals['lifecycle-layout']).toBeUndefined();
    await page.evaluate(() =>
      (window as any).__navigateLoaderTest('/qwikrouter-test/loader-navigation/child/')
    );
    await expect(page).toHaveTitle('static child - Qwik');
    const child = await snapshot(page);
    expect(child.signals['lifecycle-selected']).toBeUndefined();
  });

  test('keeps the SSR page URL before destination modules finish loading', async ({ page }) => {
    let started!: () => void;
    let release!: () => void;
    const requested = new Promise<void>((resolve) => {
      started = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/build/*.js', async (route) => {
      const response = await route.fetch();
      const source = await response.text();
      if (source.includes('navigation-dynamic-child')) {
        started();
        await gate;
      }
      await route.fulfill({ response });
    });
    try {
      await page.locator('#navigate-dynamic').click();
      await requested;
      await expect(page).toHaveURL(/loader-navigation\/42\//);
      const refreshed = page.waitForResponse((response) =>
        response.url().includes('q-loader-navigation-parent.')
      );
      await page.locator('#refresh-parent-loader').dispatchEvent('click');
      expect((await refreshed).status()).toBe(200);
    } finally {
      release();
    }
    await completed(page, '42/');
  });

  for (const responseType of ['data', 'http redirect']) {
    test(`ignores stale action ${responseType} after navigation`, async ({ page }) => {
      if (responseType === 'http redirect') {
        await page.evaluate(() => {
          const fetch = window.fetch.bind(window);
          window.fetch = async (input, init) => {
            const response = await fetch(input, init);
            if (response.url.includes('qaction=')) {
              Object.defineProperties(response, {
                redirected: { value: true },
                url: {
                  value: new URL('/qwikrouter-test/loader-navigation/child/', location.href).href,
                },
              });
            }
            return response;
          };
        });
      }
      const held = await holdLoader(page, '**/*qaction=*');
      const requests: string[] = [];
      page.on('request', (request) => {
        if (request.url().includes('q-loader-navigation-parent.')) {
          requests.push(request.url());
        }
      });
      try {
        await page.locator('#loader-refresh-action').click();
        await held.requested;
        await page.locator('#navigate-dynamic').click();
        await expect(page).toHaveURL(/loader-navigation\/42\//);
        requests.length = 0;
        held.release();
        await held.finished;
        await completed(page, '42/');
        await page.waitForLoadState('networkidle');
        expect(requests).toEqual([]);
        const current = await snapshot(page);
        expect(current.signals['navigation-parent']).toBeUndefined();
        expect(current.signals['navigation-dynamic-child']).toBeDefined();
        await expect(page).toHaveTitle('child 42 - Qwik');
        await expect(page.locator('#loader-action-status')).toHaveText('idle');
      } finally {
        held.release();
      }
    });
  }

  test('preserves shared identity and recreates only departed signals', async ({ page }) => {
    const first = await snapshot(page);
    await page.locator('#save-parent-loader').click();
    await page.locator('#navigate-dynamic').click();
    await completed(page, '42/');
    const child = await snapshot(page);
    const expected = Object.keys(first.signals).filter((id) => id !== 'navigation-parent');
    expect(Object.keys(child.signals).sort()).toEqual(
      [...expected, 'navigation-dynamic-child'].sort()
    );
    expect(child.signals['lifecycle-layout']).toBe(first.signals['lifecycle-layout']);
    expect(child.paths).toEqual(Object.keys(child.signals).sort());
    expect(child.values).not.toContain('__qwik_route_loader_value__navigation-parent');

    const requests: string[] = [];
    page.on('request', (request) => requests.push(request.url()));
    await page.evaluate(async () => {
      const signal = (window as any).__savedParentLoader;
      signal.invalidate(true);
      await signal.promise();
    });
    await snapshot(page);
    expect(requests.filter((url) => url.includes('q-loader-navigation-parent.'))).toEqual([]);

    await page.locator('#navigate-parent').click();
    await completed(page, '');
    const returned = await snapshot(page);
    expect(Object.keys(returned.signals).sort()).toEqual(Object.keys(first.signals).sort());
    expect(returned.signals['navigation-parent']).not.toBe(first.signals['navigation-parent']);
    expect(returned.signals['lifecycle-layout']).toBe(first.signals['lifecycle-layout']);
  });

  for (const oldPath of ['42', 'redirect']) {
    test(`ignores the late ${oldPath === '42' ? 'value' : 'redirect'} of the same loader`, async ({
      page,
    }) => {
      const needle = `${base}${oldPath}/q-loader-navigation-dynamic-child.`;
      await ignoreAbort(page, needle);
      const held = await holdLoader(page, `**${needle}*`);
      try {
        await page
          .locator(oldPath === '42' ? '#navigate-dynamic' : '#navigate-old-redirect')
          .click();
        await held.requested;
        await page.locator('#navigate-next-dynamic').click();
        await expect(page).toHaveURL(base + '43/');
        held.release();
        await held.finished;
        await completed(page, '43/');
        await expect(page).toHaveTitle('child 43 - Qwik');
        await expect(page.locator('#dynamic-loader-value')).toHaveText('child 43');
        const state = await snapshot(page);
        expect(state.signals['navigation-static-child']).toBeUndefined();
        expect(state.signals['navigation-dynamic-child']).toBeDefined();
      } finally {
        held.release();
      }
    });
  }

  test('keeps a shared request alive when one consumer disappears', async ({ page }) => {
    const token = await page.locator('#shared-loader-token').textContent();
    const before = await snapshot(page);
    const failed: string[] = [];
    page.on('requestfailed', (request) => failed.push(request.url()));
    const held = await holdLoader(page, '**/q-loader-lifecycle-layout.*');
    try {
      await page.locator('#refresh-shared-loader').click();
      await held.requested;
      await page.locator('#remove-loader-consumer').click();
      await expect(page.locator('#extra-loader-consumer')).toHaveCount(0);
      held.release();
      await held.finished;
      await expect(page.locator('#shared-loader-token')).not.toHaveText(token!);
      expect(failed.filter((url) => url.includes('q-loader-lifecycle-layout.'))).toEqual([]);
      expect((await snapshot(page)).signals['lifecycle-layout']).toBe(
        before.signals['lifecycle-layout']
      );
    } finally {
      held.release();
    }
  });

  test('shares prefetched data and refreshes recreated loaders after an action', async ({
    page,
  }) => {
    await page.goto('/qwikrouter-test.prod/loader-cache/');
    const link = page.locator('#prefetch-cache-loaders');
    const cachedId = (await link.getAttribute('data-cached-id'))!;
    const immutableId = (await link.getAttribute('data-immutable-id'))!;
    const fetched: string[] = [];
    page.on('request', (request) => {
      if ([cachedId, immutableId].some((id) => request.url().includes(`q-loader-${id}.`))) {
        fetched.push(request.url());
      }
    });
    const prefetch = page.waitForResponse((response) =>
      response.url().includes(`q-loader-${cachedId}.`)
    );
    await page.locator('#prefetch-cache-loaders').hover();
    expect((await prefetch).ok()).toBe(true);
    expect(fetched.filter((url) => url.includes(`q-loader-${immutableId}.`))).toHaveLength(0);
    await page.locator('#prefetch-cache-loaders').click();
    await expect(page.locator('#cached-loader-token')).not.toBeEmpty();
    await expect(page.locator('#immutable-loader-token')).not.toBeEmpty();
    await expect(page.locator('#loader-navigation-status')).toHaveText('idle');
    expect(fetched.filter((url) => url.includes(`q-loader-${cachedId}.`))).toHaveLength(1);
    const original = await snapshot(page);
    await page.locator('#navigate-parent').click();
    await expect(page.locator('#cached-loader-token')).toHaveCount(0);
    await expect(page.locator('#loader-navigation-status')).toHaveText('idle');
    expect((await snapshot(page)).signals[immutableId]).toBeUndefined();
    await page.locator('#prefetch-cache-loaders').click();
    await expect(page.locator('#cached-loader-token')).not.toBeEmpty();
    await expect(page.locator('#immutable-loader-token')).not.toBeEmpty();
    await expect(page.locator('#loader-navigation-status')).toHaveText('idle');
    const recreated = await snapshot(page);
    expect(recreated.signals[immutableId]).not.toBe(original.signals[immutableId]);
    const cached = await page.locator('#cached-loader-token').textContent();
    const immutable = await page.locator('#immutable-loader-token').textContent();
    await page.locator('#loader-refresh-action').click();
    await expect(page.locator('#loader-action-result')).toHaveText('done');
    await expect(page.locator('#cached-loader-token')).not.toHaveText(cached!);
    await expect(page.locator('#immutable-loader-token')).not.toHaveText(immutable!);
  });

  test('reuses HTTP responses after disposing loader signals', async ({
    page,
    browser,
    launchOptions,
  }, testInfo) => {
    const profileDir = testInfo.outputPath('http-cache-profile');
    // WebKit's ephemeral contexts omit the network disk cache.
    const context = await browser.browserType().launchPersistentContext(profileDir, {
      ...launchOptions,
      baseURL: new URL(page.url()).origin,
    });
    try {
      const cachePage = await context.newPage();
      cachePage.on('pageerror', (error) => errors.get(page)!.push(error.message));
      await cachePage.goto('/qwikrouter-test.prod/loader-cache/');
      await cachePage.locator('#prefetch-cache-loaders').click();
      await expect(cachePage.locator('#cached-loader-token')).not.toBeEmpty();
      await expect(cachePage.locator('#immutable-loader-token')).not.toBeEmpty();
      await expect(cachePage.locator('#loader-navigation-status')).toHaveText('idle');
      const cached = await cachePage.locator('#cached-loader-token').textContent();
      const immutable = await cachePage.locator('#immutable-loader-token').textContent();
      await cachePage.locator('#navigate-parent').click();
      await expect(cachePage.locator('#cached-loader-token')).toHaveCount(0);
      await expect(cachePage.locator('#loader-navigation-status')).toHaveText('idle');
      expect((await snapshot(cachePage)).signals).toEqual({});
      await cachePage.locator('#prefetch-cache-loaders').click();
      await expect(cachePage.locator('#cached-loader-token')).toHaveText(cached!);
      await expect(cachePage.locator('#immutable-loader-token')).toHaveText(immutable!);
    } finally {
      await context.close();
      await rm(profileDir, { recursive: true, force: true });
    }
  });

  test('finishes the allowed navigation when a later navigation is prevented', async ({ page }) => {
    const held = await holdLoader(page, '**/q-loader-navigation-static-child.*');
    try {
      await page.locator('#block-loader-navigation').click();
      await expect(page.locator('#block-loader-navigation')).toHaveText('blocked');
      await page.locator('#navigate-static').click();
      await held.requested;
      await page.locator('#navigate-dynamic').click();
      await page.waitForFunction(() => (window as any).__blockedLoaderNavigation);
      held.release();
      await completed(page, 'child/');
      await expect(page).toHaveTitle('static child - Qwik');
      expect((await snapshot(page)).signals['navigation-dynamic-child']).toBeUndefined();
    } finally {
      held.release();
    }
  });

  test('keeps current action results when an earlier loader response arrives', async ({ page }) => {
    await page.locator('#navigate-dynamic').click();
    await completed(page, '42/');
    await ignoreAbort(page, 'q-loader-navigation-dynamic-child.');
    const held = await holdLoader(page, '**/42/q-loader-navigation-dynamic-child.*');
    try {
      await page.locator('#navigate-next-dynamic').click();
      await completed(page, '43/');
      await page.locator('#navigate-dynamic').click();
      await held.requested;
      const staleToken = held.bodies[0].match(/[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}/)![0];
      await page.locator('#loader-refresh-action').click();
      held.release();
      await expect(page.locator('#loader-action-result')).toHaveText('done');
      await expect(page.locator('#dynamic-loader-value')).toHaveText('child 42');
      await expect(page.locator('#dynamic-loader-token')).not.toHaveText(staleToken);
      await expect(page.locator('#loader-navigation-status')).toHaveText('idle');
    } finally {
      held.release();
    }
  });

  test('keeps loader data and registry correct across back and forward', async ({ page }) => {
    await page.locator('#navigate-dynamic').click();
    await completed(page, '42/');
    await page.locator('#navigate-next-dynamic').click();
    await completed(page, '43/');
    await page.goBack();
    await expect(page.locator('#dynamic-loader-value')).toHaveText('child 42');
    await expect(page.locator('#loader-navigation-status')).toHaveText('idle');
    await page.goBack();
    await expect(page).toHaveTitle('parent - Qwik');
    await expect(page.locator('#loader-navigation-status')).toHaveText('idle');
    expect((await snapshot(page)).signals['navigation-dynamic-child']).toBeUndefined();
    await page.goForward();
    await expect(page.locator('#dynamic-loader-value')).toHaveText('child 42');
    await expect(page.locator('#loader-navigation-status')).toHaveText('idle');
    expect((await snapshot(page)).signals['navigation-parent']).toBeUndefined();
  });

  test('restores committed loaders before falling back after a module failure', async ({
    page,
  }) => {
    const original = await snapshot(page);
    let failedModule = false;
    await page.route('**/build/*.js', async (route) => {
      const response = await route.fetch();
      const source = await response.text();
      if (!failedModule && source.includes('navigation-dynamic-child')) {
        failedModule = true;
        await route.fulfill({ response, body: "throw new Error('test route module failure');" });
      } else {
        await route.fulfill({ response });
      }
    });
    const child = await holdLoader(page, '**/q-loader-navigation-static-child.*');
    let record!: (value: Snapshot) => void;
    const restoredState = new Promise<Snapshot>((resolve) => (record = resolve));
    await page.exposeFunction('recordRestoredLoaders', record);
    await page.evaluate(() => {
      window.addEventListener('beforeunload', () => {
        (window as any).recordRestoredLoaders((window as any).__readLoaderState());
      });
    });
    try {
      await page.locator('#navigate-static').click();
      await child.requested;
      await page.locator('#navigate-dynamic').click();
      const restored = await restoredState;
      expect(failedModule).toBe(true);
      expect(restored.signals).toEqual(original.signals);
      expect(restored.paths).toEqual(Object.keys(original.signals).sort());
      child.release();
      await expect(page).toHaveTitle('child 42 - Qwik');
      await expect(page.locator('#dynamic-loader-value')).toHaveText('child 42');
      await expect(page.locator('#loader-navigation-status')).toHaveText('idle');
    } finally {
      child.release();
      await page.unrouteAll({ behavior: 'wait' });
    }
  });

  test('cleans up after an interrupted view transition', async ({ page }) => {
    await page.goto(base + '?viewtransition');
    const transitions = await page.evaluate(() => {
      if (!document.startViewTransition) {
        return false;
      }
      const start = document.startViewTransition.bind(document);
      (window as any).__transitions = 0;
      document.startViewTransition = (...args) => {
        (window as any).__transitions++;
        const transition = start(...args);
        return transition;
      };
      return true;
    });
    test.skip(!transitions, 'This browser does not implement view transitions.');
    const held = await holdLoader(page, '**/q-loader-navigation-static-child.*');
    try {
      await page.locator('#navigate-static').click();
      await held.requested;
      await page.locator('#navigate-dynamic').dispatchEvent('click');
      held.release();
      await completed(page, '42/');
      await expect(page).toHaveTitle('child 42 - Qwik');
      expect(await page.evaluate(() => (window as any).__transitions)).toBeGreaterThan(0);
      expect((await snapshot(page)).signals['navigation-static-child']).toBeUndefined();
    } finally {
      held.release();
    }
  });
});
