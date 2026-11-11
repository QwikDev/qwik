import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { chunkComesFrom, getManifest, ORIGIN } from '../utils/app';
import { fixtureById, NAVIGATION_SOURCES, type Fixture } from '../utils/fixtures';
import {
  createGate,
  preloaderLinks,
  recordSpeculativePreloads,
  release,
  resultIsDone,
  waitForNetworkIdle,
  waitForQwikloader,
} from '../utils/gate';
import {
  findLongTasks,
  longTasksFromThePreloader,
  throttleLikeAMidTierPhone,
  traceLongTasks,
  type LongTask,
  type TraceEvent,
} from '../utils/long-tasks';
import { expectResult, fixtureResult, fixtureRoot } from '../utils/scenarios';

const CONDITIONAL_ALL = fixtureById('conditional/all');
const FROM_OFF: Fixture = {
  id: 'navigation/from-off',
  path: '/navigation/from/off/',
  sources: NAVIGATION_SOURCES,
};
const TO_TREE: Fixture = {
  id: 'navigation/to-tree',
  path: '/navigation/to-tree/',
  sources: NAVIGATION_SOURCES,
  expected: '5',
};

const preloaderUrl = () => `${ORIGIN}/build/${getManifest().preloader}`;

const preloadedUrls = (page: Page) => async () =>
  new Set((await preloaderLinks(page)).map((link) => link.href));

const waitForPreloader = (page: Page) =>
  page.waitForFunction(() => typeof (globalThis as any).qPreload === 'function', null, {
    timeout: 30_000,
  });

const report = async (testInfo: TestInfo, cpuRate: number, tasks: LongTask[]) => {
  await testInfo.attach('long-tasks.json', {
    body: JSON.stringify({ cpuRate, tasks }, null, 2),
    contentType: 'application/json',
  });
};

const PRELOADER_URL = 'https://app.test/build/qwik-preloader.js';
const MAIN_THREAD = { pid: 1, tid: 1 };
const MICROSECONDS = 1000;

const mainThreadName: TraceEvent = {
  name: 'thread_name',
  ph: 'M',
  ts: 0,
  ...MAIN_THREAD,
  args: { name: 'CrRendererMain' },
};

const task = (wallMs: number, cpuMs: number): TraceEvent => ({
  name: 'RunTask',
  ph: 'X',
  ts: 0,
  dur: wallMs * MICROSECONDS,
  tts: 0,
  tdur: cpuMs * MICROSECONDS,
  ...MAIN_THREAD,
});

const preloaderCall = (wallMs: number, cpuMs: number): TraceEvent => ({
  name: 'FunctionCall',
  ph: 'X',
  ts: MICROSECONDS,
  dur: wallMs * MICROSECONDS,
  tts: MICROSECONDS,
  tdur: cpuMs * MICROSECONDS,
  ...MAIN_THREAD,
  args: { data: { url: PRELOADER_URL } },
});

const longTasksFromThePreloaderIn = (events: TraceEvent[]) =>
  longTasksFromThePreloader(findLongTasks([mainThreadName, ...events], PRELOADER_URL, new Set()));

test.describe('long-task detector', () => {
  test('counts the time the main thread ran, not the time it sat paused', () => {
    expect(longTasksFromThePreloaderIn([task(62, 20), preloaderCall(47, 5)])).toEqual([]);
  });

  test('still counts a task whose preloader work alone reaches 50 ms', () => {
    const flagged = longTasksFromThePreloaderIn([task(70, 70), preloaderCall(55, 55)]);
    expect(flagged.map((longTask) => longTask.preloaderMs)).toEqual([55]);
  });
});

test.describe('from load until the preloader is idle, on /all-at-once/', () => {
  test('no long task comes from the preloader', async ({ browser, page }, testInfo) => {
    test.setTimeout(300_000);
    await recordSpeculativePreloads(page);
    const cpuRate = await throttleLikeAMidTierPhone(page);
    const tasks = await traceLongTasks(
      browser,
      page,
      () =>
        waitForNetworkIdle(
          page,
          async () => {
            await page.goto('/all-at-once/');
            await waitForQwikloader(page);
            await waitForPreloader(page);
          },
          2000
        ),
      preloaderUrl,
      preloadedUrls(page)
    );
    await report(testInfo, cpuRate, tasks);
    expect((await preloaderLinks(page)).length).toBeGreaterThan(0);
    expect(longTasksFromThePreloader(tasks)).toEqual([]);
  });
});

test.describe('during a cold click', () => {
  test('no long task comes from the preloader', async ({ browser, page }, testInfo) => {
    test.setTimeout(180_000);
    await recordSpeculativePreloads(page);
    const cpuRate = await throttleLikeAMidTierPhone(page);
    const gate = await createGate(page);
    gate.holdWhilePassing = (url) => chunkComesFrom(url, CONDITIONAL_ALL.sources);
    await page.goto(CONDITIONAL_ALL.path);
    await waitForQwikloader(page);
    await waitForPreloader(page);
    let releasedDuringTheTrace = 0;
    const isDone = resultIsDone(fixtureResult(page, CONDITIONAL_ALL));
    const tasks = await traceLongTasks(
      browser,
      page,
      async () => {
        await fixtureRoot(page, CONDITIONAL_ALL).locator('[data-testid=trigger]').click();
        while (!(await isDone())) {
          const held = gate.held.splice(0);
          releasedDuringTheTrace += held.length;
          await release(held);
          await page.waitForTimeout(100);
        }
        await expectResult(page, CONDITIONAL_ALL);
        await page.waitForTimeout(1000);
      },
      preloaderUrl,
      preloadedUrls(page)
    );
    await report(testInfo, cpuRate, tasks);
    expect(releasedDuringTheTrace).toBeGreaterThan(0);
    expect(longTasksFromThePreloader(tasks)).toEqual([]);
  });
});

test.describe('during a SPA navigation', () => {
  test('no long task comes from the preloader', async ({ browser, page }, testInfo) => {
    test.setTimeout(180_000);
    await recordSpeculativePreloads(page);
    const cpuRate = await throttleLikeAMidTierPhone(page);
    await page.goto(FROM_OFF.path);
    await waitForQwikloader(page);
    await waitForPreloader(page);
    const tasks = await traceLongTasks(
      browser,
      page,
      async () => {
        await fixtureRoot(page, FROM_OFF).locator('[data-testid=link-tree]').click();
        await expectResult(page, TO_TREE);
        await page.waitForTimeout(1000);
      },
      preloaderUrl,
      preloadedUrls(page)
    );
    await report(testInfo, cpuRate, tasks);
    expect(longTasksFromThePreloader(tasks)).toEqual([]);
  });
});
