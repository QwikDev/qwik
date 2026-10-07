import { afterEach, describe, expect, it, vi } from 'vitest';
import { createOwner, runWithOwner } from '../runtime/owner';
import { createQRL } from '../shared/qrl/qrl-class';
import { _capturesObj, setCaptures } from '../shared/qrl/qrl-captures';
import { disposeSubscriber } from './cleanup';
import { useAsyncQrl, useComputedQrl, useSignal } from './public-api';
import type { ComputeCtx } from './public-types';
import type { Signal } from './signal';
import { _await } from './tracking';

afterEach(() => setCaptures(null));

describe.each([
  ['computed', useComputedQrl],
  ['async', useAsyncQrl],
] as const)('%s QRL captures', (_, createComputed) => {
  it('shares the loaded body while keeping each computed scope and receiver', async () => {
    const firstSource = useSignal(1);
    const secondSource = useSignal(3);
    const receivers: unknown[] = [];
    const body = function (this: unknown) {
      const [source, options, offsets] = _capturesObj._ as [
        Signal<number>,
        { offset: number },
        number[],
      ];
      receivers.push(this);
      return source.value + options.offset + offsets[0];
    };
    const load = vi.fn(async () => ({ body }));
    const firstQrl = createQRL('computed', 'body', null, load, [firstSource, { offset: 2 }, [7]]);
    const secondQrl = firstQrl.w([secondSource, { offset: 4 }, [9]]);
    const owner = createOwner(null);
    const first = runWithOwner(owner, () => createComputed(firstQrl));
    const second = runWithOwner(owner, () => createComputed(secondQrl));

    await Promise.all([first.promise(), second.promise()]);
    expect([first.value, second.value]).toEqual([10, 16]);
    expect(receivers).toEqual([first, second]);
    expect(load).toHaveBeenCalledOnce();
    expect(firstQrl.resolved).toBeUndefined();
    expect(secondQrl.resolved).toBeUndefined();

    const reload = vi.spyOn(firstQrl.$lazy$, '$load$');
    firstSource.value = 5;
    await first.promise();
    expect([first.value, second.value]).toEqual([14, 16]);
    expect(reload).not.toHaveBeenCalled();

    const resolved = await secondQrl.resolve();
    expect(resolved).not.toBe(body);
    expect(resolved()).toBe(16);
    expect(await secondQrl()).toBe(16);
    expect(firstQrl.resolved).toBeUndefined();
    disposeSubscriber(first);
    disposeSubscriber(second);
    expect(firstSource.subs).toBeNull();
    expect(secondSource.subs).toBeNull();
  });

  it('tracks reads after await and runs cleanup with raw captures', async () => {
    const before = useSignal(1);
    const after = useSignal(10);
    const cleanup = vi.fn();
    const body = async (ctx: ComputeCtx<number>) => {
      const [first, second] = _capturesObj._ as [Signal<number>, Signal<number>];
      ctx.cleanup(cleanup);
      const value = first.value;
      (await _await(Promise.resolve()))();
      return value + second.value;
    };
    const qrl = createQRL('computed', 'body', null, async () => ({ body }), [before, after]);
    const computed = runWithOwner(createOwner(null), () => createComputed(qrl));

    await computed.promise();
    expect(computed.value).toBe(11);
    expect(computed.deps).toEqual([before, after]);
    expect(qrl.resolved).toBeUndefined();
    after.value = 20;
    await computed.promise();
    expect(computed.value).toBe(21);
    expect(cleanup).toHaveBeenCalledOnce();
    disposeSubscriber(computed);
    expect(cleanup).toHaveBeenCalledTimes(2);
    expect(before.subs).toBeNull();
    expect(after.subs).toBeNull();
  });

  it('honors a public resolved override without restoring unused captures', async () => {
    const restoreCaptures = vi.fn(async () => ['unused']);
    const load = vi.fn(async () => ({ body: () => 1 }));
    const qrl = createQRL('computed', 'body', null, load, '0', { restoreCaptures } as any);
    qrl.resolved = () => 7;
    const computed = runWithOwner(createOwner(null), () => createComputed(qrl));

    expect(computed.value).toBe(7);
    expect(restoreCaptures).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
    disposeSubscriber(computed);
  });

  it('keeps a synchronous preload failure inside the computed error state', async () => {
    const error = new Error('failed import');
    const qrl = createQRL<() => number>('computed', 'body', null, () => {
      throw error;
    });
    const computed = runWithOwner(createOwner(null), () => createComputed(qrl));

    await computed.promise();
    expect(computed.error).toBe(error);
    disposeSubscriber(computed);
  });
});
