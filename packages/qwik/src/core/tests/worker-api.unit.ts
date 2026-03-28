import { inlinedQrl, worker$, workerQrl } from '@qwik.dev/core';
import { worker$ as directWorker$, workerQrl as directWorkerQrl } from '../../web-worker';
import { describe, expect, it } from 'vitest';

describe('worker api', () => {
  it('exports worker helpers from @qwik.dev/core', () => {
    expect(worker$).toBe(directWorker$);
    expect(workerQrl).toBe(directWorkerQrl);
  });

  it('does not require an experimental flag', () => {
    expect(() => workerQrl(inlinedQrl(() => 1, 'worker_test'))).not.toThrow();
  });
});
