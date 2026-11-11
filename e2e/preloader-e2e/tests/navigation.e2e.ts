import { expect, test, type Page } from '@playwright/test';
import { chunkComesFrom, chunkHoldsSegmentsFrom } from '../utils/app';
import { attachRoundTrips, expectRoundTrips } from '../utils/click-tests';
import { NAVIGATION_SOURCES, type Fixture } from '../utils/fixtures';
import {
  collectUntilQuiet,
  createGate,
  countRoundTrips,
  preloaderLinks,
  recordSpeculativePreloads,
  recordSpeculativeOrder,
  release,
  releaseAll,
  resultIsDone,
  settle,
  speculativePreloads,
  waitForNetworkIdle,
  waitForQwikloader,
} from '../utils/gate';
import {
  countFixtureRoundTrips,
  expectResult,
  fixtureResult,
  fixtureRoot,
  openFixture,
} from '../utils/scenarios';

const FROM: Record<'off' | 'visible' | 'intent', Fixture> = {
  off: { id: 'navigation/from-off', path: '/navigation/from/off/', sources: NAVIGATION_SOURCES },
  visible: {
    id: 'navigation/from-visible',
    path: '/navigation/from/visible/',
    sources: NAVIGATION_SOURCES,
  },
  intent: {
    id: 'navigation/from-intent',
    path: '/navigation/from/intent/',
    sources: NAVIGATION_SOURCES,
  },
};
const TO_TREE: Fixture = {
  id: 'navigation/to-tree',
  path: '/navigation/to-tree/',
  sources: NAVIGATION_SOURCES,
  expected: '5',
};
const ACTION: Fixture = {
  id: 'navigation/action',
  path: '/navigation/action/',
  sources: NAVIGATION_SOURCES,
  expected: '42',
};
const OLD_PAGE_SOURCES = [
  'src/routes/navigation/from/',
  'src/components/fixtures/navigation/old-page-work.tsx',
  'src/components/fixtures/single/all/',
  'src/components/fixtures/tree/all/',
  'src/components/fixtures/conditional/all/',
];

const TO_TREE_SOURCES = [
  'src/routes/navigation/to-tree/',
  'src/components/fixtures/navigation/nav-tree',
];

const treeLink = (page: Page, from: Fixture) =>
  fixtureRoot(page, from).locator('[data-testid=link-tree]');

const navigateToTree = async (from: Fixture, state: 'cold' | 'warm', page: Page) => {
  const opened = await openFixture(page, from, state);
  const roundTrips = await countFixtureRoundTrips(
    opened,
    () => treeLink(page, from).click(),
    resultIsDone(fixtureResult(page, TO_TREE))
  );
  return { ...opened, roundTrips };
};

test.describe('cold SPA navigation', () => {
  test('every render chunk of the new page goes out in the same round trip', async ({ page }) => {
    const { gate, roundTrips } = await navigateToTree(FROM.off, 'cold', page);
    await releaseAll(gate);
    await expectResult(page, TO_TREE);
    const withNewPageChunks = roundTrips.filter((roundTrip) =>
      roundTrip.urls.some((url) => chunkComesFrom(url, TO_TREE_SOURCES))
    );
    expect(withNewPageChunks.length).toBeGreaterThan(0);
    test.fail(true, 'on main, the route module loads a round trip before its render chunks');
    expect(withNewPageChunks).toHaveLength(1);
  });

  test('the new page shows in 4 round trips, over the cap of 2', async ({ page }) => {
    const { gate, roundTrips } = await navigateToTree(FROM.off, 'cold', page);
    await releaseAll(gate);
    await attachRoundTrips('round-trips.txt', roundTrips);
    expectRoundTrips(roundTrips, {
      roundTrips: 4,
      reason:
        "over the cap on main: the Link handler, the router's navigation code, then the layout and route modules each cost a round trip before the render chunks",
    });
  });
});

test.describe('warm SPA navigation', () => {
  test('the new page shows with no JS request', async ({ page }) => {
    const { gate, roundTrips } = await navigateToTree(FROM.visible, 'warm', page);
    await releaseAll(gate);
    await expectResult(page, TO_TREE);
    const jsRequests = roundTrips.flatMap((roundTrip) =>
      roundTrip.urls.filter((url) => new URL(url).pathname.endsWith('.js'))
    );
    test.fail(
      true,
      "on main, the router's navigation code (@qwik-router-config, useQwikRouter) is never preloaded"
    );
    expect(jsRequests).toEqual([]);
  });
});

const TO_DATA: Fixture = {
  id: 'navigation/to-data',
  path: '/navigation/to-data/',
  sources: ['src/routes/navigation/to-data/'],
  expected: 'loaded',
};

test.describe('navigation to a page with a routeLoader$', () => {
  test("the loader's data goes out in the same round trip as the new page's render chunks", async ({
    page,
  }) => {
    const opened = await openFixture(page, FROM.off, 'cold');
    const roundTrips = await countFixtureRoundTrips(
      opened,
      () => fixtureRoot(page, FROM.off).locator('[data-testid=link-data]').click(),
      resultIsDone(fixtureResult(page, TO_DATA))
    );
    await releaseAll(opened.gate);
    await expectResult(page, TO_DATA);
    await attachRoundTrips('round-trips.txt', roundTrips);
    const roundTripOf = (isWanted: (url: string) => boolean) =>
      roundTrips.findIndex((roundTrip) => roundTrip.urls.some(isWanted));
    const dataRoundTrip = roundTripOf((url) => new URL(url).pathname.includes('/q-loader-'));
    const renderRoundTrip = roundTripOf((url) => chunkHoldsSegmentsFrom(url, TO_DATA.sources));
    expect(dataRoundTrip).toBeGreaterThanOrEqual(0);
    expect(dataRoundTrip).toBe(renderRoundTrip);
  });
});

test.describe('hover on a Link that prefetches on intent', () => {
  test("the new route's chunks are requested", async ({ page }) => {
    const { gate } = await openFixture(page, FROM.intent, 'cold');
    const urls = await collectUntilQuiet(page, gate, () => treeLink(page, FROM.intent).hover());
    await releaseAll(gate);
    expect(urls.some((url) => chunkComesFrom(url, TO_TREE_SOURCES))).toBe(true);
  });
});

const navigateWhilePrefetching = async (page: Page) => {
  await recordSpeculativePreloads(page);
  const gate = await createGate(page);
  gate.holdWhilePassing = (url) =>
    chunkComesFrom(url, [
      'src/components/fixtures/single/all/index.tsx_all_component_a1_useComputed_',
    ]);
  await page.goto(FROM.off.path);
  await waitForQwikloader(page);
  await expect.poll(() => gate.held.length, { timeout: 15_000 }).toBe(1);
  const pendingPreloads = gate.held.splice(0);
  gate.holdWhilePassing = undefined;
  await settle(page, gate);
  expect((await speculativePreloads(page)).has(pendingPreloads[0].request().url())).toBe(true);
  const linksBeforeTheClick = (await preloaderLinks(page)).length;
  await countRoundTrips(
    page,
    gate,
    () => treeLink(page, FROM.off).click(),
    resultIsDone(fixtureResult(page, TO_TREE))
  );
  await expectResult(page, TO_TREE);
  return { gate, pendingPreloads, linksBeforeTheClick };
};

test.describe('after a navigation', () => {
  test('the preloader keeps preloading speculatively', async ({ page }, testInfo) => {
    const { gate, pendingPreloads } = await navigateWhilePrefetching(page);
    await release(pendingPreloads);
    const order = await recordSpeculativeOrder(page, gate);
    await testInfo.attach('order.txt', { body: order, contentType: 'text/plain' });
    expect(order.trim()).not.toBe('');
  });

  test("the old page's queued speculative preloads aren't sent", async ({ page }) => {
    const { gate, pendingPreloads, linksBeforeTheClick } = await navigateWhilePrefetching(page);
    await waitForNetworkIdle(page, () => releaseAll(gate, pendingPreloads), 1500);
    const oldPagePreloads = (await preloaderLinks(page))
      .slice(linksBeforeTheClick)
      .filter((link) => link.speculative && chunkComesFrom(link.href, OLD_PAGE_SOURCES))
      .map((link) => link.href);
    test.fail(
      true,
      "on main, the preloader keeps sending the old page's queue after a SPA navigation"
    );
    expect(oldPagePreloads).toEqual([]);
  });
});

test.describe('back button', () => {
  test('the previous page shows with no JS request', async ({ page }) => {
    const { gate } = await navigateToTree(FROM.visible, 'warm', page);
    await releaseAll(gate);
    await expectResult(page, TO_TREE);
    gate.mode = 'hold';
    const roundTrips = await countRoundTrips(
      page,
      gate,
      () => page.goBack(),
      () => treeLink(page, FROM.visible).isVisible()
    );
    await releaseAll(gate);
    const jsRequests = roundTrips.flatMap((roundTrip) =>
      roundTrip.urls.filter((url) => new URL(url).pathname.endsWith('.js'))
    );
    test.fail(
      true,
      'on main, going back renders the previous page on the client and finds its chunks one round trip at a time'
    );
    expect(jsRequests).toEqual([]);
  });
});

const submitAction = async (page: Page) => {
  const opened = await openFixture(page, ACTION, 'cold');
  const roundTrips = await countFixtureRoundTrips(
    opened,
    () => fixtureRoot(page, ACTION).locator('[data-testid=trigger]').click(),
    resultIsDone(fixtureResult(page, ACTION))
  );
  await releaseAll(opened.gate);
  await expectResult(page, ACTION);
  return roundTrips;
};

test.describe('form action', () => {
  test("the action's result shows in 6 round trips, over the cap of 2", async ({ page }) => {
    const roundTrips = await submitAction(page);
    await attachRoundTrips('round-trips.txt', roundTrips);
    expectRoundTrips(roundTrips, {
      roundTrips: 6,
      reason: 'over the cap on main: the action request waits for 5 round trips of router code',
    });
  });
});
