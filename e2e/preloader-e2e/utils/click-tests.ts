import { expect, test } from '@playwright/test';
import { knownFailure, snapshotName, type Fixture } from './fixtures';
import { formatRoundTrips } from './gate';
import { coldClick, warmClick } from './scenarios';

export const defineClickTests = (fixture: Fixture, scope = '') => {
  test.describe(fixture.id, () => {
    test('cold click: the round trips match the snapshot', async ({ page }) => {
      const failure = knownFailure(fixture, 'result', scope);
      test.fail(!!failure, failure);
      const roundTrips = await coldClick(page, fixture);
      expect(formatRoundTrips(roundTrips, { segmentsFrom: fixture.sources })).toMatchSnapshot(
        snapshotName(fixture, 'cold')
      );
    });

    test('cold click: the result shows after at most 2 round trips', async ({ page }) => {
      const failure = knownFailure(fixture, 'cap', scope);
      test.fail(!!failure, failure);
      const roundTrips = await coldClick(page, fixture);
      expect(roundTrips.length).toBeLessThanOrEqual(2);
    });

    const warmRoundTrips = fixture.warmRoundTrips ?? 0;
    const warmTitle = warmRoundTrips
      ? `warm click: the result shows after ${warmRoundTrips} round trip, by design`
      : 'warm click: the result shows with no request';
    test(warmTitle, async ({ page }) => {
      const failure = knownFailure(fixture, 'warm', scope);
      test.fail(!!failure, failure);
      const roundTrips = await warmClick(page, fixture);
      expect(roundTrips).toHaveLength(warmRoundTrips);
    });
  });
};
