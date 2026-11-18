import { expect, test } from '@playwright/test';
import {
  chunkComesFrom,
  chunkHoldsEventQrls,
  chunkHoldsOnlyRender,
  chunkOfSymbolNamed,
  chunkUrlsFrom,
  getManifest,
  labelRequest,
  ORIGIN,
} from '../utils/app';
import { fixtureById, MODAL, type Fixture } from '../utils/fixtures';
import {
  countRoundTrips,
  createGate,
  FILLER,
  maxSpeculativeInFlight,
  openWarm,
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
const LAYOUT_SOURCES = [FILLER, 'src/routes/layout', 'src/components/sidebar/'];
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

  test('no speculative preload starts while a highest priority preload is in flight', async ({
    page,
  }) => {
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
    const highestPriorityPreloadIsInFlight = async () => {
      const highestPriority = (await linksSinceTheClick())
        .filter((link) => !link.speculative)
        .map((link) => link.href);
      return gate.held.some((route) => highestPriority.includes(route.request().url()));
    };
    await countRoundTrips(
      page,
      gate,
      () => fixtureRoot(page, WITH_25_IDLE_PRELOADS).locator('[data-testid=trigger]').click(),
      highestPriorityPreloadIsInFlight
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
    expect(lastInView).toBeLessThan(firstOffScreen);
  });
});

const routerChunkUrls = (segment: string) =>
  Object.entries(getManifest().bundles)
    .filter(([, bundle]) =>
      bundle.origins?.some((origin) => origin.includes(`qwik-router/lib/index.qwik.mjs_${segment}`))
    )
    .map(([file]) => `${ORIGIN}/build/${file}`);

test.describe('speculative order', () => {
  test('event QRL chunks are preloaded before render chunks', async ({ page }) => {
    await recordSpeculativePreloads(page);
    await openWarm(page, await createGate(page), ALL_AT_ONCE);
    const preloaded = [...new Set((await preloaderLinks(page)).map((link) => link.href))];
    const medianPositionOf = (isWanted: (url: string) => boolean) => {
      const positions = preloaded.flatMap((url, index) => (isWanted(url) ? [index] : []));
      return positions[Math.floor(positions.length / 2)];
    };
    expect(medianPositionOf(chunkHoldsEventQrls)).toBeLessThan(
      medianPositionOf(chunkHoldsOnlyRender)
    );
  });

  test("a layout's event QRL chunks are preloaded before the page's", async ({ page }) => {
    await recordSpeculativePreloads(page);
    await openWarm(page, await createGate(page), MODAL.path);
    const preloaded = [...new Set((await preloaderLinks(page)).map((link) => link.href))];
    const positionsOfEventQrlChunksFrom = (sources: string[]) =>
      preloaded.flatMap((url, index) =>
        chunkHoldsEventQrls(url) && chunkComesFrom(url, sources) ? [index] : []
      );
    const inTheLayout = positionsOfEventQrlChunksFrom(LAYOUT_SOURCES);
    const inThePage = positionsOfEventQrlChunksFrom(MODAL.sources);
    expect(inTheLayout.length).toBeGreaterThan(0);
    expect(inThePage.length).toBeGreaterThan(0);
    expect(Math.max(...inTheLayout)).toBeLessThan(Math.min(...inThePage));
  });
});

test.describe('what the page asks the preloader for at load', () => {
  test('its root component, its layout and its route, not every chunk it used', async ({
    page,
  }) => {
    const response = await page.goto(CONDITIONAL_ALL.path);
    const [, askedFor] = (await response!.text()).match(/\.then\(\(\{p\}\)=>p\((\[[^\]]*\])\)\)/)!;
    expect(JSON.parse(askedFor)).toEqual([
      chunkOfSymbolNamed('root.tsx_root_component'),
      'Layout',
      'conditional/all/',
    ]);
  });

  test('the render chunk of a component with no handler, task or computed is preloaded', async ({
    page,
  }) => {
    await recordSpeculativePreloads(page);
    await openWarm(page, await createGate(page), CONDITIONAL_ALL.path);
    const preloaded = (await preloaderLinks(page)).map((link) => link.href);
    const [sidebar] = chunkUrlsFrom('src/components/sidebar/sidebar.tsx_Sidebar_component');
    expect(sidebar).toBeDefined();
    expect(preloaded).toContain(sidebar);
  });

  test("the router's own chunks are preloaded", async ({ page }) => {
    await recordSpeculativePreloads(page);
    await openWarm(page, await createGate(page), CONDITIONAL_ALL.path);
    const preloaded = (await preloaderLinks(page)).map((link) => link.href);
    const [spaInit] = routerChunkUrls('spa_init_event');
    expect(spaInit).toBeDefined();
    expect(preloaded).toContain(spaInit);
  });
});
