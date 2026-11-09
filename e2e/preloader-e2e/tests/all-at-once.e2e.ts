import { expect, test, type Page } from '@playwright/test';
import { expectWithinTheCap } from '../utils/click-tests';
import {
  CLICKABLE_ON_ALL_AT_ONCE,
  NEVER_SHOWS_RESULT,
  NOT_READY_WHEN_WARM,
  OVER_THE_CAP,
  type Fixture,
} from '../utils/fixtures';
import {
  countRoundTrips,
  createGate,
  formatRoundTrips,
  openColdPage,
  openWarm,
  recordSpeculativePreloads,
  releaseAll,
  resultIsDone,
} from '../utils/gate';
import { fixtureResult, fixtureRoot } from '../utils/scenarios';

const ALL_AT_ONCE = '/all-at-once/';
const CLICKABLE = CLICKABLE_ON_ALL_AT_ONCE.filter((fixture) => !NEVER_SHOWS_RESULT[fixture.id]);

const clickFixture = (page: Page, fixture: Fixture) => () =>
  fixtureRoot(page, fixture).locator('[data-testid=trigger]').click();

test.describe('all at once', () => {
  test.setTimeout(300_000);

  test('sequential cold clicks: each click shows its result within 2 round trips', async ({
    page,
  }, testInfo) => {
    await recordSpeculativePreloads(page);
    const gate = await createGate(page);
    const ongoing = await openColdPage(page, gate, ALL_AT_ONCE, CLICKABLE);
    const report: string[] = [];
    for (const fixture of CLICKABLE) {
      const roundTrips = await countRoundTrips(
        page,
        gate,
        clickFixture(page, fixture),
        resultIsDone(fixtureResult(page, fixture)),
        ongoing,
        { ownSources: fixture.sources }
      );
      report.push(
        `${fixture.id}\n${formatRoundTrips(roundTrips, { segmentsFrom: fixture.sources })}`
      );
      expectWithinTheCap(roundTrips, OVER_THE_CAP[fixture.id], `${fixture.id}: `);
    }
    await releaseAll(gate, ongoing);
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
    }
    await releaseAll(gate);
  });
});
