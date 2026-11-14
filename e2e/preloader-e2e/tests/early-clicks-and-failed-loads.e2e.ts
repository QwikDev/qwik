import { expect, test, type Page } from '@playwright/test';
import { chunkComesFrom, getCoreBundle, getManifest, ORIGIN } from '../utils/app';
import { fixtureById, NAVIGATION_SOURCES, type Fixture } from '../utils/fixtures';
import {
  countRoundTrips,
  createGate,
  holdSpeculativePreloads,
  preloaderLinks,
  recordSpeculativePreloads,
  releaseAll,
  resultIsDone,
  waitForNetworkIdle,
  waitForQwikloader,
} from '../utils/gate';
import { expectResult, fixtureResult, fixtureRoot } from '../utils/scenarios';

const CONDITIONAL_ALL = fixtureById('conditional/all');
const FROM_OFF: Fixture = {
  id: 'navigation/from-off',
  path: '/navigation/from/off/',
  sources: NAVIGATION_SOURCES,
};
const TO_TREE: Fixture = {
  id: 'navigation/to-tree',
  path: '/navigation/to-tree/',
  sources: NAVIGATION_SOURCES,
  expected: '5',
};

const coreUrl = () => `${ORIGIN}/build/${getCoreBundle()}`;
const preloaderUrl = () => `${ORIGIN}/build/${getManifest().preloader}`;
const bundleGraphUrl = () => `${ORIGIN}/${getManifest().bundleGraphAsset}`;

const clickWhileLoading = async (
  page: Page,
  heldUrl: string,
  trigger: () => Promise<unknown>,
  result: Fixture
) => {
  await recordSpeculativePreloads(page);
  await holdSpeculativePreloads(page);
  const gate = await createGate(page);
  gate.holdWhilePassing = (url) => url === heldUrl;
  await page.goto(result === TO_TREE ? FROM_OFF.path : result.path, { waitUntil: 'commit' });
  await waitForQwikloader(page);
  await expect.poll(() => gate.held.length).toBe(1);
  const startupPiece = gate.held.splice(0);
  gate.holdWhilePassing = undefined;
  const roundTrips = await countRoundTrips(
    page,
    gate,
    trigger,
    resultIsDone(fixtureResult(page, result)),
    startupPiece
  );
  return { gate, startupPiece, roundTrips };
};

const clickConditional = (page: Page) => () =>
  fixtureRoot(page, CONDITIONAL_ALL).locator('[data-testid=trigger]').click();

test.describe('click before core loaded', () => {
  test("the click isn't lost: the result shows once core arrives", async ({ page }) => {
    const { gate, startupPiece } = await clickWhileLoading(
      page,
      coreUrl(),
      clickConditional(page),
      CONDITIONAL_ALL
    );
    await releaseAll(gate, startupPiece);
    await expectResult(page, CONDITIONAL_ALL);
  });
});

for (const [name, heldUrl] of [
  ['the preloader', preloaderUrl],
  ['the bundle graph', bundleGraphUrl],
] as const) {
  test.describe(`click before ${name} loaded`, () => {
    test("the click isn't lost: the result shows", async ({ page }) => {
      const { gate, startupPiece } = await clickWhileLoading(
        page,
        heldUrl(),
        clickConditional(page),
        CONDITIONAL_ALL
      );
      await releaseAll(gate, startupPiece);
      await expectResult(page, CONDITIONAL_ALL);
    });

    test(`once ${name} arrives, the needed preloads go out before any speculative preload`, async ({
      page,
    }) => {
      const { gate, startupPiece, roundTrips } = await clickWhileLoading(
        page,
        heldUrl(),
        clickConditional(page),
        CONDITIONAL_ALL
      );
      const clickChunks = new Set(roundTrips.flatMap((roundTrip) => roundTrip.urls));
      await waitForNetworkIdle(page, async () => {
        await releaseAll(gate, startupPiece);
        await page.waitForFunction(() => typeof (globalThis as any).qPreload === 'function');
      });
      const links = await preloaderLinks(page);
      const firstSpeculative = links.findIndex(
        (link) => link.speculative && !clickChunks.has(link.href)
      );
      const clickLinks = links
        .map((link, index) => ({ link, index }))
        .filter(({ link }) => clickChunks.has(link.href));
      const lowOrLate = clickLinks.filter(
        ({ link, index }) => link.speculative || (firstSpeculative >= 0 && index > firstSpeculative)
      );
      expect(clickLinks.length).toBeGreaterThan(0);
      test.fail(
        true,
        'on main, hints sent before the preloader runs come out as speculative: a later 0.6 hint overwrites their probability'
      );
      expect(lowOrLate.map(({ link }) => link.href)).toEqual([]);
    });
  });
}

test.describe('navigation click before the preloader loaded', () => {
  test('the new page shows', async ({ page }) => {
    const { gate, startupPiece } = await clickWhileLoading(
      page,
      preloaderUrl(),
      () => fixtureRoot(page, FROM_OFF).locator('[data-testid=link-tree]').click(),
      TO_TREE
    );
    await releaseAll(gate, startupPiece);
    await expectResult(page, TO_TREE);
  });
});

const failTheBundleGraph = (page: Page) =>
  page.route(/-bundle-graph\.json$/, (route) => route.fulfill({ status: 404, body: '' }));

test.describe('bundle graph fails to load', () => {
  test('clicks still show their result', async ({ page }) => {
    await failTheBundleGraph(page);
    await page.goto(CONDITIONAL_ALL.path);
    await waitForQwikloader(page);
    await fixtureRoot(page, CONDITIONAL_ALL).locator('[data-testid=trigger]').click();
    await expectResult(page, CONDITIONAL_ALL);
  });

  test('navigations still show the new page', async ({ page }) => {
    await failTheBundleGraph(page);
    await page.goto(FROM_OFF.path);
    await waitForQwikloader(page);
    await fixtureRoot(page, FROM_OFF).locator('[data-testid=link-tree]').click();
    await expectResult(page, TO_TREE);
  });
});

const failTheFirstRequestOf = async (page: Page, isWanted: (url: string) => boolean) => {
  const failed: string[] = [];
  await page.route(`${ORIGIN}/build/**`, (route) => {
    const url = route.request().url();
    if (!isWanted(url) || failed.includes(url)) {
      return route.continue();
    }
    failed.push(url);
    return route.abort();
  });
  return failed;
};

test.describe('chunk preload fails', () => {
  test('a click still shows its result after its preload failed', async ({ page }) => {
    const failedPreloads = await failTheFirstRequestOf(page, (url) =>
      chunkComesFrom(url, CONDITIONAL_ALL.sources)
    );
    await waitForNetworkIdle(page, async () => {
      await page.goto(CONDITIONAL_ALL.path);
      await waitForQwikloader(page);
    });
    expect(failedPreloads.length).toBeGreaterThan(0);
    await fixtureRoot(page, CONDITIONAL_ALL).locator('[data-testid=trigger]').click();
    test.fail(
      true,
      'on main, a chunk whose preload failed is never requested again: import() of the same URL fails with no request'
    );
    await expectResult(page, CONDITIONAL_ALL);
  });
});
