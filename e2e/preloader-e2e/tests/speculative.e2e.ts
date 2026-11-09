import { expect, test } from '@playwright/test';
import {
  maxSpeculativeInFlight,
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
});
