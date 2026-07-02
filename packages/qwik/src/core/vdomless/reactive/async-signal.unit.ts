import { describe, expect, it } from 'vitest';
import { createOwner, runWithOwner } from '../runtime/owner';
import { createAsync } from './async-signal';
import { useSignal } from './signal';

describe('vdomless async signal', () => {
  it('tracks generator dependencies before and after yield', async () => {
    const before = useSignal(0);
    const after = useSignal(10);
    const seen: string[] = [];
    const signal = createOwned(() =>
      createAsync<number>(function* () {
        seen.push(`before:${before.value}`);
        yield Promise.resolve();
        seen.push(`after:${after.value}`);
        return before.value + after.value;
      })
    );

    await signal.promise();
    expect(signal.value).toBe(10);

    before.value = 1;
    await signal.promise();
    expect(signal.value).toBe(11);

    after.value = 11;
    await signal.promise();
    expect(signal.value).toBe(12);
    expect(seen).toEqual(['before:0', 'after:10', 'before:1', 'after:10', 'before:1', 'after:11']);
  });

  it('returns stale value while recomputing', async () => {
    let release!: () => void;
    const dep = useSignal(1);
    const signal = createOwned(() =>
      createAsync<number>(
        function* () {
          const value = dep.value;
          yield new Promise<void>((resolve) => {
            release = resolve;
          });
          return value;
        },
        { initial: 0 }
      )
    );

    expect(signal.value).toBe(0);
    expect(signal.loading).toBe(true);
    await settle();
    release();
    await signal.promise();
    expect(signal.value).toBe(1);

    dep.value = 2;
    expect(signal.value).toBe(1);
    expect(signal.loading).toBe(true);
    await settle();
    release();
    await signal.promise();
    expect(signal.value).toBe(2);
  });

  it('captures errors', async () => {
    const signal = createOwned(() =>
      createAsync<number>(function* () {
        yield Promise.resolve();
        throw new Error('boom');
      })
    );

    await signal.promise();

    expect(signal.error?.message).toBe('boom');
    expect(() => signal.value).toThrow('boom');
  });

  it('runs cleanups and aborts current work', async () => {
    let abortSignal: AbortSignal | undefined;
    let cleaned = false;
    let started = false;
    let continued = false;
    let release!: () => void;
    const signal = createOwned(() =>
      createAsync<number>(function* ({ abortSignal: signal, cleanup }) {
        abortSignal = signal;
        cleanup(() => {
          cleaned = true;
        });
        started = true;
        yield new Promise<void>((resolve) => {
          release = resolve;
        });
        continued = true;
        return 1;
      })
    );

    expect(() => signal.value).toThrow(Promise);
    await waitFor(() => started);
    signal.abort();
    release();
    await settle();

    expect(abortSignal?.aborted).toBe(true);
    expect(cleaned).toBe(true);
    expect(continued).toBe(false);
  });

  it('times out pending work', async () => {
    const signal = createOwned(() =>
      createAsync<number>(
        function* () {
          yield new Promise(() => {});
          return 1;
        },
        { timeout: 1 }
      )
    );

    await signal.promise();

    expect(signal.error?.message).toBe('timeout 1ms');
  });
});

function createOwned<T>(run: () => T): T {
  return runWithOwner(createOwner(null), run);
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

async function waitFor(check: () => boolean): Promise<void> {
  for (let i = 0; i < 10 && !check(); i++) {
    await settle();
  }
}
