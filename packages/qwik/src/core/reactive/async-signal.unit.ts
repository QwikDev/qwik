import { describe, expect, it } from 'vitest';
import { createOwner, runWithOwner } from '../runtime/owner';
import { useSignal, useAsync } from './public-api';
import { _await } from './tracking';

describe('async signal', () => {
  it('tracks async dependencies before and after await', async () => {
    const before = useSignal(0);
    const after = useSignal(10);
    const seen: string[] = [];
    const signal = createOwned(() =>
      useAsync<number>(async () => {
        seen.push(`before:${before.value}`);
        (await _await(Promise.resolve()))();
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
      useAsync<number>(
        async () => {
          const value = dep.value;
          (
            await _await(
              new Promise<void>((resolve) => {
                release = resolve;
              })
            )
          )();
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
      useAsync<number>(async () => {
        (await _await(Promise.resolve()))();
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
      useAsync<number>(async ({ abortSignal: signal, cleanup }) => {
        abortSignal = signal;
        cleanup(() => {
          cleaned = true;
        });
        started = true;
        (
          await _await(
            new Promise<void>((resolve) => {
              release = resolve;
            })
          )
        )();
        if (signal.aborted) {
          return 0;
        }
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
      useAsync<number>(
        async () => {
          (await _await(new Promise(() => {})))();
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
