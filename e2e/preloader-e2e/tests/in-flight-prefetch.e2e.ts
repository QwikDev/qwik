import { expect, test, type APIResponse, type Route } from '@playwright/test';
import { chunkUrlsFrom } from '../utils/app';
import { attachRoundTrips, ROUND_TRIPS_PER_CLICK } from '../utils/click-tests';
import { fixtureById } from '../utils/fixtures';
import {
  countRoundTrips,
  createGate,
  release,
  releaseAll,
  resultIsDone,
  recordSpeculativePreloads,
  settle,
  speculativePreloads,
  waitForQwikloader,
} from '../utils/gate';
import { expectResult, fixtureResult, fixtureRoot } from '../utils/scenarios';

const cases = [
  ['single/all', 'src/components/fixtures/single/all/index.tsx_all_component_a1_useComputed_'],
  ['tree/all', 'src/components/fixtures/tree/all/level-3.tsx_level_3_component_a1_useComputed_'],
  ['tree-context/all', 'src/components/fixtures/tree-context/all/contexts.ts'],
];

for (const maxIdlePreloads of [1, 25]) {
  test.describe(`ongoing prefetch, limit ${maxIdlePreloads}`, () => {
    for (const [id, source] of cases) {
      test(`${id}: a click shows its result within 2 round trips while a needed chunk's prefetch is ongoing`, async ({
        page,
      }) => {
        const fixture = fixtureById(id);
        const preloadUrls = chunkUrlsFrom(source);
        expect(preloadUrls).toHaveLength(1);
        const preloadUrl = preloadUrls[0];
        const pendingPreloads: { route: Route; response: APIResponse }[] = [];
        let requestCount = 0;
        let hasPreloadFinished = false;
        page.on('request', (request) => {
          if (request.url() === preloadUrl) {
            requestCount++;
          }
        });
        page.on('requestfinished', (request) => {
          if (request.url() === preloadUrl) {
            hasPreloadFinished = true;
          }
        });
        await recordSpeculativePreloads(page);
        const gate = await createGate(page);
        await page.route(preloadUrl, async (route) => {
          const response = await route.fetch();
          pendingPreloads.push({ route, response });
        });
        await page.goto(`${fixture.path}?maxIdlePreloads=${maxIdlePreloads}`);
        await waitForQwikloader(page);
        await expect.poll(() => pendingPreloads.length, { timeout: 15_000 }).toBe(1);
        await settle(page, gate);
        expect((await speculativePreloads(page)).has(preloadUrl)).toBe(true);
        expect(requestCount).toBe(1);
        expect(hasPreloadFinished).toBe(false);
        expect(pendingPreloads[0].response.ok()).toBe(true);

        gate.mode = 'hold';
        await fixtureRoot(page, fixture).locator('[data-testid=trigger]').click();
        await settle(page, gate);
        const firstRound = gate.held.splice(0);
        await expect(fixtureResult(page, fixture)).not.toHaveAttribute('data-done');
        // The earlier prefetch shares the first post-click network wait.
        await Promise.all([
          pendingPreloads[0].route.fulfill({ response: pendingPreloads[0].response }),
          release(firstRound),
        ]);
        const roundTrips = [
          { urls: [preloadUrl, ...firstRound.map((route) => route.request().url())] },
          ...(await countRoundTrips(
            page,
            gate,
            () => Promise.resolve(),
            resultIsDone(fixtureResult(page, fixture))
          )),
        ];
        await releaseAll(gate);
        await expectResult(page, fixture);
        await attachRoundTrips('round-trips.txt', roundTrips, fixture.sources);
        expect(roundTrips.length).toBeLessThanOrEqual(ROUND_TRIPS_PER_CLICK);
        expect(requestCount).toBe(1);
        expect(hasPreloadFinished).toBe(true);
      });
    }
  });
}
