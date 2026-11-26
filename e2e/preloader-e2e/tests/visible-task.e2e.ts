import { expect, test, type Page } from '@playwright/test';
import { chunkComesFrom, chunkHasVisibleTask, getCoreBundle, ORIGIN } from '../utils/app';
import { attachRoundTrips } from '../utils/click-tests';
import {
  MATRIX,
  VISIBLE_ABOVE,
  VISIBLE_BELOW,
  VISIBLE_DOCUMENT_IDLE,
  VISIBLE_DOCUMENT_READY,
  type Fixture,
} from '../utils/fixtures';
import {
  type PageFetch,
  countRoundTrips,
  createGate,
  preloaderLinks,
  recordSpeculativePreloads,
  releaseAll,
  resultIsDone,
  settledFetches,
  speculativePreloads,
} from '../utils/gate';
import {
  countFixtureRoundTrips,
  expectResult,
  fixtureResult,
  fixtureRoot,
  openFixture,
  scrollIntoView,
} from '../utils/scenarios';

const VISIBLE_ABOVE_SOURCE = 'src/components/fixtures/visible/above.tsx';
const VISIBLE_BELOW_SOURCE = 'src/components/fixtures/visible/below.tsx';

const firstStart = (fetches: PageFetch[]) => Math.min(...fetches.map((fetch) => fetch.startTime));

const openOnceASpeculativePreloadStarted = async (page: Page, fixture: Fixture) => {
  const coreUrl = `${ORIGIN}/build/${getCoreBundle()}`;
  const gate = await createGate(page);
  gate.holdWhilePassing = (url) => url === coreUrl;
  await page.goto(fixture.path, { waitUntil: 'commit' });
  await expect.poll(async () => (await speculativePreloads(page)).size).toBeGreaterThan(0);
  gate.holdWhilePassing = undefined;
  await releaseAll(gate);
};

test.describe('visible task in view at load', () => {
  test('its chunks are requested as soon as qwikloader sees it, before any speculative preload', async ({
    page,
  }) => {
    await recordSpeculativePreloads(page);
    await openOnceASpeculativePreloadStarted(page, VISIBLE_ABOVE);
    await expectResult(page, VISIBLE_ABOVE);
    const { fetches } = await settledFetches(page);
    const isVisibleTaskChunk = (url: string) =>
      chunkComesFrom(url, [VISIBLE_ABOVE_SOURCE]) && chunkHasVisibleTask(url);
    const firstVisibleTaskChunk = firstStart(
      fetches.filter((fetch) => isVisibleTaskChunk(fetch.url))
    );
    const firstSpeculativePreload = firstStart(
      fetches.filter((fetch) => fetch.speculative && !isVisibleTaskChunk(fetch.url))
    );
    expect(firstVisibleTaskChunk).toBeLessThan(firstSpeculativePreload);
  });

  test('the chunks of its 3 chained visible tasks go out in one round trip, with core', async ({
    page,
  }) => {
    await recordSpeculativePreloads(page);
    const gate = await createGate(page);
    const roundTrips = await countRoundTrips(
      page,
      gate,
      () => page.goto(VISIBLE_ABOVE.path, { waitUntil: 'commit' }),
      resultIsDone(fixtureResult(page, VISIBLE_ABOVE))
    );
    await releaseAll(gate);
    await expectResult(page, VISIBLE_ABOVE);
    await attachRoundTrips('round-trips.txt', roundTrips, VISIBLE_ABOVE.sources);
    const withVisibleTaskChunks = roundTrips.filter((roundTrip) =>
      roundTrip.urls.some((url) => chunkComesFrom(url, [VISIBLE_ABOVE_SOURCE]))
    );
    expect(withVisibleTaskChunks).toHaveLength(1);
    expect(withVisibleTaskChunks[0].urls).toContain(`${ORIGIN}/build/${getCoreBundle()}`);
  });
});

test.describe('visible task below the fold', () => {
  test('before the scroll, nothing runs and its chunks are only fetched as speculative preloads', async ({
    page,
  }) => {
    const requests: string[] = [];
    page.on('request', (request) => requests.push(request.url()));
    const opened = await openFixture(page, VISIBLE_BELOW, 'warm');
    await expect(fixtureResult(page, VISIBLE_BELOW)).toHaveText('0');
    await expect(fixtureResult(page, VISIBLE_BELOW)).not.toHaveAttribute('data-done');
    const speculative = new Set(
      (await preloaderLinks(page)).filter((link) => link.speculative).map((link) => link.href)
    );
    const fetchedAtHighestPriority = requests.filter(
      (url) => chunkComesFrom(url, [VISIBLE_BELOW_SOURCE]) && !speculative.has(url)
    );
    expect(fetchedAtHighestPriority).toEqual([]);
    await releaseAll(opened.gate);
  });

  test('the page lists its chunk for the preloader', async ({ page }) => {
    const response = await page.goto(VISIBLE_BELOW.path);
    const [, chunkList] = (await response!.text()).match(/\(\{p\}\)=>p\((\[[^\]]*\])\)/)!;
    const listed = (JSON.parse(chunkList) as string[]).map((name) => `${ORIGIN}/build/${name}`);
    const itsVisibleTaskChunks = listed.filter(
      (url) => chunkComesFrom(url, [VISIBLE_BELOW_SOURCE]) && chunkHasVisibleTask(url)
    );
    expect(itsVisibleTaskChunks).not.toEqual([]);
  });

  test('after the scroll, its chunks go out at once, even while a speculative preload is ongoing, and the result shows in that one round trip', async ({
    page,
  }) => {
    const opened = await openFixture(page, VISIBLE_BELOW, 'cold');
    const roundTrips = await countFixtureRoundTrips(
      opened,
      () => fixtureRoot(page, VISIBLE_BELOW).scrollIntoViewIfNeeded(),
      resultIsDone(fixtureResult(page, VISIBLE_BELOW))
    );
    await releaseAll(opened.gate);
    await expectResult(page, VISIBLE_BELOW);
    await attachRoundTrips('round-trips.txt', roundTrips, VISIBLE_BELOW.sources);
    expect(roundTrips).toHaveLength(1);
    const [firstRoundTrip] = roundTrips;
    expect(firstRoundTrip.urls.some((url) => chunkComesFrom(url, [VISIBLE_BELOW_SOURCE]))).toBe(
      true
    );
  });
});

const VISIBLE_TASK_CHAINS = MATRIX.filter((fixture) => fixture.startsWhenVisible);

test.describe('visible task chain scrolled into view', () => {
  for (const fixture of VISIBLE_TASK_CHAINS) {
    const isSingle = fixture.id.startsWith('single/');
    const title = isSingle
      ? 'cold, the result shows in 1 round trip'
      : "cold, every level's visible task chunks go out in one round trip";
    test(`${fixture.id}: ${title}`, async ({ page }) => {
      const opened = await openFixture(page, fixture, 'cold');
      const roundTrips = await scrollIntoView(opened);
      await releaseAll(opened.gate);
      await expectResult(page, fixture);
      await attachRoundTrips('round-trips.txt', roundTrips, fixture.sources);
      const withVisibleTaskChunks = roundTrips.filter((roundTrip) =>
        roundTrip.urls.some((url) => chunkComesFrom(url, fixture.sources))
      );
      expect(isSingle ? roundTrips : withVisibleTaskChunks).toHaveLength(1);
    });
  }

  for (const fixture of VISIBLE_TASK_CHAINS) {
    test(`${fixture.id}: warm, the result shows with no request`, async ({ page }) => {
      const opened = await openFixture(page, fixture, 'warm');
      const roundTrips = await scrollIntoView(opened);
      await releaseAll(opened.gate);
      await expectResult(page, fixture);
      expect(roundTrips).toEqual([]);
    });
  }
});

const loadAndRecordFetches = async (
  page: Page,
  fixture: Fixture,
  open: (page: Page, fixture: Fixture) => Promise<unknown> = (page, fixture) =>
    page.goto(fixture.path)
) => {
  await recordSpeculativePreloads(page);
  await open(page, fixture);
  await expectResult(page, fixture);
  const { fetches, load } = await settledFetches(page);
  const isVisibleTaskChunk = (url: string) =>
    chunkComesFrom(url, fixture.sources) && chunkHasVisibleTask(url);
  return {
    firstChunk: firstStart(fetches.filter((fetch) => isVisibleTaskChunk(fetch.url))),
    firstSpeculativePreload: firstStart(
      fetches.filter((fetch) => fetch.speculative && !isVisibleTaskChunk(fetch.url))
    ),
    load,
  };
};

test.describe('other visible task strategies', () => {
  test("document-ready: its chunks go out with the page's load work", async ({ page }) => {
    const { firstChunk, load } = await loadAndRecordFetches(page, VISIBLE_DOCUMENT_READY);
    expect(firstChunk).toBeLessThan(load);
  });

  test('document-idle: its chunks go out after load, before any speculative preload', async ({
    page,
  }) => {
    const { firstChunk, firstSpeculativePreload, load } = await loadAndRecordFetches(
      page,
      VISIBLE_DOCUMENT_IDLE,
      openOnceASpeculativePreloadStarted
    );
    expect(firstChunk).toBeGreaterThan(load);
    expect(firstChunk).toBeLessThan(firstSpeculativePreload);
  });
});
