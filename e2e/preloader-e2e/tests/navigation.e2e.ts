import { expect, test, type Page } from '@playwright/test';
import { chunkComesFrom, chunkHoldsModule, chunkHoldsSegmentsFrom } from '../utils/app';
import { attachRoundTrips, expectRoundTrips } from '../utils/click-tests';
import { NAVIGATION_SOURCES, type Fixture } from '../utils/fixtures';
import {
  collectUntilQuiet,
  countRoundTrips,
  FILLER,
  preloadHints,
  preloaderLinks,
  recordPreloadHints,
  recordSpeculativeOrder,
  releaseAll,
  resultIsDone,
  waitForNetworkIdle,
} from '../utils/gate';
import {
  countFixtureRoundTrips,
  expectResult,
  fixtureResult,
  fixtureRoot,
  openFixture,
} from '../utils/scenarios';

const FROM: Record<'off' | 'visible' | 'intent' | 'nav', Fixture> = {
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
  nav: { id: 'navigation/from-nav', path: '/navigation/from/nav/', sources: NAVIGATION_SOURCES },
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

const TO_TREE_ROUTE = 'navigation/to-tree/';

const TO_TREE_MODULE = 'src/routes/navigation/to-tree/index.tsx';

const TO_TREE_SOURCES = [
  'src/routes/navigation/to-tree/',
  'src/components/fixtures/navigation/nav-tree',
];

const LAYOUT_COMPONENT_SOURCES = [FILLER, 'src/components/sidebar/', 'src/routes/layout.tsx_'];

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
    expect(withNewPageChunks).toHaveLength(1);
  });

  test("a Link click requests the new page's chunks at the highest priority, not as speculative preloads", async ({
    page,
  }) => {
    await recordPreloadHints(page);
    const { gate } = await navigateToTree(FROM.off, 'cold', page);
    await releaseAll(gate);
    await expectResult(page, TO_TREE);
    const routeProbabilities = (await preloadHints(page))
      .filter(({ item }) => item === TO_TREE_ROUTE)
      .map(({ probability }) => probability);
    expect(routeProbabilities.length).toBeGreaterThan(0);
    expect(routeProbabilities.every((probability) => probability === 1)).toBe(true);
  });

  test('the new page shows in 2 round trips', async ({ page }) => {
    const { gate, roundTrips } = await navigateToTree(FROM.off, 'cold', page);
    await releaseAll(gate);
    await attachRoundTrips('round-trips.txt', roundTrips);
    expectRoundTrips(roundTrips);
  });

  test("the route's modules go out with the router's navigation code, one round trip after the click", async ({
    page,
  }) => {
    const { gate, roundTrips } = await navigateToTree(FROM.off, 'cold', page);
    await releaseAll(gate);
    const roundTripOf = (modulePath: string) =>
      roundTrips.findIndex((roundTrip) =>
        roundTrip.urls.some((url) => chunkHoldsModule(url, modulePath))
      );
    expect(roundTripOf('@qwik-router-config')).toBe(1);
    expect(roundTripOf('src/routes/layout.tsx')).toBe(1);
    expect(roundTripOf(TO_TREE_MODULE)).toBe(1);
  });

  test("a navigation to a page with the same layout fetches none of the layout's component chunks", async ({
    page,
  }) => {
    const { gate, roundTrips } = await navigateToTree(FROM.off, 'cold', page);
    const stillOngoing = gate.held.map((route) => route.request().url());
    await releaseAll(gate);
    const layoutComponentChunks = [
      ...roundTrips.flatMap((roundTrip) => roundTrip.urls),
      ...stillOngoing,
    ].filter((url) => chunkComesFrom(url, LAYOUT_COMPONENT_SOURCES));
    test.fail(
      true,
      "on main, the route's entry in the bundle graph lists the layout's module, so every chunk under the layout goes out at the highest priority"
    );
    expect(layoutComponentChunks).toEqual([]);
  });
});

const navigateToTreeWithNav = async (page: Page) => {
  const opened = await openFixture(page, FROM.nav, 'cold');
  const roundTrips = await countFixtureRoundTrips(
    opened,
    () => fixtureRoot(page, FROM.nav).locator('[data-testid=nav-tree]').click(),
    resultIsDone(fixtureResult(page, TO_TREE))
  );
  return { ...opened, roundTrips };
};

test.describe('cold navigation with nav()', () => {
  test("the new page's modules and render chunks go out in the same round trip", async ({
    page,
  }) => {
    const { gate, roundTrips } = await navigateToTreeWithNav(page);
    await releaseAll(gate);
    await expectResult(page, TO_TREE);
    const withNewPageChunks = roundTrips.filter((roundTrip) =>
      roundTrip.urls.some((url) => chunkComesFrom(url, TO_TREE_SOURCES))
    );
    expect(withNewPageChunks).toHaveLength(1);
  });

  test('the new page shows in 4 round trips, over the cap of 2', async ({ page }) => {
    const { gate, roundTrips } = await navigateToTreeWithNav(page);
    await releaseAll(gate);
    await attachRoundTrips('round-trips.txt', roundTrips);
    expectRoundTrips(roundTrips, {
      roundTrips: 4,
      reason:
        "over the cap on main: the handler, the router's navigation code, then the router config each cost a round trip before the new page's chunks",
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
    test.fail(
      true,
      "on main, the loader's paths come from the router config, which loads with the render chunks, so the data goes out a round trip later"
    );
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

test.describe('after a navigation', () => {
  test('the preloader keeps preloading speculatively', async ({ page }, testInfo) => {
    const { gate } = await navigateToTree(FROM.off, 'cold', page);
    await releaseAll(gate);
    const order = await recordSpeculativeOrder(page, gate);
    await testInfo.attach('order.txt', { body: order, contentType: 'text/plain' });
    expect(order.trim()).not.toBe('');
  });

  test("the old page's queued speculative preloads aren't sent", async ({ page }) => {
    const opened = await openFixture(page, FROM.off, 'cold');
    const linksBeforeTheClick = (await preloaderLinks(page)).length;
    await countFixtureRoundTrips(
      opened,
      () => treeLink(page, FROM.off).click(),
      resultIsDone(fixtureResult(page, TO_TREE))
    );
    await waitForNetworkIdle(page, () => releaseAll(opened.gate), 1500);
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
