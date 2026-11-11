import { expect, test, type Page } from '@playwright/test';
import { chunkComesFrom } from '../utils/app';
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
} from '../utils/gate';
import { expectResult, fixtureResult, fixtureRoot } from '../utils/scenarios';

const ALL_AT_ONCE = '/all-at-once/';
const CLICKABLE = CLICKABLE_ON_ALL_AT_ONCE.filter((fixture) => !NEVER_SHOWS_RESULT[fixture.id]);

const expectExpectedText = async (page: Page, fixture: Fixture) => {
  if (!fixture.expected) {
    return;
  }
  await expect.soft(fixtureResult(page, fixture), fixture.id).toHaveText(fixture.expected);
};

const clickFixture = (page: Page, fixture: Fixture) => () =>
  fixtureRoot(page, fixture).locator('[data-testid=trigger]').click();

test.describe('all at once', () => {
  test.setTimeout(300_000);

  test('sequential cold clicks: each click shows its result in as many round trips as on its own page', async ({
    page,
  }, testInfo) => {
    await recordSpeculativePreloads(page);
    const gate = await createGate(page);
    await openCold(page, gate, ALL_AT_ONCE);
    const report: string[] = [];
    for (const fixture of CLICKABLE) {
      const roundTrips = await countRoundTrips(
        page,
        gate,
        clickFixture(page, fixture),
        resultIsDone(fixtureResult(page, fixture))
      );
      report.push(
        `${fixture.id}\n${formatRoundTrips(roundTrips, { segmentsFrom: fixture.sources })}`
      );
      expectRoundTrips(roundTrips, ROUND_TRIPS_ON_MAIN[fixture.id], `${fixture.id}: `);
      await expectExpectedText(page, fixture);
    }
    await releaseAll(gate);
    await testInfo.attach('cold-clicks.txt', {
      body: report.join('\n'),
      contentType: 'text/plain',
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
