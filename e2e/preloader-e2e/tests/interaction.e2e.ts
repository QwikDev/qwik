import { expect, test } from '@playwright/test';
import { defineColdClickTest } from '../utils/click-tests';
import { MATRIX, MODAL, snapshotName, USER_IMPORT } from '../utils/fixtures';
import { formatRoundTrips } from '../utils/gate';
import { coldClick } from '../utils/scenarios';

for (const fixture of [...MATRIX, MODAL]) {
  defineColdClickTest(fixture);
}

test.describe('user import()', () => {
  test('cold click: 2 round trips, the second fetching only the imported library', async ({
    page,
  }) => {
    const roundTrips = await coldClick(page, USER_IMPORT);
    expect(roundTrips).toHaveLength(2);
    expect(formatRoundTrips(roundTrips, { segmentsFrom: USER_IMPORT.sources })).toMatchSnapshot(
      snapshotName(USER_IMPORT, 'cold')
    );
  });
});
