import { expect, test } from '@playwright/test';
import { labelRequest } from '../utils/app';
import { fixtureById } from '../utils/fixtures';
import {
  maxSpeculativeInFlight,
  preloaderLinks,
  recordSpeculativePreloads,
  speculativeOrder,
  speculativePreloads,
  waitForNetworkIdle,
  waitForQwikloader,
} from '../utils/gate';

const ALL_AT_ONCE = '/all-at-once/';

test.describe('queue', () => {
  test('never has more than one speculative preload in flight', async ({ page }, testInfo) => {
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
    test.fail(
      true,
      'on main, the speculative queue runs bottom-up, so off-screen handlers go first'
    );
    expect(lastInView).toBeGreaterThanOrEqual(0);
    expect(firstOffScreen).toBeGreaterThanOrEqual(0);
    expect(lastInView).toBeLessThan(firstOffScreen);
  });
});
