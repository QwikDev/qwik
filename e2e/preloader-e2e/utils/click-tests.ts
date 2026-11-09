import { expect, test } from '@playwright/test';
import {
  NEVER_SHOWS_RESULT,
  ROUND_TRIPS_ON_MAIN,
  type Fixture,
  type RoundTripsOnMain,
} from './fixtures';
import { formatRoundTrips, type RoundTrip } from './gate';
import { coldClick } from './scenarios';

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

export const defineColdClickTest = (fixture: Fixture) => {
  test(`${fixture.id}: a cold click shows the result in 2 round trips`, async ({ page }) => {
    const failure = NEVER_SHOWS_RESULT[fixture.id];
    test.fail(!!failure, failure);
    const roundTrips = await coldClick(page, fixture);
    await attachRoundTrips('round-trips.txt', roundTrips, fixture.sources);
    expectRoundTrips(roundTrips, ROUND_TRIPS_ON_MAIN[fixture.id]);
  });
};
