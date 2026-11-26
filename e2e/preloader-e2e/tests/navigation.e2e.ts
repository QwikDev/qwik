import { expect, test, type Locator, type Page, type Route } from '@playwright/test';
import {
  bundleFile,
  chunkComesFrom,
  chunkKind,
  chunkHoldsModule,
  chunkHoldsSegmentsFrom,
  chunkUrlsFrom,
  getManifest,
} from '../utils/app';
import { attachRoundTrips, expectRoundTrips } from '../utils/click-tests';
import { NAVIGATION_SOURCES, type Fixture } from '../utils/fixtures';
import {
  collectUntilQuiet,
  countRoundTrips,
  createGate,
  FILLER,
  preloadHints,
  preloaderLinks,
  recordPreloadHints,
  recordSpeculativeOrder,
  recordSpeculativePreloads,
  release,
  releaseAll,
  resultIsDone,
  settle,
  waitForNetworkIdle,
  waitForQwikloader,
  type Gate,
  type RoundTrip,
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
const FROM_OFF_ROUTE = 'navigation/from/off/';

const TO_TREE_MODULE = 'src/routes/navigation/to-tree/index.tsx';

const TO_TREE_SOURCES = [
  'src/routes/navigation/to-tree/',
  'src/components/fixtures/navigation/nav-tree',
];

const LAYOUT_COMPONENT_SOURCES = [FILLER, 'src/components/sidebar/', 'src/routes/layout.tsx_'];
const SHELL_LAYOUT_SOURCES = [
  'src/routes/navigation/shell/layout.tsx_',
  'src/components/fixtures/navigation/shell-',
];
const DOCS_LAYOUT_SOURCES = [
  'src/routes/navigation/shell/docs/layout.tsx_',
  'src/components/fixtures/navigation/docs-sidebar.tsx',
];
const BY_URL_LAYOUT_SOURCES = [
  'src/routes/navigation/by-url/layout.tsx_',
  'src/components/fixtures/navigation/by-url-links.tsx',
  'src/components/fixtures/navigation/url-banner.tsx',
];
const NAV_PAGE = 'src/components/fixtures/navigation/nav-page.tsx';

const navPage = (name: string, route: string): Fixture & { pageSources: string[] } => ({
  id: `navigation/${name}`,
  path: `/navigation/${route}/`,
  sources: NAVIGATION_SOURCES,
  pageSources: [`src/routes/navigation/${route}/`, NAV_PAGE],
});
const SHELL_HOME = navPage('shell-home', 'shell/home');
const DOCS_A = navPage('shell-docs-a', 'shell/docs/a');
const DOCS_B = navPage('shell-docs-b', 'shell/docs/b');
const BY_URL_A = navPage('by-url-a', 'by-url/a');
const BY_URL_B = navPage('by-url-b', 'by-url/b');
const CHAIN_A = navPage('chain-a', 'chain/a');
const CHAIN_B = navPage('chain-b', 'chain/b');
const CHAIN_C = navPage('chain-c', 'chain/c');
const CYCLE_A = navPage('cycle-a', 'cycle/a');
const CYCLE_B = navPage('cycle-b', 'cycle/b');
const PRODUCT: Fixture = {
  id: 'navigation/product',
  path: '/navigation/product/1/',
  sources: NAVIGATION_SOURCES,
};

const shellControl = (page: Page, testId: string) =>
  page.locator(`[data-fixture="navigation/shell"] [data-testid=${testId}]`);

const holdsLayoutSegments = (sources: string[]) => (url: string) =>
  chunkHoldsSegmentsFrom(url, sources);

const holdsPageChunk = (to: { pageSources: string[] }) => (url: string) =>
  chunkComesFrom(url, [to.pageSources[0]]);

const isRouterConfig = (url: string) => chunkHoldsModule(url, '@qwik-router-config');

const isRouterNavigationCode = (url: string) =>
  !!getManifest().bundles[bundleFile(url)]?.origins?.some((origin) =>
    origin.includes('_useQwikRouter_goto_')
  );

const roundTripOf = (roundTrips: RoundTrip[], isWanted: (url: string) => boolean) =>
  roundTrips.findIndex((roundTrip) => roundTrip.urls.some(isWanted));

const roundTripsOf = (roundTrips: RoundTrip[], isWanted: (url: string) => boolean) =>
  roundTrips.flatMap(({ urls }, index) => (urls.some(isWanted) ? [index] : []));

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
    const routePriorities = (await preloadHints(page))
      .filter(({ item }) => [item].flat().includes(TO_TREE_ROUTE))
      .map(({ priority }) => priority);
    expect(routePriorities.length).toBeGreaterThan(0);
    expect(routePriorities.every((priority) => priority === 1)).toBe(true);
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
    const roundTripOfModule = (modulePath: string) =>
      roundTripOf(roundTrips, (url) => chunkHoldsModule(url, modulePath));
    expect(roundTripOf(roundTrips, isRouterNavigationCode)).toBe(1);
    expect(roundTripOfModule('src/routes/layout.tsx')).toBe(1);
    expect(roundTripOfModule(TO_TREE_MODULE)).toBe(1);
  });

  test("the router config goes out with the Link's click handler", async ({ page }) => {
    const { gate, roundTrips } = await navigateToTree(FROM.off, 'cold', page);
    await releaseAll(gate);
    expect(roundTripOf(roundTrips, isRouterConfig)).toBe(0);
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
    ].filter(holdsLayoutSegments(LAYOUT_COMPONENT_SOURCES));
    expect(layoutComponentChunks).toEqual([]);
  });
});

const navigateFrom = async (
  page: Page,
  from: Fixture,
  startNavigation: () => Promise<unknown>,
  isShown: () => Promise<boolean>
) => {
  const opened = await openFixture(page, from, 'cold');
  const roundTrips = await countFixtureRoundTrips(opened, startNavigation, isShown);
  const stillOngoing = opened.gate.held.map((route) => route.request().url());
  await releaseAll(opened.gate);
  return {
    roundTrips,
    fetched: [...roundTrips.flatMap((roundTrip) => roundTrip.urls), ...stillOngoing],
  };
};

const isShown = (page: Page, to: Fixture) => resultIsDone(fixtureResult(page, to));

const DOCUMENT_HEAD = 'src/components/router-head/';

const segmentsNotFromThePage = (fetched: string[], pageSources: string[]) =>
  fetched.filter(
    (url) =>
      chunkHoldsSegmentsFrom(url, ['src/']) && !chunkComesFrom(url, [...pageSources, DOCUMENT_HEAD])
  );

test.describe('cold navigation into another layout', () => {
  const navigateIntoDocs = (page: Page) =>
    navigateFrom(
      page,
      SHELL_HOME,
      () => shellControl(page, 'link-docs-a').click(),
      isShown(page, DOCS_A)
    );

  test("the new layout's chunks go out in the same round trip as the page's", async ({ page }) => {
    const { roundTrips } = await navigateIntoDocs(page);
    const pageRoundTrip = roundTripOf(roundTrips, holdsPageChunk(DOCS_A));
    expect(pageRoundTrip).toBeGreaterThanOrEqual(0);
    expect(roundTripsOf(roundTrips, holdsLayoutSegments(DOCS_LAYOUT_SOURCES))).toEqual([
      pageRoundTrip,
    ]);
  });

  test('none of the layouts the two pages share is fetched', async ({ page }) => {
    const { fetched } = await navigateIntoDocs(page);
    const sharedLayoutChunks = fetched.filter(
      holdsLayoutSegments([...LAYOUT_COMPONENT_SOURCES, ...SHELL_LAYOUT_SOURCES])
    );
    expect(sharedLayoutChunks).toEqual([]);
  });

  test('the new page shows in 2 round trips', async ({ page }) => {
    const { roundTrips } = await navigateIntoDocs(page);
    await attachRoundTrips('round-trips.txt', roundTrips);
    expectRoundTrips(roundTrips);
  });
});

test.describe('cold navigation that needs no new layout', () => {
  test("to a sibling page under the same nested layout: only the page's chunks are fetched", async ({
    page,
  }) => {
    const { fetched } = await navigateFrom(
      page,
      DOCS_A,
      () => shellControl(page, 'link-docs-b').click(),
      isShown(page, DOCS_B)
    );
    expect(fetched.some(holdsPageChunk(DOCS_B))).toBe(true);
    expect(segmentsNotFromThePage(fetched, DOCS_B.pageSources)).toEqual([]);
  });

  test("from a nested layout up to its parent's page: only the page's chunks are fetched", async ({
    page,
  }) => {
    const { fetched } = await navigateFrom(
      page,
      DOCS_A,
      () => shellControl(page, 'link-home').click(),
      isShown(page, SHELL_HOME)
    );
    expect(fetched.some(holdsPageChunk(SHELL_HOME))).toBe(true);
    expect(segmentsNotFromThePage(fetched, SHELL_HOME.pageSources)).toEqual([]);
  });

  test("to the same route with another param: only the page's chunks are fetched", async ({
    page,
  }) => {
    const { fetched } = await navigateFrom(
      page,
      PRODUCT,
      () => fixtureRoot(page, PRODUCT).locator('[data-testid=link-product-2]').click(),
      async () => (await fixtureResult(page, PRODUCT).textContent())?.trim() === '2'
    );
    expect(segmentsNotFromThePage(fetched, ['src/routes/navigation/product/'])).toEqual([]);
  });
});

const onwardLink = (page: Page, from: Fixture) =>
  fixtureRoot(page, from).locator('[data-testid=link-on]');

type PreloadAndWhetherBShowed = { href: string; wasBShown: boolean };
type WindowWithPreloads = Window & { __preloadsAndWhetherBShowed?: PreloadAndWhetherBShowed[] };

const recordWhetherBShowsAtEachPreload = (page: Page) =>
  page.addInitScript((shownResultOfB) => {
    const preloads: PreloadAndWhetherBShowed[] = [];
    (window as WindowWithPreloads).__preloadsAndWhetherBShowed = preloads;
    new MutationObserver((records) => {
      for (const record of records) {
        record.addedNodes.forEach((node) => {
          if (node instanceof HTMLLinkElement && /preload/i.test(node.rel)) {
            const resultOfB = document.querySelector(shownResultOfB);
            preloads.push({ href: node.href, wasBShown: !!resultOfB?.checkVisibility() });
          }
        });
      }
    }).observe(document, { childList: true, subtree: true });
  }, `[data-fixture="${CHAIN_B.id}"] [data-testid=result][data-done]`);

const preloadsAndWhetherBShowed = (page: Page) =>
  page.evaluate(() => (window as WindowWithPreloads).__preloadsAndWhetherBShowed ?? []);

test.describe('navigation to a page that links on to a third page', () => {
  const navigateFromAToB = (page: Page) =>
    navigateFrom(page, CHAIN_A, () => onwardLink(page, CHAIN_A).click(), isShown(page, CHAIN_B));

  test("a click on A's Link fetches B's chunks and none of C's", async ({ page }) => {
    const { fetched } = await navigateFromAToB(page);
    expect(fetched.some(holdsPageChunk(CHAIN_B))).toBe(true);
    expect(fetched.filter(holdsPageChunk(CHAIN_C))).toEqual([]);
    expect(segmentsNotFromThePage(fetched, CHAIN_B.pageSources)).toEqual([]);
  });

  test("C's chunks are only preloaded once B shows, and never at the highest priority", async ({
    page,
  }) => {
    await recordWhetherBShowsAtEachPreload(page);
    const opened = await openFixture(page, CHAIN_A, 'warm');
    await countFixtureRoundTrips(
      opened,
      () => onwardLink(page, CHAIN_A).click(),
      isShown(page, CHAIN_B)
    );
    await waitForNetworkIdle(page, () => releaseAll(opened.gate));

    const preloadsOfC = (await preloadsAndWhetherBShowed(page)).filter(({ href }) =>
      holdsPageChunk(CHAIN_C)(href)
    );
    const linksToC = (await preloaderLinks(page)).filter((link) =>
      holdsPageChunk(CHAIN_C)(link.href)
    );
    expect(preloadsOfC.length).toBeGreaterThan(0);
    expect(preloadsOfC.filter(({ wasBShown }) => !wasBShown)).toEqual([]);
    expect(linksToC.filter((link) => !link.speculative)).toEqual([]);
  });

  test('the new page shows in 2 round trips', async ({ page }) => {
    const { roundTrips } = await navigateFromAToB(page);
    await attachRoundTrips('round-trips.txt', roundTrips);
    expectRoundTrips(roundTrips);
  });
});

test.describe('navigation to a page that links back', () => {
  test("a click on A's Link fetches B's chunks and none of A's", async ({ page }) => {
    const { fetched } = await navigateFrom(
      page,
      CYCLE_A,
      () => onwardLink(page, CYCLE_A).click(),
      isShown(page, CYCLE_B)
    );
    expect(fetched.some(holdsPageChunk(CYCLE_B))).toBe(true);
    expect(fetched.filter(holdsPageChunk(CYCLE_A))).toEqual([]);
    expect(segmentsNotFromThePage(fetched, CYCLE_B.pageSources)).toEqual([]);
  });

  test("clicking B's Link back fetches A's chunks and none of B's", async ({ page }) => {
    const opened = await openFixture(page, CYCLE_A, 'cold');
    await countFixtureRoundTrips(
      opened,
      () => onwardLink(page, CYCLE_A).click(),
      isShown(page, CYCLE_B)
    );
    await release(opened.gate.held.splice(0));
    const roundTrips = await countFixtureRoundTrips(
      opened,
      () => onwardLink(page, CYCLE_B).click(),
      isShown(page, CYCLE_A)
    );
    const stillOngoing = opened.gate.held.map((route) => route.request().url());
    await releaseAll(opened.gate);
    const fetched = [...roundTrips.flatMap((roundTrip) => roundTrip.urls), ...stillOngoing];
    expect(fetched.some(holdsPageChunk(CYCLE_A))).toBe(true);
    expect(fetched.filter(holdsPageChunk(CYCLE_B))).toEqual([]);
    expect(segmentsNotFromThePage(fetched, CYCLE_A.pageSources)).toEqual([]);
  });
});

test.describe('Link kept on screen across a navigation', () => {
  test("a Link drawn on a page that had the target's layout, clicked from a page that doesn't: the layout's chunks go out with the page's", async ({
    page,
  }) => {
    const opened = await openFixture(page, DOCS_A, 'cold');
    await countFixtureRoundTrips(
      opened,
      () => shellControl(page, 'link-home').click(),
      isShown(page, SHELL_HOME)
    );
    await release(opened.gate.held.splice(0));
    const roundTrips = await countFixtureRoundTrips(
      opened,
      () => shellControl(page, 'link-docs-b-visible').click(),
      isShown(page, DOCS_B)
    );
    await releaseAll(opened.gate);
    const pageRoundTrip = roundTripOf(roundTrips, holdsPageChunk(DOCS_B));
    expect(pageRoundTrip).toBeGreaterThanOrEqual(0);
    expect(roundTripsOf(roundTrips, holdsLayoutSegments(DOCS_LAYOUT_SOURCES))).toEqual([
      pageRoundTrip,
    ]);
  });
});

test.describe('layout that renders from the URL', () => {
  test('the new page shows in 3 round trips, over the cap of 2', async ({ page }) => {
    const { roundTrips } = await navigateFrom(
      page,
      BY_URL_A,
      () => page.locator('[data-testid=link-by-url-b]').click(),
      isShown(page, BY_URL_B)
    );
    await attachRoundTrips('round-trips.txt', roundTrips);
    expectRoundTrips(roundTrips, {
      roundTrips: 3,
      reason:
        'over the cap on main: a layout both pages share runs again when the URL changes, and its chunk is only requested then',
    });
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

  test("the router config goes out with the router's navigation code", async ({ page }) => {
    const { gate, roundTrips } = await navigateToTreeWithNav(page);
    await releaseAll(gate);
    const navigationCodeRoundTrip = roundTripOf(roundTrips, isRouterNavigationCode);
    expect(navigationCodeRoundTrip).toBeGreaterThanOrEqual(0);
    expect(roundTripOf(roundTrips, isRouterConfig)).toBe(navigationCodeRoundTrip);
  });

  test("into another layout: the new layout's chunks go out with the page's", async ({ page }) => {
    const { roundTrips } = await navigateFrom(
      page,
      SHELL_HOME,
      () => shellControl(page, 'nav-docs-a').click(),
      isShown(page, DOCS_A)
    );
    const pageRoundTrip = roundTripOf(roundTrips, holdsPageChunk(DOCS_A));
    expect(pageRoundTrip).toBeGreaterThanOrEqual(0);
    expect(roundTripsOf(roundTrips, holdsLayoutSegments(DOCS_LAYOUT_SOURCES))).toEqual([
      pageRoundTrip,
    ]);
  });

  test('the new page shows in 3 round trips, over the cap of 2', async ({ page }) => {
    const { gate, roundTrips } = await navigateToTreeWithNav(page);
    await releaseAll(gate);
    await attachRoundTrips('round-trips.txt', roundTrips);
    expectRoundTrips(roundTrips, {
      roundTrips: 3,
      reason:
        "over the cap on main: the handler, then the router's navigation code, each cost a round trip before the new page's chunks",
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
    test.fail(true, "on main, the router's navigation code (useQwikRouter) is never preloaded");
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
      "on main, the router's navigation code fetches the loader's data, and it loads with the render chunks, so the data goes out a round trip later"
    );
    expect(dataRoundTrip).toBe(renderRoundTrip);
  });
});

test.describe('Link that prefetches when visible', () => {
  test("a Link to a page under another layout: that layout's chunks are preloaded before any click", async ({
    page,
  }) => {
    const requests: string[] = [];
    page.on('request', (request) => requests.push(request.url()));
    const { gate } = await openFixture(page, SHELL_HOME, 'warm');
    await releaseAll(gate);
    expect(requests.some(holdsPageChunk(DOCS_B))).toBe(true);
    expect(requests.some(holdsLayoutSegments(DOCS_LAYOUT_SOURCES))).toBe(true);
  });
});

test.describe('Link that prefetches when visible', () => {
  test("the new page's components are preloaded before its tasks and computeds", async ({
    page,
  }) => {
    const { gate } = await openFixture(page, FROM.visible, 'warm');
    await releaseAll(gate);
    const kinds = (await preloaderLinks(page))
      .filter((link) => link.speculative && chunkComesFrom(link.href, TO_TREE_SOURCES))
      .map((link) => chunkKind(link.href));
    const lastComponent = kinds.lastIndexOf('component');
    const firstOtherQrl = kinds.indexOf('other-qrl');
    expect(lastComponent).toBeGreaterThanOrEqual(0);
    expect(firstOtherQrl).toBeGreaterThanOrEqual(0);
    expect(lastComponent).toBeLessThan(firstOtherQrl);
  });
});

test.describe('hover on a Link that prefetches on intent', () => {
  test("the new route's chunks are requested", async ({ page }) => {
    const { gate } = await openFixture(page, FROM.intent, 'cold');
    const urls = await collectUntilQuiet(page, gate, () => treeLink(page, FROM.intent).hover());
    await releaseAll(gate);
    expect(urls.some((url) => chunkComesFrom(url, TO_TREE_SOURCES))).toBe(true);
  });

  test("a Link to a page under another layout: that layout's chunks are requested too", async ({
    page,
  }) => {
    const { gate } = await openFixture(page, SHELL_HOME, 'warm');
    const urls = await collectUntilQuiet(page, gate, () =>
      shellControl(page, 'link-by-url-a-intent').hover()
    );
    await releaseAll(gate);
    expect(urls.some(holdsLayoutSegments(BY_URL_LAYOUT_SOURCES))).toBe(true);
  });
});

const SPECULATIVE_PRIORITY = 0.9;

const navigateToTreeWithOldPageWorkQueued = async (page: Page) => {
  const oldPageChunks = OLD_PAGE_SOURCES.flatMap(chunkUrlsFrom);
  await page.addInitScript(
    ([bundles, priority]) => {
      (window as any).qPreloadQueue = bundles.map((bundle) => [bundle, priority]);
    },
    [oldPageChunks.map(bundleFile), SPECULATIVE_PRIORITY] as const
  );
  await recordSpeculativePreloads(page);
  const gate = await createGate(page);
  gate.holdWhilePassing = (url) => oldPageChunks.includes(url);
  await page.goto(FROM.off.path);
  await waitForQwikloader(page);
  await expect.poll(() => gate.held.length, { timeout: 15_000 }).toBe(1);
  const heldUrl = gate.held[0].request().url();
  gate.holdWhilePassing = undefined;
  gate.mode = 'hold';
  await settle(page, gate);
  const links = await preloaderLinks(page);
  expect(links.find((link) => link.href === heldUrl)?.speculative).toBe(true);
  const preloaded = new Set(links.map((link) => link.href));
  const hintedButNotYetPreloaded = oldPageChunks.filter((url) => !preloaded.has(url));
  expect(hintedButNotYetPreloaded.length).toBeGreaterThan(0);
  const linksBeforeTheClick = links.length;
  await countRoundTrips(
    page,
    gate,
    () => treeLink(page, FROM.off).click(),
    resultIsDone(fixtureResult(page, TO_TREE))
  );
  return { gate, linksBeforeTheClick };
};

test.describe('after a navigation', () => {
  test('the preloader keeps preloading speculatively', async ({ page }, testInfo) => {
    const { gate } = await navigateToTreeWithOldPageWorkQueued(page);
    await releaseAll(gate);
    const order = await recordSpeculativeOrder(page, gate);
    await testInfo.attach('order.txt', { body: order, contentType: 'text/plain' });
    expect(order.trim()).not.toBe('');
  });

  test("the old page's queued speculative preloads aren't sent", async ({ page }) => {
    const { gate, linksBeforeTheClick } = await navigateToTreeWithOldPageWorkQueued(page);
    await waitForNetworkIdle(page, () => releaseAll(gate), 1500);
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
  test('after a navigation, the page the user left is preloaded as a page to render', async ({
    page,
  }) => {
    await recordPreloadHints(page);
    const { gate } = await navigateToTree(FROM.off, 'cold', page);
    await releaseAll(gate);
    await expectResult(page, TO_TREE);
    const hintsForThePageLeft = (await preloadHints(page)).filter(({ item }) =>
      [item].flat().includes(FROM_OFF_ROUTE)
    );
    expect(hintsForThePageLeft).toEqual([
      { item: [FROM_OFF_ROUTE], priority: 0.6, isPageToRender: true },
    ]);
  });

  test('the previous page shows with no JS request', async ({ page }) => {
    const { gate } = await navigateToTree(FROM.visible, 'warm', page);
    await waitForNetworkIdle(page, () => releaseAll(gate));
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
  test("the action's result shows in 5 round trips, over the cap of 2", async ({ page }) => {
    const roundTrips = await submitAction(page);
    await attachRoundTrips('round-trips.txt', roundTrips);
    expectRoundTrips(roundTrips, {
      roundTrips: 5,
      reason: 'over the cap on main: the action request waits for 4 round trips of router code',
    });
  });
});

const TO_SMALL: Fixture = {
  id: 'navigation/to-small',
  path: '/navigation/to-small/',
  sources: ['src/routes/navigation/to-small/'],
  expected: 'small',
};
const TO_SMALL_ROUTE = 'navigation/to-small/';

const smallLink = (page: Page, from: Fixture) =>
  fixtureRoot(page, from).locator('[data-testid=link-small]');

const dataLink = (page: Page, from: Fixture) =>
  fixtureRoot(page, from).locator('[data-testid=link-data]');

const isChunkOfTheTreePage = (url: string) => chunkComesFrom(url, TO_TREE_SOURCES);

const isLoaderData = (url: string) => new URL(url).pathname.includes('/q-loader-');

const pathOf = (page: Page) => new URL(page.url()).pathname;

type WindowWithShownFixtures = Window & { __shownFixtures?: string[] };

const recordShownFixtures = (page: Page) =>
  page.addInitScript(() => {
    const shown: string[] = ((window as WindowWithShownFixtures).__shownFixtures = []);
    new MutationObserver(() => {
      document.querySelectorAll('[data-fixture]').forEach((fixture) => {
        const id = fixture.getAttribute('data-fixture')!;
        const result = fixture.querySelector('[data-testid=result][data-done]');
        if (result?.checkVisibility() && !shown.includes(id)) {
          shown.push(id);
        }
      });
    }).observe(document, { childList: true, subtree: true, attributes: true });
  });

const shownFixtures = (page: Page) =>
  page.evaluate(() => (window as WindowWithShownFixtures).__shownFixtures ?? []);

const recordRequests = (page: Page) => {
  const requested: string[] = [];
  page.on('request', (request) => requested.push(request.url()));
  return requested;
};

const requestedMoreThanOnce = (urls: string[]) => [
  ...new Set(urls.filter((url, index) => urls.indexOf(url) !== index)),
];

type OngoingRequests = { routes: Route[]; release: () => Promise<void> };

const keepOngoing = async (page: Page, isKept: (url: string) => boolean) => {
  let isKeeping = true;
  const ongoing: OngoingRequests = {
    routes: [],
    release: async () => {
      isKeeping = false;
      await release(ongoing.routes.splice(0));
    },
  };
  await page.route(
    (url) => isKept(url.href),
    (route) => {
      if (!isKeeping) {
        return route.fallback();
      }
      ongoing.routes.push(route);
    }
  );
  return ongoing;
};

const startAndKeepOngoing = async (
  page: Page,
  from: Fixture,
  start: () => Promise<unknown>,
  isKept: (url: string) => boolean
) => {
  await recordShownFixtures(page);
  const opened = await openFixture(page, from, 'cold');
  const requested = recordRequests(page);
  const ongoing = await keepOngoing(page, isKept);
  await collectUntilQuiet(page, opened.gate, start);
  expect(ongoing.routes.length).toBeGreaterThan(0);
  return { ...opened, ongoing, requested };
};

const releaseEverything = (page: Page, gate: Gate, ongoing?: OngoingRequests) =>
  waitForNetworkIdle(page, async () => {
    await ongoing?.release();
    await releaseAll(gate);
  });

test.describe("a second Link click before the first click's chunks arrive", () => {
  const clickTheTreeLinkThenTheSmallLink = async (page: Page) => {
    await recordShownFixtures(page);
    const opened = await openFixture(page, FROM.off, 'cold');
    await treeLink(page, FROM.off).click();
    const roundTrips = await countFixtureRoundTrips(
      opened,
      () => smallLink(page, FROM.off).click(),
      isShown(page, TO_SMALL)
    );
    return { ...opened, roundTrips };
  };

  test('the second page shows, and the first never does', async ({ page }) => {
    const { gate } = await clickTheTreeLinkThenTheSmallLink(page);
    await releaseEverything(page, gate);
    await expectResult(page, TO_SMALL);
    expect(pathOf(page)).toBe(TO_SMALL.path);
    const shown = await shownFixtures(page);
    expect(shown).toContain(TO_SMALL.id);
    expect(shown).not.toContain(TO_TREE.id);
  });

  test('the second page shows in 2 round trips', async ({ page }) => {
    const { gate, roundTrips } = await clickTheTreeLinkThenTheSmallLink(page);
    await releaseAll(gate);
    await attachRoundTrips('round-trips.txt', roundTrips);
    expectRoundTrips(roundTrips);
  });
});

test.describe("a second Link click while the first page's chunks are ongoing", () => {
  const clickTheSmallLinkWhileTheTreePageLoads = async (page: Page) => {
    const started = await startAndKeepOngoing(
      page,
      FROM.off,
      () => treeLink(page, FROM.off).click(),
      isChunkOfTheTreePage
    );
    const roundTrips = await countFixtureRoundTrips(
      started,
      () => smallLink(page, FROM.off).click(),
      isShown(page, TO_SMALL)
    );
    return { ...started, roundTrips };
  };

  test('the second page shows, and the first never does once its chunks arrive', async ({
    page,
  }) => {
    const { gate, ongoing } = await clickTheSmallLinkWhileTheTreePageLoads(page);
    await releaseEverything(page, gate, ongoing);
    await expectResult(page, TO_SMALL);
    expect(pathOf(page)).toBe(TO_SMALL.path);
    const shown = await shownFixtures(page);
    expect(shown).toContain(TO_SMALL.id);
    expect(shown).not.toContain(TO_TREE.id);
  });

  test("the second page shows in 1 round trip, without the first page's chunks", async ({
    page,
  }) => {
    const { gate, ongoing, roundTrips } = await clickTheSmallLinkWhileTheTreePageLoads(page);
    const stillOngoing = ongoing.routes.length;
    await releaseEverything(page, gate, ongoing);
    await attachRoundTrips('round-trips.txt', roundTrips);
    expect(stillOngoing).toBeGreaterThan(0);
    expect(roundTrips).toHaveLength(1);
  });

  test("the second page's chunks are requested at the highest priority", async ({ page }) => {
    await recordPreloadHints(page);
    const { gate, ongoing } = await clickTheSmallLinkWhileTheTreePageLoads(page);
    await releaseEverything(page, gate, ongoing);
    const routePriorities = (await preloadHints(page))
      .filter(({ item }) => [item].flat().includes(TO_SMALL_ROUTE))
      .map(({ priority }) => priority);
    expect(routePriorities.length).toBeGreaterThan(0);
    expect(routePriorities.every((priority) => priority === 1)).toBe(true);
  });

  test('a chunk both pages need is requested once', async ({ page }) => {
    const isChunkOfDocsA = (url: string) =>
      holdsPageChunk(DOCS_A)(url) || holdsLayoutSegments(DOCS_LAYOUT_SOURCES)(url);
    const { gate, ongoing, requested } = await startAndKeepOngoing(
      page,
      SHELL_HOME,
      () => shellControl(page, 'link-docs-a').click(),
      isChunkOfDocsA
    );
    await collectUntilQuiet(page, gate, () => shellControl(page, 'link-docs-b').click());
    await releaseEverything(page, gate, ongoing);
    await expectResult(page, DOCS_B);
    const docsLayoutChunks = requested.filter(holdsLayoutSegments(DOCS_LAYOUT_SOURCES));
    expect(docsLayoutChunks.length).toBeGreaterThan(0);
    expect(requestedMoreThanOnce(docsLayoutChunks)).toEqual([]);
  });
});

test.describe('the same Link clicked twice', () => {
  const clickTwice = async (
    page: Page,
    link: (page: Page, from: Fixture) => Locator,
    to: Fixture
  ) => {
    const opened = await openFixture(page, FROM.off, 'cold');
    const requested = recordRequests(page);
    await link(page, FROM.off).click();
    const roundTrips = await countFixtureRoundTrips(
      opened,
      () => link(page, FROM.off).click(),
      isShown(page, to)
    );
    await releaseEverything(page, opened.gate);
    await expectResult(page, to);
    return { roundTrips, requested };
  };

  test('no chunk is requested twice', async ({ page }) => {
    const { requested } = await clickTwice(page, treeLink, TO_TREE);
    expect(requestedMoreThanOnce(requested)).toEqual([]);
  });

  test('the page shows in 2 round trips', async ({ page }) => {
    const { roundTrips } = await clickTwice(page, treeLink, TO_TREE);
    await attachRoundTrips('round-trips.txt', roundTrips);
    expectRoundTrips(roundTrips);
  });

  test("a Link to a page with a routeLoader$: the loader's data is requested once", async ({
    page,
  }) => {
    const { requested } = await clickTwice(page, dataLink, TO_DATA);
    expect(requested.filter(isLoaderData)).toHaveLength(1);
  });
});

test.describe('back button before the new page shows', () => {
  const goBackWhileTheTreePageLoads = async (page: Page) => {
    const started = await startAndKeepOngoing(
      page,
      FROM.off,
      () => treeLink(page, FROM.off).click(),
      isChunkOfTheTreePage
    );
    const urls = await collectUntilQuiet(page, started.gate, () => page.goBack());
    return { ...started, urls };
  };

  test('the page the user came from stays, with no JS request', async ({ page }) => {
    const { gate, ongoing, urls } = await goBackWhileTheTreePageLoads(page);
    await expect(treeLink(page, FROM.off)).toBeVisible();
    expect(pathOf(page)).toBe(FROM.off.path);
    await releaseEverything(page, gate, ongoing);
    test.fail(
      true,
      'on main, going back renders the page again on the client, though it never left the screen, and fetches its chunks'
    );
    expect(urls.filter((url) => new URL(url).pathname.endsWith('.js'))).toEqual([]);
  });

  test('the new page never shows once its chunks arrive', async ({ page }) => {
    const { gate, ongoing } = await goBackWhileTheTreePageLoads(page);
    await releaseEverything(page, gate, ongoing);
    await expect(treeLink(page, FROM.off)).toBeVisible();
    expect(pathOf(page)).toBe(FROM.off.path);
    expect(await shownFixtures(page)).not.toContain(TO_TREE.id);
  });
});

test.describe("a Link click while another Link's prefetch is ongoing", () => {
  const clickTheSmallLinkWhileTheTreePagePrefetches = async (page: Page) => {
    const started = await startAndKeepOngoing(
      page,
      FROM.intent,
      () => treeLink(page, FROM.intent).hover(),
      isChunkOfTheTreePage
    );
    const roundTrips = await countFixtureRoundTrips(
      started,
      () => smallLink(page, FROM.intent).click(),
      isShown(page, TO_SMALL)
    );
    return { ...started, roundTrips };
  };

  test("the clicked page's chunks are requested at the highest priority", async ({ page }) => {
    await recordPreloadHints(page);
    const { gate, ongoing } = await clickTheSmallLinkWhileTheTreePagePrefetches(page);
    await releaseEverything(page, gate, ongoing);
    const routePriorities = (await preloadHints(page))
      .filter(({ item }) => [item].flat().includes(TO_SMALL_ROUTE))
      .map(({ priority }) => priority);
    expect(routePriorities).toContain(1);
  });

  test("the clicked page shows in 1 round trip, without the prefetched page's chunks", async ({
    page,
  }) => {
    const { gate, ongoing, roundTrips } = await clickTheSmallLinkWhileTheTreePagePrefetches(page);
    const stillOngoing = ongoing.routes.length;
    await releaseEverything(page, gate, ongoing);
    await attachRoundTrips('round-trips.txt', roundTrips);
    expect(stillOngoing).toBeGreaterThan(0);
    expect(roundTrips).toHaveLength(1);
  });
});

test.describe('a Link click while its own prefetch is ongoing', () => {
  test('none of its chunks is requested twice', async ({ page }) => {
    const { gate, ongoing, requested } = await startAndKeepOngoing(
      page,
      FROM.intent,
      () => treeLink(page, FROM.intent).hover(),
      isChunkOfTheTreePage
    );
    await collectUntilQuiet(page, gate, () => treeLink(page, FROM.intent).click());
    await releaseEverything(page, gate, ongoing);
    await expectResult(page, TO_TREE);
    const chunksOfTheTreePage = requested.filter(isChunkOfTheTreePage);
    expect(chunksOfTheTreePage.length).toBeGreaterThan(0);
    expect(requestedMoreThanOnce(chunksOfTheTreePage)).toEqual([]);
  });
});

test.describe('a second Link click before a routeLoader$ page shows', () => {
  const clickTheSmallLinkWhileTheLoaderDataLoads = async (page: Page) => {
    const started = await startAndKeepOngoing(
      page,
      FROM.off,
      () => dataLink(page, FROM.off).click(),
      isLoaderData
    );
    await collectUntilQuiet(page, started.gate, () => smallLink(page, FROM.off).click());
    return started;
  };

  test("the second page shows while the loader's data is ongoing", async ({ page }) => {
    const { gate, ongoing } = await clickTheSmallLinkWhileTheLoaderDataLoads(page);
    const stillOngoing = ongoing.routes.length;
    const isSecondPageShown = await isShown(page, TO_SMALL)();
    await releaseEverything(page, gate, ongoing);
    expect(stillOngoing).toBeGreaterThan(0);
    expect(isSecondPageShown).toBe(true);
  });

  test("the loader's late data doesn't restore the superseded page", async ({ page }) => {
    const { gate, ongoing } = await clickTheSmallLinkWhileTheLoaderDataLoads(page);
    const stillOngoing = ongoing.routes.length;
    await releaseEverything(page, gate, ongoing);
    expect(stillOngoing).toBeGreaterThan(0);
    await expectResult(page, TO_SMALL);
    await expect(fixtureRoot(page, TO_DATA)).toBeHidden();
    expect(pathOf(page)).toBe(TO_SMALL.path);
  });
});
