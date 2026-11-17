import { expect, test, type Page, type Request } from '@playwright/test';
import {
  chunkComesFrom,
  chunkHoldsModule,
  chunkHoldsSegmentsFrom,
  getManifest,
  ORIGIN,
} from '../utils/app';
import {
  fixtureById,
  NAVIGATION_SOURCES,
  SHARED_HELPER,
  STREAMING,
  type Fixture,
} from '../utils/fixtures';
import {
  chunksHintedAtHighestPriority,
  countRoundTrips,
  createGate,
  preloaderLinks,
  recordPreloadHints,
  recordSpeculativePreloads,
  releaseAll,
  resultIsDone,
  waitForNetworkIdle,
  waitForQwikloader,
  withoutSpeculativePreloads,
  type RoundTrip,
} from '../utils/gate';
import { attachRoundTrips, expectRoundTrips } from '../utils/click-tests';
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

const SHELL_HOME: Fixture = {
  id: 'navigation/shell-home',
  path: '/navigation/shell/home/',
  sources: NAVIGATION_SOURCES,
};
const SHELL_DOCS_A: Fixture = {
  id: 'navigation/shell-docs-a',
  path: '/navigation/shell/docs/a/',
  sources: NAVIGATION_SOURCES,
};
const DOCS_LAYOUT_SOURCES = [
  'src/routes/navigation/shell/docs/layout.tsx_',
  'src/components/fixtures/navigation/docs-sidebar.tsx',
];

const coreUrl = () => `${ORIGIN}/build/${getManifest().core}`;
const preloaderUrl = () => `${ORIGIN}/build/${getManifest().preloader}`;
const bundleGraphUrl = () => `${ORIGIN}/${getManifest().bundleGraphAsset}`;

const QUIET_MS = 500;

const clickWhileLoading = async (
  page: Page,
  heldUrls: string[],
  trigger: () => Promise<unknown>,
  result: Fixture,
  {
    onceTheRestHasLoaded = false,
    arrivesWithTheFirstRoundTrip = false,
    from = result === TO_TREE ? FROM_OFF : result,
    withSpeculativePreloads = false,
  } = {}
) => {
  await recordSpeculativePreloads(page);
  const gate = await createGate(page);
  gate.holdWhilePassing = (url) => heldUrls.includes(url);
  const loading = new Set<Request>();
  let lastActivity = Date.now();
  const onRequest = (request: Request) => {
    lastActivity = Date.now();
    if (!heldUrls.includes(request.url())) {
      loading.add(request);
    }
  };
  const onDone = (request: Request) => {
    lastActivity = Date.now();
    loading.delete(request);
  };
  page.on('request', onRequest);
  page.on('requestfinished', onDone);
  page.on('requestfailed', onDone);
  await page.goto(withSpeculativePreloads ? from.path : withoutSpeculativePreloads(from.path), {
    waitUntil: 'commit',
  });
  await waitForQwikloader(page);
  await expect.poll(() => gate.held.length).toBe(heldUrls.length);
  if (onceTheRestHasLoaded) {
    await expect.poll(() => !loading.size && Date.now() - lastActivity > QUIET_MS).toBe(true);
  }
  page.off('request', onRequest);
  page.off('requestfinished', onDone);
  page.off('requestfailed', onDone);
  const startupPiece = arrivesWithTheFirstRoundTrip ? [] : gate.held.splice(0);
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

const ARRIVES_WITH_THE_FIRST_ROUND_TRIP = {
  onceTheRestHasLoaded: true,
  arrivesWithTheFirstRoundTrip: true,
};

const clickTrigger = (page: Page, fixture: Fixture) => () =>
  fixtureRoot(page, fixture).locator('[data-testid=trigger]').click();

const clickConditional = (page: Page) => clickTrigger(page, CONDITIONAL_ALL);

const roundTripsAfterStartup = (roundTrips: RoundTrip[], startupUrls: string[]) =>
  roundTrips.slice(
    roundTrips.findIndex(({ urls }) => urls.some((url) => startupUrls.includes(url))) + 1
  );

test.describe('click before core loaded', () => {
  test("the click isn't lost: the result shows once core arrives", async ({ page }) => {
    const { gate, startupPiece } = await clickWhileLoading(
      page,
      [coreUrl()],
      clickConditional(page),
      CONDITIONAL_ALL
    );
    await releaseAll(gate, startupPiece);
    await expectResult(page, CONDITIONAL_ALL);
  });

  test("the click's handler is requested while core is still loading", async ({ page }) => {
    const { roundTrips } = await clickWhileLoading(
      page,
      [coreUrl()],
      clickConditional(page),
      CONDITIONAL_ALL
    );
    await attachRoundTrips('round-trips.txt', roundTrips, CONDITIONAL_ALL.sources);
    const requestedBeforeCoreArrived = roundTrips[0].urls;
    expect(requestedBeforeCoreArrived).not.toContain(coreUrl());
    expect(
      requestedBeforeCoreArrived.filter((url) => chunkComesFrom(url, CONDITIONAL_ALL.sources))
    ).toHaveLength(1);
  });

  test("the preloader is told to preload the click's chunks at the highest priority while core is still loading", async ({
    page,
  }) => {
    await recordPreloadHints(page);
    const gate = await createGate(page);
    gate.holdWhilePassing = (url) => url === coreUrl();
    await page.goto(CONDITIONAL_ALL.path, { waitUntil: 'commit' });
    await waitForQwikloader(page);
    await expect.poll(() => gate.held.length).toBe(1);

    await clickConditional(page)();

    const clickChunksHinted = async () =>
      (await chunksHintedAtHighestPriority(page)).filter((chunk) =>
        chunkComesFrom(`${ORIGIN}/build/${chunk}`, CONDITIONAL_ALL.sources)
      );
    await expect.poll(clickChunksHinted).toHaveLength(1);
    await releaseAll(gate);
  });

  test("the click's handler chunk is requested only once", async ({ page }) => {
    const requests: string[] = [];
    page.on('request', (request) => requests.push(request.url()));
    const { gate, startupPiece, roundTrips } = await clickWhileLoading(
      page,
      [coreUrl()],
      clickConditional(page),
      CONDITIONAL_ALL
    );
    await waitForNetworkIdle(page, () => releaseAll(gate, startupPiece));
    const [handlerChunk] = roundTrips[0].urls.filter((url) =>
      chunkComesFrom(url, CONDITIONAL_ALL.sources)
    );
    expect(requests.filter((url) => url === handlerChunk)).toHaveLength(1);
  });

  test("core arrives with the click's first round trip: the click shows its result in 2 round trips", async ({
    page,
  }) => {
    const { gate, roundTrips } = await clickWhileLoading(
      page,
      [coreUrl()],
      clickConditional(page),
      CONDITIONAL_ALL,
      ARRIVES_WITH_THE_FIRST_ROUND_TRIP
    );
    await releaseAll(gate);
    await attachRoundTrips('round-trips.txt', roundTrips);
    expectRoundTrips(roundTrips);
  });
});

const preloadsAfterAnEarlyClick = async (page: Page, heldUrls: string[]) => {
  const { gate, startupPiece, roundTrips } = await clickWhileLoading(
    page,
    heldUrls,
    clickConditional(page),
    CONDITIONAL_ALL,
    { withSpeculativePreloads: true }
  );
  const clickChunks = new Set(
    roundTrips
      .flatMap((roundTrip) => roundTrip.urls)
      .filter((url) => chunkComesFrom(url, CONDITIONAL_ALL.sources))
  );
  await waitForNetworkIdle(page, async () => {
    await releaseAll(gate, startupPiece);
    await page.waitForFunction(() => typeof (globalThis as any).qPreload === 'function');
  });
  const links = await preloaderLinks(page);
  return { links, clickChunks };
};

const FOUND_ONE_BY_ONE =
  'over the cap on main: without the preloader and the bundle graph, each chunk is only found once the one before it has loaded';

const STILL_LOADING = [
  {
    stillLoading: 'preloader still loading',
    arrivesWithTheClick: 'preloader arrives',
    neverArrives: 'preloader never arrives',
    arrivesLast: 'preloader arrives last',
    heldUrls: () => [preloaderUrl()],
  },
  {
    stillLoading: 'bundle graph still loading',
    arrivesWithTheClick: 'bundle graph arrives',
    neverArrives: 'bundle graph never arrives',
    arrivesLast: 'bundle graph arrives last',
    heldUrls: () => [bundleGraphUrl()],
  },
  {
    stillLoading: 'both still loading',
    arrivesWithTheClick: 'both arrive',
    neverArrives: 'neither arrives',
    arrivesLast: 'both arrive after the click',
    heldUrls: () => [preloaderUrl(), bundleGraphUrl()],
  },
];

test.describe('click before the preloader and bundle graph are loaded', () => {
  for (const { stillLoading, heldUrls } of STILL_LOADING) {
    test(`${stillLoading}: the click isn't lost, the result shows`, async ({ page }) => {
      const { gate, startupPiece } = await clickWhileLoading(
        page,
        heldUrls(),
        clickConditional(page),
        CONDITIONAL_ALL
      );
      await releaseAll(gate, startupPiece);
      await expectResult(page, CONDITIONAL_ALL);
    });
  }

  for (const { arrivesWithTheClick, heldUrls } of STILL_LOADING) {
    test(`${arrivesWithTheClick} with the click's first round trip: the click shows its result in 2 round trips`, async ({
      page,
    }) => {
      const { gate, roundTrips } = await clickWhileLoading(
        page,
        heldUrls(),
        clickConditional(page),
        CONDITIONAL_ALL,
        ARRIVES_WITH_THE_FIRST_ROUND_TRIP
      );
      await releaseAll(gate);
      await attachRoundTrips('round-trips.txt', roundTrips);
      expectRoundTrips(roundTrips);
    });
  }

  for (const { neverArrives, heldUrls } of STILL_LOADING) {
    test(`${neverArrives}: the click shows its result in 11 round trips, over the cap of 2`, async ({
      page,
    }) => {
      const { gate, startupPiece, roundTrips } = await clickWhileLoading(
        page,
        heldUrls(),
        clickConditional(page),
        CONDITIONAL_ALL,
        { onceTheRestHasLoaded: true }
      );
      const stillHeld = startupPiece.length;
      await releaseAll(gate, startupPiece);
      await attachRoundTrips('round-trips.txt', roundTrips);
      expect(stillHeld).toBe(heldUrls().length);
      expectRoundTrips(roundTrips, { roundTrips: 11, reason: FOUND_ONE_BY_ONE });
    });
  }

  for (const { arrivesLast, heldUrls } of STILL_LOADING) {
    test(`${arrivesLast}: once both are loaded, the click's chunks are preloaded at the highest priority`, async ({
      page,
    }) => {
      const { links, clickChunks } = await preloadsAfterAnEarlyClick(page, heldUrls());
      const preloadedAtHighestPriority = new Set(
        links.filter((link) => !link.speculative).map((link) => link.href)
      );
      expect(clickChunks.size).toBeGreaterThan(0);
      expect([...clickChunks].filter((url) => !preloadedAtHighestPriority.has(url))).toEqual([]);
    });
  }

  for (const { arrivesLast, heldUrls } of STILL_LOADING) {
    test(`${arrivesLast}: once both are loaded, the highest priority preloads go out before any speculative preload`, async ({
      page,
    }) => {
      const { links, clickChunks } = await preloadsAfterAnEarlyClick(page, heldUrls());
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
      expect(lowOrLate.map(({ link }) => link.href)).toEqual([]);
    });
  }
});

const SLOW_IMAGE = `${ORIGIN}/slow-image.png`;

const loadASlowImage = (page: Page) =>
  page.addInitScript((src) => {
    new Image().src = src;
  }, SLOW_IMAGE);

const pageHasLoaded = (page: Page) => page.evaluate(() => document.readyState === 'complete');

test.describe('click before the page has finished loading', () => {
  test('a slow image holds back the load event: the click shows its result in 11 round trips, over the cap of 2', async ({
    page,
  }) => {
    await loadASlowImage(page);
    const {
      gate,
      startupPiece: slowImage,
      roundTrips,
    } = await clickWhileLoading(page, [SLOW_IMAGE], clickConditional(page), CONDITIONAL_ALL, {
      onceTheRestHasLoaded: true,
    });
    const hadLoaded = await pageHasLoaded(page);
    await releaseAll(gate, slowImage);
    await attachRoundTrips('round-trips.txt', roundTrips);
    expect(hadLoaded).toBe(false);
    expectRoundTrips(roundTrips, {
      roundTrips: 11,
      reason:
        'over the cap on main: the preloader only starts after the load event, so until then each chunk is only found once the one before it has loaded',
    });
  });
});

const everyStartupPiece = () => [preloaderUrl(), coreUrl(), bundleGraphUrl()];

test.describe('early click that needs the bundle graph', () => {
  for (const fixture of [fixtureById('tree/render'), fixtureById('tree-context/render')]) {
    test(`${fixture.id}: once the preloader, core and the bundle graph are loaded, every level's chunks go out in one round trip`, async ({
      page,
    }) => {
      const startupUrls = everyStartupPiece();
      const { gate, startupPiece, roundTrips } = await clickWhileLoading(
        page,
        startupUrls,
        clickTrigger(page, fixture),
        fixture,
        { onceTheRestHasLoaded: true }
      );
      await releaseAll(gate, startupPiece);
      await attachRoundTrips('round-trips.txt', roundTrips, fixture.sources);
      const withFixtureChunks = roundTripsAfterStartup(roundTrips, startupUrls).filter(({ urls }) =>
        urls.some((url) => chunkComesFrom(url, fixture.sources))
      );
      expect(withFixtureChunks).toHaveLength(1);
    });
  }

  test('navigation: once the preloader, core and the bundle graph are loaded, the new page shows in 2 round trips', async ({
    page,
  }) => {
    const startupUrls = everyStartupPiece();
    const { gate, startupPiece, roundTrips } = await clickWhileLoading(
      page,
      startupUrls,
      () => fixtureRoot(page, FROM_OFF).locator('[data-testid=link-tree]').click(),
      TO_TREE,
      { onceTheRestHasLoaded: true }
    );
    await releaseAll(gate, startupPiece);
    await attachRoundTrips('round-trips.txt', roundTrips);
    expectRoundTrips(roundTripsAfterStartup(roundTrips, startupUrls));
  });
});

test.describe('early navigation into another layout', () => {
  test("once the bundle graph is loaded, the layout's chunks are preloaded at the highest priority", async ({
    page,
  }) => {
    const { gate, startupPiece } = await clickWhileLoading(
      page,
      [bundleGraphUrl()],
      () => page.locator('[data-fixture="navigation/shell"] [data-testid=link-docs-a]').click(),
      SHELL_DOCS_A,
      { from: SHELL_HOME, withSpeculativePreloads: true }
    );
    await waitForNetworkIdle(page, () => releaseAll(gate, startupPiece));
    await expectResult(page, SHELL_DOCS_A);
    const layoutLinks = (await preloaderLinks(page)).filter((link) =>
      chunkHoldsSegmentsFrom(link.href, DOCS_LAYOUT_SOURCES)
    );
    expect(layoutLinks.length).toBeGreaterThan(0);
    expect(layoutLinks.filter((link) => link.speculative)).toEqual([]);
  });
});

const SHARED_HELPER_DIR = 'src/components/fixtures/shared-helper/';

test.describe('early click on a handler with static imports', () => {
  test("bundle graph still loading: the handler's static imports go out one round trip after it, not later", async ({
    page,
  }) => {
    const { gate, startupPiece, roundTrips } = await clickWhileLoading(
      page,
      [bundleGraphUrl()],
      clickTrigger(page, SHARED_HELPER),
      SHARED_HELPER,
      { onceTheRestHasLoaded: true }
    );
    await releaseAll(gate, startupPiece);
    await attachRoundTrips('round-trips.txt', roundTrips, SHARED_HELPER.sources);
    const roundTripOf = (isWanted: (url: string) => boolean) =>
      roundTrips.findIndex(({ urls }) => urls.some(isWanted));
    const handlerRoundTrip = roundTripOf((url) =>
      chunkComesFrom(url, [`${SHARED_HELPER_DIR}index.tsx_`])
    );
    const helperRoundTrip = roundTripOf((url) =>
      chunkHoldsModule(url, `${SHARED_HELPER_DIR}card.tsx`)
    );
    expect(handlerRoundTrip).toBeGreaterThanOrEqual(0);
    expect(helperRoundTrip).toBe(handlerRoundTrip + 1);
  });
});

test.describe('click while the page is still streaming', () => {
  test("the handler's chunk is requested before the stream ends, and the handler runs once it has", async ({
    page,
  }) => {
    const requests: string[] = [];
    page.on('request', (request) => requests.push(request.url()));
    await page.goto(STREAMING.path, { waitUntil: 'commit' });
    try {
      await fixtureRoot(page, STREAMING).locator('[data-testid=trigger]').click();
      await expect
        .poll(() => requests.filter((url) => chunkComesFrom(url, STREAMING.sources)).length)
        .toBeGreaterThan(0);
      await expect(page.locator('[data-testid=stream-end]')).toHaveCount(0);
      await expect(fixtureResult(page, STREAMING)).not.toHaveAttribute('data-done');
    } finally {
      await page.request.get(`${ORIGIN}/streaming/release/`);
    }
    await expectResult(page, STREAMING);
  });
});

test.describe('navigation click before the preloader loaded', () => {
  test('the new page shows', async ({ page }) => {
    const { gate, startupPiece } = await clickWhileLoading(
      page,
      [preloaderUrl()],
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
