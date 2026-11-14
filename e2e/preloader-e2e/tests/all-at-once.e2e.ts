import { expect, test, type Page } from '@playwright/test';
import { chunkComesFrom, chunkHoldsSegmentsFrom } from '../utils/app';
import { expectRoundTrips } from '../utils/click-tests';
import {
  CLICKABLE_ON_ALL_AT_ONCE,
  NEVER_SHOWS_RESULT,
  NOT_READY_WHEN_WARM,
  ROUND_TRIPS_ON_MAIN,
  type Fixture,
} from '../utils/fixtures';
import {
  countRoundTrips,
  createGate,
  formatRoundTrips,
  openCold,
  openWarm,
  recordSpeculativePreloads,
  releaseAll,
  resultIsDone,
  settle,
  type RoundTrip,
} from '../utils/gate';
import { expectResult, fixtureResult, startFixture } from '../utils/scenarios';

const ALL_AT_ONCE = '/all-at-once/';
const CLICKABLE = CLICKABLE_ON_ALL_AT_ONCE.filter((fixture) => !NEVER_SHOWS_RESULT[fixture.id]);

const expectExpectedText = async (page: Page, fixture: Fixture) => {
  if (!fixture.expected) {
    return;
  }
  await expect.soft(fixtureResult(page, fixture), fixture.id).toHaveText(fixture.expected);
};

const clickFixture = (page: Page, fixture: Fixture) => () => startFixture(page, fixture);

const clickEachFixtureCold = async (
  page: Page,
  onClick: (
    fixture: Fixture,
    roundTrips: RoundTrip[],
    stillOngoing: string[]
  ) => Promise<void> | void
) => {
  await recordSpeculativePreloads(page);
  const gate = await createGate(page);
  await openCold(page, gate, ALL_AT_ONCE);
  for (const fixture of CLICKABLE) {
    const roundTrips = await countRoundTrips(
      page,
      gate,
      clickFixture(page, fixture),
      resultIsDone(fixtureResult(page, fixture))
    );
    const stillOngoing = gate.held.map((route) => route.request().url());
    await onClick(fixture, roundTrips, stillOngoing);
  }
  await releaseAll(gate);
};

test.describe('all at once', () => {
  test.setTimeout(300_000);

  test('sequential cold clicks: each click shows its result in as many round trips as on its own page', async ({
    page,
  }, testInfo) => {
    const report: string[] = [];
    await clickEachFixtureCold(page, async (fixture, roundTrips) => {
      report.push(
        `${fixture.id}\n${formatRoundTrips(roundTrips, { segmentsFrom: fixture.sources })}`
      );
      expectRoundTrips(roundTrips, ROUND_TRIPS_ON_MAIN[fixture.id], `${fixture.id}: `);
      await expectExpectedText(page, fixture);
    });
    await testInfo.attach('cold-clicks.txt', {
      body: report.join('\n'),
      contentType: 'text/plain',
    });
  });

  test("sequential cold clicks: each click fetches only its own fixture's chunks", async ({
    page,
  }) => {
    const fetchedByEarlierClicks = new Set<string>();
    await clickEachFixtureCold(page, (fixture, roundTrips, stillOngoing) => {
      const fetched = [
        ...roundTrips.flatMap((roundTrip) => roundTrip.urls),
        ...stillOngoing,
      ].filter((url) => !fetchedByEarlierClicks.has(url));
      const fromOtherFixtures = fetched.filter(
        (url) => chunkHoldsSegmentsFrom(url, ['src/']) && !chunkComesFrom(url, fixture.sources)
      );
      fetched.forEach((url) => fetchedByEarlierClicks.add(url));
      expect.soft(fromOtherFixtures, fixture.id).toEqual([]);
    });
  });

  test('sequential warm clicks: each click shows its result with no request', async ({ page }) => {
    const gate = await createGate(page);
    await openWarm(page, gate, ALL_AT_ONCE);
    for (const fixture of CLICKABLE) {
      const roundTrips = await countRoundTrips(
        page,
        gate,
        clickFixture(page, fixture),
        resultIsDone(fixtureResult(page, fixture))
      );
      const notReady = NOT_READY_WHEN_WARM[fixture.id];
      expect
        .soft(roundTrips, notReady ? `${fixture.id}: ${notReady.reason}` : fixture.id)
        .toHaveLength(notReady?.roundTrips ?? fixture.warmRoundTrips ?? 0);
      await expectExpectedText(page, fixture);
    }
    await releaseAll(gate);
  });

  test("two quick clicks: the second click's chunks go out without waiting for the first click's", async ({
    page,
  }) => {
    const [first, second] = ['single/task-chain', 'tree/task-chain'].map(
      (id) => CLICKABLE.find((fixture) => fixture.id === id)!
    );
    await recordSpeculativePreloads(page);
    const gate = await createGate(page);
    await openCold(page, gate, ALL_AT_ONCE);
    gate.mode = 'hold';
    await clickFixture(page, first)();
    await settle(page, gate);
    const heldForTheFirstClick = gate.held.length;
    await clickFixture(page, second)();
    await settle(page, gate);
    const secondClickChunks = gate.held
      .slice(heldForTheFirstClick)
      .map((route) => route.request().url())
      .filter((url) => chunkComesFrom(url, second.sources));
    await releaseAll(gate);
    await expectResult(page, first);
    await expectResult(page, second);
    expect(secondClickChunks.length).toBeGreaterThan(0);
  });
});
