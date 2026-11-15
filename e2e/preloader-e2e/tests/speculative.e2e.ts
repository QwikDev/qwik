import { expect, test } from '@playwright/test';
import { chunkComesFrom, labelRequest } from '../utils/app';
import { fixtureById, type Fixture } from '../utils/fixtures';
import {
  countRoundTrips,
  createGate,
  FILLER,
  maxSpeculativeInFlight,
  preloaderLinks,
  recordSpeculativePreloads,
  release,
  releaseAll,
  settle,
  speculativeOrder,
  speculativePreloads,
  waitForNetworkIdle,
  waitForQwikloader,
} from '../utils/gate';
import { expectResult, fixtureRoot } from '../utils/scenarios';

const ALL_AT_ONCE = '/all-at-once/';
const CONDITIONAL_ALL = fixtureById('conditional/all');
const MAX_IDLE_PRELOADS = 25;
const WITH_25_IDLE_PRELOADS: Fixture = {
  ...CONDITIONAL_ALL,
  path: `${CONDITIONAL_ALL.path}?maxIdlePreloads=${MAX_IDLE_PRELOADS}`,
};

test.describe('queue', () => {
  test('never has more speculative preloads in flight than maxIdlePreloads allows', async ({
    page,
  }, testInfo) => {
    await recordSpeculativePreloads(page);
    await waitForNetworkIdle(
      page,
      async () => {
        await page.goto(ALL_AT_ONCE);
        await waitForQwikloader(page);
      },
      1500
    );
    await testInfo.attach('order.txt', {
      body: await speculativeOrder(page),
      contentType: 'text/plain',
    });
    expect((await speculativePreloads(page)).size).toBeGreaterThan(0);
    expect(await maxSpeculativeInFlight(page)).toBe(1);
  });

  test('no speculative preload starts while a needed preload is in flight', async ({ page }) => {
    await recordSpeculativePreloads(page);
    const gate = await createGate(page);
    gate.holdWhilePassing = (url) => chunkComesFrom(url, [FILLER]);
    await page.goto(WITH_25_IDLE_PRELOADS.path, { waitUntil: 'commit' });
    await waitForQwikloader(page);
    await expect.poll(() => gate.held.length, { timeout: 15_000 }).toBe(MAX_IDLE_PRELOADS);
    const fillerPreloads = gate.held.splice(0);
    gate.holdWhilePassing = undefined;
    const linksBeforeTheClick = (await preloaderLinks(page)).length;
    const linksSinceTheClick = async () => (await preloaderLinks(page)).slice(linksBeforeTheClick);
    const neededPreloadIsInFlight = async () => {
      const needed = (await linksSinceTheClick())
        .filter((link) => !link.speculative)
        .map((link) => link.href);
      return gate.held.some((route) => needed.includes(route.request().url()));
    };
    await countRoundTrips(
      page,
      gate,
      () => fixtureRoot(page, WITH_25_IDLE_PRELOADS).locator('[data-testid=trigger]').click(),
      neededPreloadIsInFlight
    );
    await release(fillerPreloads);
    await settle(page, gate);
    const links = await linksSinceTheClick();
    const startedMeanwhile = links
      .slice(links.findIndex((link) => !link.speculative))
      .filter((link) => link.speculative)
      .map((link) => link.href);
    await releaseAll(gate);
    await expectResult(page, WITH_25_IDLE_PRELOADS);
    expect(startedMeanwhile).toEqual([]);
  });

  test('in-view click handlers are preloaded before off-screen ones', async ({ page }) => {
    await recordSpeculativePreloads(page);
    await waitForNetworkIdle(
      page,
      async () => {
        await page.goto(fixtureById('single/task-chain').path);
        await waitForQwikloader(page);
      },
      1500
    );
    const fillerHandlers = (await preloaderLinks(page))
      .filter((link) => link.speculative)
      .map((link) => labelRequest(link.href).match(/collapsible-(\d+)\.tsx_.*_q_e_click/))
      .filter((match) => match !== null)
      .map((match) => Number(match[1]));
    const inViewCount = 20;
    const lastInView = Math.max(
      -1,
      ...fillerHandlers.map((n, index) => (n <= inViewCount ? index : -1))
    );
    const firstOffScreen = fillerHandlers.findIndex((n) => n > inViewCount);
    expect(lastInView).toBeGreaterThanOrEqual(0);
    expect(firstOffScreen).toBeGreaterThanOrEqual(0);
    test.fail(
      true,
      'on main, the speculative queue runs bottom-up, so off-screen handlers go first'
    );
    expect(lastInView).toBeLessThan(firstOffScreen);
  });
});
