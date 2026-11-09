import { expect, test } from '@playwright/test';
import {
  NEVER_SHOWS_RESULT,
  ROUND_TRIPS_ON_MAIN,
  type Fixture,
  type RoundTripsOnMain,
} from './fixtures';
import { formatRoundTrips, releaseAll, waitForNetworkIdle, type RoundTrip } from './gate';
import { coldClick, expectResult, fixtureRoot, openFixture } from './scenarios';

export const ROUND_TRIPS_PER_CLICK = 2;

export const expectRoundTrips = (roundTrips: RoundTrip[], onMain?: RoundTripsOnMain, label = '') =>
  expect
    .soft(roundTrips, `${label}${onMain?.reason ?? ''}`)
    .toHaveLength(onMain?.roundTrips ?? ROUND_TRIPS_PER_CLICK);

export const attachRoundTrips = (name: string, roundTrips: RoundTrip[], segmentsFrom?: string[]) =>
  test.info().attach(name, {
    body: formatRoundTrips(roundTrips, { segmentsFrom }),
    contentType: 'text/plain',
  });

const describeRoundTrips = (count: number) => {
  const noun = count === 1 ? 'round trip' : 'round trips';
  const overTheCap =
    count > ROUND_TRIPS_PER_CLICK ? `, over the cap of ${ROUND_TRIPS_PER_CLICK}` : '';
  return `${count} ${noun}${overTheCap}`;
};

const defineNeverShowsResultTest = (fixture: Fixture, reason: string) => {
  test(`${fixture.id}: a cold click shows the result`, async ({ page }) => {
    const opened = await openFixture(page, fixture, 'cold');
    await fixtureRoot(page, fixture).locator('[data-testid=trigger]').click();
    await waitForNetworkIdle(page, () => releaseAll(opened.gate, opened.ongoing));
    test.fail(true, reason);
    await expectResult(page, fixture);
  });
};

export const defineColdClickTest = (fixture: Fixture) => {
  const neverShowsResult = NEVER_SHOWS_RESULT[fixture.id];
  if (neverShowsResult) {
    defineNeverShowsResultTest(fixture, neverShowsResult);
    return;
  }
  const onMain = ROUND_TRIPS_ON_MAIN[fixture.id];
  const pinned = describeRoundTrips(onMain?.roundTrips ?? ROUND_TRIPS_PER_CLICK);
  test(`${fixture.id}: a cold click shows the result in ${pinned}`, async ({ page }) => {
    const roundTrips = await coldClick(page, fixture);
    await attachRoundTrips('round-trips.txt', roundTrips, fixture.sources);
    expectRoundTrips(roundTrips, onMain);
  });
};
