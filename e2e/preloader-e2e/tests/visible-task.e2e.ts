import { expect, test, type Page } from '@playwright/test';
import { chunkComesFrom } from '../utils/app';
import { attachRoundTrips } from '../utils/click-tests';
import {
  VISIBLE_ABOVE,
  VISIBLE_BELOW,
  VISIBLE_DOCUMENT_IDLE,
  VISIBLE_DOCUMENT_READY,
  type Fixture,
} from '../utils/fixtures';
import {
  countRoundTrips,
  createGate,
  preloaderLinks,
  recordSpeculativePreloads,
  releaseAll,
  resultIsDone,
} from '../utils/gate';
import {
  countFixtureRoundTrips,
  expectResult,
  fixtureResult,
  fixtureRoot,
  openFixture,
} from '../utils/scenarios';

const VISIBLE_ABOVE_SOURCE = 'src/components/fixtures/visible/above.tsx';
const VISIBLE_BELOW_SOURCE = 'src/components/fixtures/visible/below.tsx';

test.describe('visible task in view at load', () => {
  test('its chunks are requested as soon as qwikloader sees it, before any speculative preload', async ({
    page,
  }) => {
    await recordSpeculativePreloads(page);
    const requests: string[] = [];
    page.on('request', (request) => requests.push(request.url()));
    await page.goto(VISIBLE_ABOVE.path);
    await expectResult(page, VISIBLE_ABOVE);
    const speculative = new Set(
      (await preloaderLinks(page)).filter((link) => link.speculative).map((link) => link.href)
    );
    const firstVisibleTaskChunk = requests.findIndex(
      (url) => chunkComesFrom(url, [VISIBLE_ABOVE_SOURCE]) && !speculative.has(url)
    );
    const firstSpeculativePreload = requests.findIndex((url) => speculative.has(url));
    test.fail(
      true,
      'on main, visible task chunks wait for core to load, and speculative preloads start first'
    );
    expect(firstVisibleTaskChunk).toBeGreaterThanOrEqual(0);
    if (firstSpeculativePreload >= 0) {
      expect(firstVisibleTaskChunk).toBeLessThan(firstSpeculativePreload);
    }
  });

  test('its whole chain goes out in that first round trip', async ({ page }) => {
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
    const first = roundTrips.findIndex((roundTrip) =>
      roundTrip.urls.some((url) => chunkComesFrom(url, [VISIBLE_ABOVE_SOURCE]))
    );
    expect(first).toBeGreaterThanOrEqual(0);
    expect(roundTrips.slice(first)).toHaveLength(1);
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
    const fetchedAsNeeded = requests.filter(
      (url) => chunkComesFrom(url, [VISIBLE_BELOW_SOURCE]) && !speculative.has(url)
    );
    expect(fetchedAsNeeded).toEqual([]);
    await releaseAll(opened.gate);
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
    await releaseAll(opened.gate, opened.ongoing);
    await expectResult(page, VISIBLE_BELOW);
    await attachRoundTrips('round-trips.txt', roundTrips, VISIBLE_BELOW.sources);
    const [firstRoundTrip] = roundTrips;
    const requestedByTheScroll = firstRoundTrip.urls.filter(
      (url) => !firstRoundTrip.ongoingUrls.includes(url)
    );
    expect(requestedByTheScroll.some((url) => chunkComesFrom(url, [VISIBLE_BELOW_SOURCE]))).toBe(
      true
    );
    expect(roundTrips).toHaveLength(1);
  });
});

const LOAD_EVENT = 'load';

const loadAndRecordRequests = async (page: Page, fixture: Fixture) => {
  await recordSpeculativePreloads(page);
  const events: string[] = [];
  page.on('request', (request) => events.push(request.url()));
  page.on('load', () => events.push(LOAD_EVENT));
  await page.goto(fixture.path);
  await expectResult(page, fixture);
  const speculative = new Set(
    (await preloaderLinks(page)).filter((link) => link.speculative).map((link) => link.href)
  );
  return {
    firstChunk: events.findIndex(
      (url) => url !== LOAD_EVENT && chunkComesFrom(url, fixture.sources) && !speculative.has(url)
    ),
    firstSpeculativePreload: events.findIndex((url) => speculative.has(url)),
    load: events.indexOf(LOAD_EVENT),
  };
};

test.describe('other visible task strategies', () => {
  test("document-ready: its chunks go out with the page's load work", async ({ page }) => {
    const { firstChunk, load } = await loadAndRecordRequests(page, VISIBLE_DOCUMENT_READY);
    test.fail(
      true,
      'on main, document-ready visible task chunks wait for core, so they go out after load'
    );
    expect(firstChunk).toBeGreaterThanOrEqual(0);
    expect(firstChunk).toBeLessThan(load);
  });

  test('document-idle: its chunks go out after load, before any speculative preload', async ({
    page,
  }) => {
    const { firstChunk, firstSpeculativePreload, load } = await loadAndRecordRequests(
      page,
      VISIBLE_DOCUMENT_IDLE
    );
    test.fail(true, 'on main, speculative preloads start before document-idle visible task chunks');
    expect(firstChunk).toBeGreaterThan(load);
    if (firstSpeculativePreload >= 0) {
      expect(firstChunk).toBeLessThan(firstSpeculativePreload);
    }
  });
});
