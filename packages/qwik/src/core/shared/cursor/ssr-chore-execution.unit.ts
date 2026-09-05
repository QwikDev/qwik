import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WrappedSignalImpl } from '../../reactive-primitives/impl/wrapped-signal-impl';
import type { ISsrNode, SSRContainer } from '../../ssr/ssr-types';
import { getPlatform, setPlatform } from '../platform/platform';
import { ChoreBits } from '../vnode/enums/chore-bits.enum';
import { markVNodeDirty } from '../vnode/vnode-dirty';
import { HOST_SIGNAL } from './cursor-props';

describe('streamed SSR compute chores', () => {
  let previousPlatform: ReturnType<typeof getPlatform>;

  beforeEach(() => {
    previousPlatform = getPlatform();
    setPlatform({ ...previousPlatform, isServer: true });
  });

  afterEach(() => {
    setPlatform(previousPlatform);
  });

  it.each(['resolve', 'reject'])('tracks a suspended computation that will %s', async (outcome) => {
    let resolve!: () => void;
    let reject!: (error: Error) => void;
    const pending = new Promise<void>((resolvePromise, rejectPromise) => {
      resolve = resolvePromise;
      reject = rejectPromise;
    });
    const compute = vi
      .fn()
      .mockReturnValue(42)
      .mockImplementationOnce(() => {
        throw pending;
      });
    const node = { flags: 0, dirty: ChoreBits.NONE } as unknown as ISsrNode;
    const container = {
      $renderPromise$: null,
      getHostProp: vi.fn(),
    } as unknown as SSRContainer;
    const signal = new WrappedSignalImpl(container, compute, [], null);
    vi.mocked(container.getHostProp).mockImplementation((_host, prop) =>
      prop === HOST_SIGNAL ? signal : null
    );

    try {
      const result = markVNodeDirty(container, node, ChoreBits.COMPUTE);
      expect(result).toBeInstanceOf(Promise);
      expect(container.$renderPromise$).toBe(result);
      expect(node.dirty).toBe(ChoreBits.NONE);
      expect(compute).toHaveBeenCalledTimes(1);

      if (outcome === 'reject') {
        const error = new Error('computation failed');
        const assertion = expect(container.$renderPromise$).rejects.toBe(error);
        reject(error);
        await assertion;
        expect(compute).toHaveBeenCalledTimes(1);
      } else {
        resolve();
        await container.$renderPromise$;
        expect(compute).toHaveBeenCalledTimes(2);
        expect(signal.$untrackedValue$).toBe(42);
      }
    } finally {
      resolve();
    }
  });
});
