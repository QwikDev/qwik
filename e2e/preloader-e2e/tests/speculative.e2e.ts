import { expect, test } from '@playwright/test';
import {
  createGate,
  maxSpeculativeInFlight,
  recordSpeculativeOrder,
  recordSpeculativePreloads,
  speculativePreloads,
  waitForQwikloader,
} from '../utils/gate';

const ALL_AT_ONCE = '/all-at-once/';

test.describe('queue', () => {
  test('never has more than one speculative preload in flight', async ({ page }) => {
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
    expect((await speculativePreloads(page)).size).toBeGreaterThan(0);
    expect(await maxSpeculativeInFlight(page)).toBe(1);
  });

  test('the preload order after loading /all-at-once/ matches the snapshot', async ({ page }) => {
    await recordSpeculativePreloads(page);
    const gate = await createGate(page);
    page.once('load', () => {
      gate.mode = 'hold';
    });
    await page.goto(ALL_AT_ONCE);
    expect(await recordSpeculativeOrder(page, gate)).toMatchSnapshot('all-at-once.order.txt');
  });
});
