import { expect, test } from '@playwright/test';
import { defineColdClickTest } from '../utils/click-tests';
import { chunkComesFrom, chunkHasScopedStyles } from '../utils/app';
import {
  BARREL,
  MATRIX,
  MODAL,
  QRL_PROP,
  SCOPED_STYLES,
  SHARED_HELPER,
  SLOT,
  SYNC,
  USER_IMPORT,
} from '../utils/fixtures';
import type { RoundTrip } from '../utils/gate';
import { coldClick } from '../utils/scenarios';

for (const fixture of [...MATRIX, MODAL]) {
  defineColdClickTest(fixture);
}

const requestedUrls = (roundTrips: RoundTrip[]) =>
  roundTrips.flatMap((roundTrip) => roundTrip.urls);

const roundTripOf = (roundTrips: RoundTrip[], isWanted: (url: string) => boolean) =>
  roundTrips.findIndex((roundTrip) => roundTrip.urls.some(isWanted));

test("slot: a click inside projected content doesn't fetch the projecting component's render chunk", async ({
  page,
}) => {
  const roundTrips = await coldClick(page, SLOT);
  const panelChunks = requestedUrls(roundTrips).filter((url) =>
    chunkComesFrom(url, ['src/components/fixtures/slot/panel.tsx_'])
  );
  expect(panelChunks).toEqual([]);
});

test('scoped-styles: a component shown on click fetches its scoped styles with its render chunk', async ({
  page,
}) => {
  const roundTrips = await coldClick(page, SCOPED_STYLES);
  const stylesRoundTrip = roundTripOf(roundTrips, chunkHasScopedStyles);
  const renderRoundTrip = roundTripOf(roundTrips, (url) =>
    chunkComesFrom(url, [
      'src/components/fixtures/scoped-styles/styled-card.tsx_StyledCard_component',
    ])
  );
  expect(stylesRoundTrip).toBeGreaterThanOrEqual(0);
  expect(stylesRoundTrip).toBe(renderRoundTrip);
});

test('qrl-prop: a click calling a QRL passed down as a prop fetches it with the handler', async ({
  page,
}) => {
  const roundTrips = await coldClick(page, QRL_PROP);
  const handlerRoundTrip = roundTripOf(roundTrips, (url) =>
    chunkComesFrom(url, ['src/components/fixtures/qrl-prop/action-button.tsx_'])
  );
  const qrlRoundTrip = roundTripOf(roundTrips, (url) =>
    chunkComesFrom(url, ['src/components/fixtures/qrl-prop/index.tsx_'])
  );
  expect(handlerRoundTrip).toBeGreaterThanOrEqual(0);
  expect(qrlRoundTrip).toBeGreaterThanOrEqual(0);
  test.fail(
    true,
    "on main, the QRL from the parent's file is only requested once the child's handler runs it, a round trip later"
  );
  expect(qrlRoundTrip).toBe(handlerRoundTrip);
});

test('sync: a click handled only by sync$ shows the result with no request, even cold', async ({
  page,
}) => {
  const roundTrips = await coldClick(page, SYNC);
  expect(roundTrips).toHaveLength(0);
});

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
    const roundTrips = await coldClick(page, SHARED_HELPER);
    const cardChunks = requestedUrls(roundTrips).filter((url) =>
      chunkComesFrom(url, [
        'src/components/fixtures/shared-helper/card.tsx_',
        'src/components/fixtures/shared-helper/sparkline.ts',
      ])
    );
    test.fail(
      true,
      "on main, the helper's module lists Card's segments as dynamic imports, so Card's render, its click handler and sparkline.ts go out as needed chunks"
    );
    expect(cardChunks).toEqual([]);
  });
});

test.describe('component re-exported by a barrel file', () => {
  test("a cold click fetches that component but none of the barrel's other components", async ({
    page,
  }) => {
    const roundTrips = await coldClick(page, BARREL);
    const otherComponents = requestedUrls(roundTrips).filter((url) =>
      chunkComesFrom(url, [
        'src/components/fixtures/barrel/ui/beta',
        'src/components/fixtures/barrel/ui/gamma',
      ])
    );
    expect(otherComponents).toEqual([]);
  });
});
