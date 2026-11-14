import { expect, test, type Page } from '@playwright/test';
import { brotliKb, chunkComesFrom, chunkHasComponent, chunkUrlsNeededToRun } from '../utils/app';
import { attachRoundTrips } from '../utils/click-tests';
import {
  CONDITIONAL_MODAL,
  DASHBOARD_MODAL,
  EMPTY_LIST,
  MATRIX,
  fixtureById,
} from '../utils/fixtures';
import { release, releaseAll, settle, type Gate } from '../utils/gate';
import {
  countFixtureRoundTrips,
  fixtureRoot,
  openFixture,
  warmClick,
  type OpenFixture,
} from '../utils/scenarios';

const DASHBOARD_SOURCE = 'src/components/fixtures/dashboard-modal/';
const RESULTS_IN_THE_DASHBOARD = MATRIX.filter(
  (fixture) => !fixture.id.startsWith('conditional/')
).length;

const dashboard = (page: Page) => page.locator('[data-testid=dashboard]');

const dashboardIsShown = (page: Page) => async () =>
  (await dashboard(page).locator('[data-fixture]').count()) === MATRIX.length &&
  (await dashboard(page).locator('[data-testid=result]').count()) === RESULTS_IN_THE_DASHBOARD;

const openDashboard = (opened: OpenFixture) =>
  countFixtureRoundTrips(
    opened,
    () => fixtureRoot(opened.page, DASHBOARD_MODAL).locator('[data-testid=trigger]').click(),
    dashboardIsShown(opened.page)
  );

const isFromTheDashboard = (url: string) => chunkComesFrom(url, [DASHBOARD_SOURCE]);

const releaseTheDashboardOwnChunks = async (gate: Gate) => {
  const ownUrls = chunkUrlsNeededToRun(DASHBOARD_SOURCE);
  const own = gate.held.filter((route) => ownUrls.has(route.request().url()));
  gate.held = gate.held.filter((route) => !own.includes(route));
  await release(own);
};

test.describe('under-preloading', () => {
  test.describe('warm click, once the preloader has nothing left to preload', () => {
    test('opens a modal without a request: the component QRLs inside its panel were preloaded', async ({
      page,
    }) => {
      expect(await warmClick(page, CONDITIONAL_MODAL)).toEqual([]);
    });

    test('opens a modal holding a dashboard without a request: every component QRL inside was preloaded', async ({
      page,
    }) => {
      test.setTimeout(300_000);
      const opened = await openFixture(page, DASHBOARD_MODAL, 'warm');
      const roundTrips = await openDashboard(opened);
      await releaseAll(opened.gate);
      expect(roundTrips).toEqual([]);
    });

    test("shows a conditional tree without a request: every level's component QRL was preloaded", async ({
      page,
    }) => {
      expect(await warmClick(page, fixtureById('conditional/render'))).toEqual([]);
    });

    test('adds the first item to a list the server rendered empty without a request', async ({
      page,
    }) => {
      expect(await warmClick(page, EMPTY_LIST)).toEqual([]);
    });
  });

  test.describe('cold click on a modal holding a dashboard', () => {
    test('shows the dashboard in 2 round trips, every component inside going out together', async ({
      page,
    }) => {
      const opened = await openFixture(page, DASHBOARD_MODAL, 'cold');
      const roundTrips = await openDashboard(opened);
      await releaseAll(opened.gate);
      await attachRoundTrips('round-trips.txt', roundTrips);
      const chunks = [...new Set(roundTrips.flatMap((roundTrip) => roundTrip.urls))].filter((url) =>
        new URL(url).pathname.startsWith('/build/')
      );
      const kb = chunks.reduce((total, url) => total + brotliKb(url), 0);
      test.info().annotations.push({
        type: 'cost',
        description: `${chunks.length} chunks, ${kb.toFixed(1)} kB (brotli)`,
      });
      const withComponentsInside = roundTrips.filter((roundTrip) =>
        roundTrip.urls.some((url) => chunkHasComponent(url) && !isFromTheDashboard(url))
      );
      expect(roundTrips).toHaveLength(2);
      expect(withComponentsInside).toHaveLength(1);
    });

    test('a button inside the panel responds once its own chunk has landed, while the rest of the panel is still loading', async ({
      page,
    }) => {
      const opened = await openFixture(page, DASHBOARD_MODAL, 'cold');
      const { gate } = opened;
      await fixtureRoot(page, DASHBOARD_MODAL).locator('[data-testid=trigger]').click();
      for (;;) {
        await settle(page, gate);
        if (gate.held.some((route) => isFromTheDashboard(route.request().url()))) {
          break;
        }
        expect(gate.held.length).toBeGreaterThan(0);
        await release(gate.held.splice(0));
      }
      await releaseTheDashboardOwnChunks(gate);
      const stillLoading = gate.held.length;
      const confirm = dashboard(page).locator('[data-testid=confirm]');
      test.fail(
        true,
        "on main, none of the panel's own elements show until the components inside it have loaded"
      );
      await expect(confirm).toBeVisible();
      await confirm.click();
      await settle(page, gate);
      await releaseTheDashboardOwnChunks(gate);
      await expect(dashboard(page).locator('[data-testid=confirmed]')).toHaveAttribute('data-done');
      expect(stillLoading).toBeGreaterThan(0);
      expect(gate.held.length).toBeGreaterThanOrEqual(stillLoading);
      await releaseAll(gate);
    });
  });
});
