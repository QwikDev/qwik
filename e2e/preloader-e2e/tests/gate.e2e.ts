import { expect, test } from '@playwright/test';
import { chunkComesFrom, chunkUrlsFrom } from '../utils/app';
import { fixtureById, IMPORT_CHAIN } from '../utils/fixtures';
import {
  createGate,
  openCold,
  recordSpeculativePreloads,
  release,
  releaseAll,
  speculativePreloads,
  waitForQwikloader,
} from '../utils/gate';
import { clickTrigger, expectResult, warmClick } from '../utils/scenarios';
import { expectRoundTrips } from '../utils/click-tests';

const SINGLE_TASK_CHAIN = fixtureById('single/task-chain');
const unusedChunk = () => chunkUrlsFrom('src/components/fixtures/conditional/all/level-3.tsx')[0];

const openHolding = async (page: import('@playwright/test').Page) => {
  const gate = await createGate(page);
  await page.goto(SINGLE_TASK_CHAIN.path);
  await waitForQwikloader(page);
  gate.mode = 'hold';
  return gate;
};

const heldFor = (gate: Awaited<ReturnType<typeof openHolding>>, url: string) =>
  gate.held.filter((route) => route.request().url() === url);

test.describe('gate: counting round trips', () => {
  test('counts one round trip per chained user import(): 3 for a handler that awaits 3', async ({
    page,
  }) => {
    const roundTrips = await warmClick(page, IMPORT_CHAIN);
    expect(roundTrips).toHaveLength(3);
  });
});

test.describe('gate: keeping requests ongoing', () => {
  test('an ongoing preload never finishes until the test releases it', async ({ page }) => {
    const gate = await openHolding(page);
    const url = unusedChunk();
    await page.evaluate((href) => {
      const link = document.createElement('link');
      link.rel = 'modulepreload';
      link.href = href;
      link.onload = () => ((window as any).__preloaded = true);
      document.head.appendChild(link);
    }, url);
    await expect.poll(() => heldFor(gate, url).length).toBe(1);
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => (window as any).__preloaded)).toBeUndefined();
    await release(heldFor(gate, url));
    await expect.poll(() => page.evaluate(() => (window as any).__preloaded)).toBe(true);
  });

  test('an import() of a chunk whose preload is ongoing waits for it and sends no second request', async ({
    page,
  }) => {
    const gate = await openHolding(page);
    const url = unusedChunk();
    let requests = 0;
    page.on('request', (request) => request.url() === url && requests++);
    await page.evaluate((href) => {
      const link = document.createElement('link');
      link.rel = 'modulepreload';
      link.href = href;
      document.head.appendChild(link);
    }, url);
    await expect.poll(() => heldFor(gate, url).length).toBe(1);
    const imported = page.evaluate((href) => import(href).then(() => 'imported'), url);
    await page.waitForTimeout(500);
    expect(requests).toBe(1);
    await releaseAll(gate);
    expect(await imported).toBe('imported');
    expect(requests).toBe(1);
  });
});

test.describe('gate: cold click setup', () => {
  test("lets the page's own load work finish, without starting speculative preloads", async ({
    page,
  }) => {
    await recordSpeculativePreloads(page);
    const requests: string[] = [];
    page.on('request', (request) => requests.push(request.url()));
    const gate = await createGate(page);
    await openCold(page, gate, SINGLE_TASK_CHAIN.path);
    expect((await speculativePreloads(page)).size).toBe(0);
    expect(requests.filter((url) => chunkComesFrom(url, SINGLE_TASK_CHAIN.sources))).toEqual([]);
    expect(gate.held).toEqual([]);
    const roundTrips = await clickTrigger({ page, fixture: SINGLE_TASK_CHAIN, gate });
    expectRoundTrips(roundTrips);
    await expectResult(page, SINGLE_TASK_CHAIN);
    await releaseAll(gate);
  });
});
