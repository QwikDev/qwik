import { expect, test } from '@playwright/test';
import {
  NEVER_SHOWS_RESULT,
  OVER_THE_CAP,
  snapshotName,
  type Fixture,
  type RoundTripsOnMain,
} from './fixtures';
import { formatRoundTrips } from './gate';
import { coldClick } from './scenarios';

export const MAX_ROUND_TRIPS_PER_CLICK = 2;

export const expectWithinTheCap = (
  roundTrips: unknown[],
  overTheCap?: RoundTripsOnMain,
  label = ''
) => {
  if (overTheCap) {
    expect.soft(roundTrips, `${label}${overTheCap.reason}`).toHaveLength(overTheCap.roundTrips);
    return;
  }
  expect.soft(roundTrips.length, label).toBeLessThanOrEqual(MAX_ROUND_TRIPS_PER_CLICK);
};

export const defineColdClickTest = (fixture: Fixture) => {
  test(`${fixture.id}: a cold click shows the result within 2 round trips, as in the snapshot`, async ({
    page,
  }) => {
    const failure = NEVER_SHOWS_RESULT[fixture.id];
    test.fail(!!failure, failure);
    const roundTrips = await coldClick(page, fixture);
    expect(formatRoundTrips(roundTrips, { segmentsFrom: fixture.sources })).toMatchSnapshot(
      snapshotName(fixture, 'cold')
    );
    expectWithinTheCap(roundTrips, OVER_THE_CAP[fixture.id]);
  });
};
