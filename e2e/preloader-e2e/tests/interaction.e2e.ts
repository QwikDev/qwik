import { expect, test } from '@playwright/test';
import { defineColdClickTest } from '../utils/click-tests';
import { chunkComesFrom } from '../utils/app';
import { MATRIX, MODAL, USER_IMPORT } from '../utils/fixtures';
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
    const ownChunks = roundTrips[1].urls.filter((url) => chunkComesFrom(url, USER_IMPORT.sources));
    expect(ownChunks.length).toBeGreaterThan(0);
    expect(ownChunks.every((url) => chunkComesFrom(url, ['src/vendor-lib/']))).toBe(true);
  });
});
