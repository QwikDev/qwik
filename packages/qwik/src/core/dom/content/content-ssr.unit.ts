import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { SSRContent, SSRContentSubscription } from './content';
import { createQRL } from '../../shared/qrl/qrl-class';
import { maybeThen } from '../../shared/utils/promises';
import { resolveSsrOutput, type SsrContentContext, type SsrOutput } from '../../ssr/output';
import type { ContainerContext } from '../../runtime/container-context';
import { getActiveInvokeContextOrNull } from '../../runtime/invoke-context';
import {
  createOwner,
  disposeOwner,
  getOrCreateContextOwner,
  runWithOwner,
  type Owner,
} from '../../runtime/owner';
import { disposeSubscriber } from '../../reactive/cleanup';
import { OwnerFlags } from '../../reactive/flags';

const parents: Owner[] = [];
afterEach(() => {
  for (let index = 0; index < parents.length; index++) {
    disposeOwner(parents[index]);
  }
  parents.length = 0;
  vi.restoreAllMocks();
});
function setup(run: () => SsrOutput, ownOutput = vi.fn((output: SsrOutput) => output)) {
  const parent = createOwner(null);
  parents.push(parent);
  const content = new SSRContent(1, [], createQRL('', 'content', run), null, {
    ownOutput,
    scheduler: { notify() {} },
  });
  const subscription = new SSRContentSubscription(content);
  return {
    content,
    subscription,
    ownOutput,
    run: () => runWithOwner(parent, () => content.run(undefined, subscription)),
  };
}

describe('SSRContent output lifetime', () => {
  it('requires a server context instead of a client container', () => () => {
    expectTypeOf<
      ConstructorParameters<typeof SSRContent>[4]
    >().not.toEqualTypeOf<ContainerContext>();
    const server: SsrContentContext = { scheduler: { notify() {} } };
    // @ts-expect-error Server scheduling does not provide client flushes.
    server.scheduler.waitFor(Promise.resolve(), null);
    const client = null! as ContainerContext;
    const qrl = createQRL('', 'content', () => '');
    // @ts-expect-error Client containers cannot publish server output.
    new SSRContent(0, [], qrl, null, client);
  });

  it.each(['returned', 'thrown', 'nested', 'rejected'] as const)(
    'ignores an old %s render after the same content starts again',
    async (kind) => {
      let release!: (output: string) => void;
      let reject!: (error: Error) => void;
      const pending = new Promise<string>((resolve, fail) => {
        release = resolve;
        reject = fail;
      });
      const owners: Owner[] = [];
      const scope = setup(() => {
        owners.push(getOrCreateContextOwner(getActiveInvokeContextOrNull())!);
        if (owners.length > 1) {
          return 'current';
        }
        if (kind === 'thrown') {
          throw pending;
        }
        return kind === 'nested' ? ['prefix', pending] : pending;
      });
      const first = scope.run();
      scope.content.dispose();
      expect(runWithOwner(scope.subscription.owner, () => scope.content.run())).toBe('current');
      if (kind === 'rejected') {
        reject(new Error('old render failed'));
      } else {
        release('PRIVATE_OLD_OUTPUT');
      }
      await expect(first).resolves.toBe('');
      expect(scope.ownOutput.mock.calls.map(([output]) => output)).toEqual(['current']);
      expect(scope.content.currentOwner).toBe(owners[1]);
      expect(owners[0].isCancelled).toBe(true);
      expect(owners[1].isCancelled).toBe(false);
    }
  );

  it('keeps a synchronous tree intact and observes only pending children', async () => {
    const observe = vi.fn<(value: unknown, fulfilled: unknown) => void>();
    const observeOutput: typeof maybeThen = (value, fulfilled) => {
      observe(value, fulfilled);
      return maybeThen(value, fulfilled);
    };
    const output = ['prefix', ['ready']];
    expect(resolveSsrOutput(output, observeOutput)).toBe(output);
    expect(observe).not.toHaveBeenCalled();
    const child = Promise.resolve('ready');
    expect(await resolveSsrOutput(['prefix', child], observeOutput)).toEqual(['prefix', 'ready']);
    expect(observe).toHaveBeenCalledTimes(1);
    expect(observe).toHaveBeenCalledWith(child, expect.any(Function));
  });

  it('observes a returned Promise source once', async () => {
    const source = Promise.resolve('ready');
    const sourceThen = vi.spyOn(source, 'then');
    const scope = setup(() => source);
    await expect(scope.run()).resolves.toBe('ready');
    expect(sourceThen).toHaveBeenCalledTimes(1);
    expect(scope.ownOutput).toHaveBeenCalledTimes(1);
    expect(scope.content.isPending).toBe(false);
  });

  it('returns synchronous output directly', () => {
    const scope = setup(() => 'ready');
    expect(scope.run()).toBe('ready');
    expect(scope.ownOutput).toHaveBeenCalledTimes(1);
  });

  it.each([
    'producer-sync',
    'producer-async',
    'resolve-sync',
    'resolve-async',
    'nested',
    'publish-sync',
    'publish-async',
  ] as const)('disposes the rendering owner after a %s error', async (stage) => {
    const error = new Error('content failed');
    let child!: Owner;
    const broken = new Proxy(['unpublished'], {
      get(target, key, receiver) {
        if (key === 'length') {
          throw error;
        }
        return Reflect.get(target, key, receiver);
      },
    });
    const ownOutput = vi.fn((output: SsrOutput) => {
      if (stage.startsWith('publish')) {
        throw error;
      }
      return output;
    });
    const scope = setup(() => {
      child = getOrCreateContextOwner(getActiveInvokeContextOrNull())!;
      switch (stage) {
        case 'producer-sync':
          throw error;
        case 'producer-async':
          return Promise.reject(error);
        case 'resolve-sync':
          return broken;
        case 'resolve-async':
          return Promise.resolve(broken);
        case 'nested':
          return ['prefix', Promise.reject(error)];
        case 'publish-sync':
          return 'ready';
        case 'publish-async':
          return Promise.resolve('ready');
      }
    }, ownOutput);
    await expect(async () => scope.run()).rejects.toBe(error);
    expect(scope.content.isCancelled).toBe(true);
    expect(scope.content.currentOwner).toBeNull();
    expect(scope.content.pendingOwner).toBeNull();
    expect(child.flags & OwnerFlags.Disposed).not.toBe(0);
  });

  it('does not publish if output resolution disposes the subscription', async () => {
    let child!: Owner;
    const output = new Proxy(['PRIVATE_DISPOSED_OUTPUT'], {
      get(target, key, receiver) {
        if (key === '0') {
          disposeSubscriber(scope.subscription);
        }
        return Reflect.get(target, key, receiver);
      },
    });
    const scope = setup(() => {
      child = getOrCreateContextOwner(getActiveInvokeContextOrNull())!;
      return Promise.resolve(output);
    });
    await expect(scope.run()).resolves.toBe('');
    expect(scope.ownOutput).not.toHaveBeenCalled();
    expect(child.flags & OwnerFlags.Disposed).not.toBe(0);
  });

  it('ignores nested output resolved after disposal', async () => {
    let release!: (value: string) => void;
    const nested = new Promise<string>((resolve) => {
      release = resolve;
    });
    const observe = vi.spyOn(nested, 'then');
    const scope = setup(() => Promise.resolve(['prefix', nested]));
    const running = scope.run();
    for (let tick = 0; tick < 12; tick++) {
      await Promise.resolve();
    }
    expect(observe).toHaveBeenCalledTimes(1);
    disposeSubscriber(scope.subscription);
    release('PRIVATE_LATE_OUTPUT');
    await expect(running).resolves.toBe('');
    await nested;
    await Promise.resolve();
    expect(scope.ownOutput).not.toHaveBeenCalled();
  });
});
