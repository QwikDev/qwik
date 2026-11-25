import { expect, test } from '@playwright/test';
import {
  chunkComesFrom,
  chunkIsImportedStatically,
  chunkKind,
  chunkUrlsFrom,
  labelRequest,
  ORIGIN,
  type ChunkKind,
} from '../utils/app';
import { fixtureById, type Fixture } from '../utils/fixtures';
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
const TREE_OF_TASKS = fixtureById('tree/task-chain');
const STATIC_FILLER_COMPONENT = 'src/components/filler/collapsible-01.tsx_Root_component';
const IN_VIEW_AFTER_OFF_SCREEN = '/speculative/in-view/';
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
});

test.describe('handlers in view', () => {
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

  test("an in-view button's click handler is preloaded before an off-screen one that comes first in the HTML", async ({
    page,
  }) => {
    await recordSpeculativePreloads(page);
    await waitForNetworkIdle(
      page,
      async () => {
        await page.goto(IN_VIEW_AFTER_OFF_SCREEN);
        await waitForQwikloader(page);
      },
      1500
    );
    const clickHandlers = (await preloaderLinks(page))
      .filter((link) => link.speculative)
      .map((link) => labelRequest(link.href).match(/in-view\/(.+)-button\.tsx_.*_q_e_click/)?.[1])
      .filter((button) => button !== undefined);
    expect(clickHandlers).toEqual(['in-view', 'off-screen']);
  });
});

const KIND_ORDER: ChunkKind[] = ['handler', 'other-qrl', 'component'];

test.describe('speculative order', () => {
  test('handlers are preloaded first, then tasks and computeds, then components', async ({
    page,
  }) => {
    await recordSpeculativePreloads(page);
    await openWarm(page, await createGate(page), ALL_AT_ONCE);
    const kinds = (await preloaderLinks(page))
      .filter((link) => link.speculative && !chunkIsImportedStatically(link.href))
      .map((link) => chunkKind(link.href))
      .filter((kind) => kind !== undefined);
    expect(new Set(kinds)).toEqual(new Set(KIND_ORDER));
    expect(kinds).toEqual([...kinds].sort((a, b) => KIND_ORDER.indexOf(a) - KIND_ORDER.indexOf(b)));
  });
});

test.describe('chunks the page names', () => {
  test('the HTML lists only chunks that hold nothing but a component', async ({ page }) => {
    const response = await page.goto(CONDITIONAL_ALL.path);
    const [, chunkList] = (await response!.text()).match(/\(\{p\}\)=>p\((\[[^\]]*\])\)/)!;
    const listed = (JSON.parse(chunkList) as string[]).map((name) => `${ORIGIN}/build/${name}`);
    expect(listed.length).toBeGreaterThan(0);
    expect(listed.filter((url) => chunkKind(url) !== 'component')).toEqual([]);
  });

  test('the render chunk of a component that cannot render again is not preloaded', async ({
    page,
  }) => {
    await recordSpeculativePreloads(page);
    await openWarm(page, await createGate(page), CONDITIONAL_ALL.path);
    const preloaded = (await preloaderLinks(page)).map((link) => link.href);
    const renderChunks = chunkUrlsFrom(STATIC_FILLER_COMPONENT).filter(
      (url) => chunkKind(url) === 'component'
    );
    expect(renderChunks.length).toBeGreaterThan(0);
    expect(renderChunks.filter((url) => preloaded.includes(url))).toEqual([]);
  });

  test('a chunk that only holds tasks or computeds is preloaded', async ({ page }) => {
    await recordSpeculativePreloads(page);
    await openWarm(page, await createGate(page), TREE_OF_TASKS.path);
    const preloaded = new Set((await preloaderLinks(page)).map((link) => link.href));
    const withTasksOnly = TREE_OF_TASKS.sources
      .flatMap(chunkUrlsFrom)
      .filter((url) => chunkKind(url) === 'other-qrl');
    expect(withTasksOnly.length).toBeGreaterThan(0);
    expect(withTasksOnly.filter((url) => !preloaded.has(url))).toEqual([]);
  });
});
