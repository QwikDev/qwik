import { expect, test } from '@playwright/test';
import {
  maxSpeculativeInFlight,
  recordSpeculativePreloads,
  speculativeOrder,
  speculativePreloads,
  waitForQwikloader,
} from '../utils/gate';

const ALL_AT_ONCE = '/all-at-once/';

test.describe('queue', () => {
  test('never has more than one speculative preload in flight', async ({ page }, testInfo) => {
    await recordSpeculativePreloads(page);
    let requests = 0;
    page.on('request', () => requests++);
    await page.goto(ALL_AT_ONCE);
    await waitForQwikloader(page);
    let lastCount = -1;
    while (requests !== lastCount) {
      lastCount = requests;
      await page.waitForTimeout(1500);
    }
    await testInfo.attach('order.txt', {
      body: await speculativeOrder(page),
      contentType: 'text/plain',
    });
    expect((await speculativePreloads(page)).size).toBeGreaterThan(0);
    expect(await maxSpeculativeInFlight(page)).toBe(1);
  });
});
