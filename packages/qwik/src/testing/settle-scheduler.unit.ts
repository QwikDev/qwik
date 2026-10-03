import { describe, expect, it } from 'vitest';
import { Scheduler } from '../core/runtime/scheduler';
import { createQRL } from '../core/shared/qrl/qrl-class';
import { settleScheduler } from './resume-session';

describe('settleScheduler', () => {
  it('waits for a lazy QRL whose chunk is still loading', async () => {
    let isLoaded = false;
    const slowChunk = () =>
      new Promise<Record<string, () => void>>((resolve) =>
        setTimeout(() => {
          isLoaded = true;
          resolve({ handler: () => {} });
        }, 300)
      );
    const qrl = createQRL('./slow.js', 'handler', null, slowChunk);

    void qrl.resolve();
    await settleScheduler(new Scheduler(() => {}));

    expect(isLoaded).toBe(true);
  });
});
