import { expect, test } from '@playwright/test';
import { chunkComesFrom } from '../utils/app';
import { HEAVY_DEP_QRL_PROP } from '../utils/fixtures';
import { releaseAll } from '../utils/gate';
import { coldClick, countFixtureRoundTrips, fixtureRoot, openFixture } from '../utils/scenarios';

// A `$()` passed to a component's `on*$` prop is grouped with its component's other segments, and the
// library it calls becomes a static import of that group: rendering the component, or running its
// computed, fetches the library that only a click on a slide needs.
const LIBRARY = ['src/components/fixtures/heavy-dep-qrl-prop/lightbox.ts'];
const fromLibrary = (urls: string[]) => urls.filter((url) => chunkComesFrom(url, LIBRARY));

test.describe('heavy-dep-qrl-prop: a library only a click-only QRL prop calls', () => {
  test('is not needed by the page load work', async ({ page }) => {
    const requests: string[] = [];
    page.on('request', (request) => requests.push(request.url()));
    // Cold: the gate holds every speculative preload, so what went out is what the page needed.
    const { gate } = await openFixture(page, HEAVY_DEP_QRL_PROP, 'cold');
    const needed = fromLibrary(requests);
    await releaseAll(gate);
    expect(needed).toEqual([]);
  });

  test('is not needed by a cold click that re-renders the component', async ({ page }) => {
    const roundTrips = await coldClick(page, HEAVY_DEP_QRL_PROP);
    expect(fromLibrary(roundTrips.flatMap((roundTrip) => roundTrip.urls))).toEqual([]);
  });

  test('is fetched by a cold click on a slide, which then shows its result', async ({ page }) => {
    const opened = await openFixture(page, HEAVY_DEP_QRL_PROP, 'cold');
    const root = fixtureRoot(page, HEAVY_DEP_QRL_PROP);
    const roundTrips = await countFixtureRoundTrips(
      opened,
      () => root.locator('[data-testid=slide-1]').click(),
      async () => (await root.locator('[data-testid=opened]').textContent()) !== ''
    );
    await releaseAll(opened.gate);
    await expect(root.locator('[data-testid=opened]')).toHaveText('lightbox slate-back');
    expect(fromLibrary(roundTrips.flatMap((roundTrip) => roundTrip.urls)).length).toBeGreaterThan(
      0
    );
  });
});
