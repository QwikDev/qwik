import { expect, test } from '@playwright/test';
import { defineColdClickTest } from '../utils/click-tests';
import { chunkComesFrom } from '../utils/app';
import { MATRIX, MODAL, SHARED_HELPER, USER_IMPORT } from '../utils/fixtures';
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

test.describe("helper shared from another component's file", () => {
  test("a cold click fetches the helper's module but none of the other component's chunks", async ({
    page,
  }) => {
    test.fail(
      true,
      "on main, the helper's module lists Card's segments as dynamic imports, so Card's render, its click handler and sparkline.ts go out as needed chunks"
    );
    const roundTrips = await coldClick(page, SHARED_HELPER);
    const cardChunks = roundTrips
      .flatMap((roundTrip) => roundTrip.urls)
      .filter((url) =>
        chunkComesFrom(url, [
          'src/components/fixtures/shared-helper/card.tsx_',
          'src/components/fixtures/shared-helper/sparkline.ts',
        ])
      );
    expect(cardChunks).toEqual([]);
  });
});
