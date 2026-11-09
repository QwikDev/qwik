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
import { warmClick } from '../utils/scenarios';

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

test.describe('counting round trips', () => {
  test('a warm click whose handler awaits 3 chained import()s takes exactly 3 round trips', async ({
    page,
  }) => {
    const roundTrips = await warmClick(page, IMPORT_CHAIN);
    expect(roundTrips).toHaveLength(3);
  });
});

test.describe('keeping requests ongoing', () => {
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

test.describe('cold click setup', () => {
  test("the page's own load work finishes first; one speculative preload stays ongoing", async ({
    page,
  }) => {
    await recordSpeculativePreloads(page);
    const gate = await createGate(page);
    const ongoing = await openCold(page, gate, SINGLE_TASK_CHAIN);
    const speculative = await speculativePreloads(page);
    expect(ongoing).toHaveLength(1);
    expect(speculative.has(ongoing[0].request().url())).toBe(true);
    expect(
      chunkComesFrom(ongoing[0].request().url(), [
        'src/components/filler/',
        ...SINGLE_TASK_CHAIN.sources,
      ])
    ).toBe(true);
    expect(gate.held).toEqual([]);
    await releaseAll(gate, ongoing);
  });
});
