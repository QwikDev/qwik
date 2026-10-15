import { describe, expect, it, vi } from 'vitest';
import { createDocument } from '../../../testing/document';
import { OwnerFlags } from '../../reactive/flags';
import { useSignal } from '../../reactive/public-api';
import { createQRL } from '../../shared/qrl/qrl-class';
import { createContainerContext } from '../../runtime/container-context';
import { getActiveInvokeContext, invoke, newInvokeContext } from '../../runtime/invoke-context';
import {
  createOwner,
  disposeOwner,
  registerSubscriberToOwner,
  type Owner,
} from '../../runtime/owner';
import { Computed } from '../../reactive/computed';
import { Scheduler } from '../../runtime/scheduler';
import { useTask } from '../../runtime/task';
import { setEvent } from '../event/event';
import type { QElement } from '../../shared/types';
import { BranchRange } from '../branch/branch';
import { createTextNodeEffect } from '../effect/text-effect';
import { createCatch, createSsrCatch, CatchContentSubscription } from './catch';
import { createPending, type ContentFn } from './content';
import type { SsrOutput, SsrCatchChunk } from '../../ssr/output';
import type { SsrRangeScope } from '../../ssr/output';
import { allocate } from '../../shared/serdes/allocate';
import { inflate } from '../../shared/serdes/inflate';
import { TypeIds } from '../../shared/serdes/type-id';
import { EffectKind } from '../effect/effect-kind.enum';
import { handleError } from './catch-boundary';
import { _catchError } from './catch-event';
import { isQrl } from '../../shared/qrl/qrl-utils';
import type { QRL } from '../../shared/qrl/qrl.public';

function setup(
  content: ContentFn | QRL<ContentFn>,
  fallback = createQRL<ContentFn>('chunk', 'fallback', (_ctx, error) => (error as Error).message)
) {
  const document = createDocument({ html: '<div></div>' });
  const host = document.querySelector('div')!;
  host.setAttribute('q:container', 'paused');
  const start = document.createComment('start');
  const end = document.createComment('end');
  host.appendChild(start);
  host.appendChild(end);
  const scheduler = new Scheduler(() => {});
  const ctx = createContainerContext(host, scheduler);
  const boundary = invoke(newInvokeContext({ owner: createOwner(null), container: ctx }), () =>
    createCatch(
      ctx,
      new BranchRange(document, start, end),
      isQrl<ContentFn>(content) ? content : createQRL('chunk', 'content', content),
      fallback
    )
  );
  return { boundary, host, ctx, scheduler };
}

describe('Catch content', () => {
  it('releases computed dependencies when its cleanup and fallback throw', async () => {
    const source = useSignal(1);
    let resolve!: (value: number) => void;
    const pending = new Promise<number>((done) => (resolve = done));
    let child!: Owner;
    let computed!: Computed<number>;
    const cleanup = vi.fn(() => {
      throw new Error('cleanup failed');
    });
    const remainingCleanup = vi.fn();
    const fallbackError = new Error('fallback failed');
    const { host } = setup(
      () => {
        child = createOwner(getActiveInvokeContext().owner);
        computed = registerSubscriberToOwner(
          new Computed(
            null,
            ({ cleanup: onCleanup }) => {
              const value = source.value;
              onCleanup(cleanup);
              onCleanup(remainingCleanup);
              return pending.then(() => value);
            },
            undefined,
            { initial: 0 }
          ),
          child
        );
        return String(computed.value);
      },
      createQRL('chunk', 'fallback', () => {
        throw fallbackError;
      })
    );
    const job = computed.current!;
    expect(() => disposeOwner(child)).toThrow(fallbackError);
    resolve(1);
    await job.promise;
    expect(host.textContent).toBe('');
    expect(source.subs).toBeNull();
    expect(computed.deps).toBeNull();
    expect(computed.owner).toBeNull();
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(remainingCleanup).toHaveBeenCalledTimes(1);
    disposeOwner(child);
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('catches application errors carrying plugin metadata', () => {
    const { host } = setup(() => {
      throw Object.assign(new Error('application failed'), { plugin: 'application' });
    });
    expect(host.textContent).toBe('application failed');
  });

  it.each([false, true])('preserves module loading errors, synchronous=%s', async (sync) => {
    const error = Object.assign(new Error('module transform failed'), { plugin: 'test-transform' });
    const qrl = createQRL('chunk', `failed-import-${sync}`, null, () => {
      if (sync) {
        throw error;
      }
      return Promise.reject(error);
    });
    await expect(qrl.resolve()).rejects.toBe(error);
    const { boundary, host } = setup(() => 'content');
    expect(() => handleError(boundary.block.currentOwner, error)).toThrow(error);
    expect(boundary.error).toBeUndefined();
    expect(host.textContent).toBe('content');
  });

  it('does not retry discarded content after its Promise settles', async () => {
    let release!: () => void;
    let ready = false;
    let owner!: Owner;
    const pending = new Promise<void>((resolve) => (release = resolve));
    const body = vi.fn(() => {
      owner = getActiveInvokeContext().owner!;
      if (!ready) {
        throw pending;
      }
      return 'discarded';
    });
    const { host, scheduler } = setup(body);
    await handleError(owner, new Error('failed'));
    ready = true;
    release();
    await scheduler.flushInteraction();
    expect(body).toHaveBeenCalledTimes(1);
    expect(host.textContent).toBe('failed');
  });

  it.each(['old result', 'old error'] as const)(
    'ignores an inner Catch %s after replacement',
    async (kind) => {
      let resolve!: (value: string) => void;
      let reject!: (error: Error) => void;
      let owner!: Owner;
      const pending = new Promise<string>((done, fail) => {
        resolve = done;
        reject = fail;
      });
      const { boundary, host, scheduler } = setup((ctx: any) => {
        const element = ctx.document.createElement('div');
        const start = ctx.document.createComment('start');
        const end = ctx.document.createComment('end');
        element.appendChild(start);
        element.appendChild(end);
        createCatch(
          ctx,
          new BranchRange(ctx.document, start, end),
          createQRL('chunk', 'inner', () => {
            owner = getActiveInvokeContext().owner!;
            return pending;
          }),
          createQRL('chunk', 'innerFallback', () => 'inner fallback')
        );
        return element;
      });
      await handleError(owner, new Error('failed'));
      if (kind === 'old result') {
        resolve('discarded');
      } else {
        reject(new Error('late failure'));
      }
      await scheduler.flushInteraction();
      expect(boundary.error).toBeUndefined();
      expect(host.textContent).toBe('inner fallback');
    }
  );

  it.each([false, true])('catches a Pending fallback failure, async=%s', async (isAsync) => {
    let release!: (value: Node) => void;
    const pending = new Promise<Node>((resolve) => (release = resolve));
    const { host, scheduler } = setup((ctx: any) => {
      const element = ctx.document.createElement('div');
      const start = ctx.document.createComment('start');
      const end = ctx.document.createComment('end');
      element.appendChild(start);
      element.appendChild(end);
      createPending(
        ctx,
        new BranchRange(ctx.document, start, end),
        createQRL('chunk', 'pending', () => pending),
        createQRL('chunk', 'pendingFallback', () => {
          if (isAsync) {
            return Promise.reject(new Error('pending fallback failed'));
          }
          throw new Error('pending fallback failed');
        })
      );
      return element;
    });
    release(host.ownerDocument.createTextNode('ready'));
    await scheduler.flushInteraction();
    expect(host.textContent).toBe('pending fallback failed');
  });

  it.each(['resolved', 'rejected'] as const)(
    'ignores a discarded Pending fallback when %s',
    async (kind) => {
      let release!: (node: Node) => void;
      let resolveFallback!: (node: Node) => void;
      let reject!: (error: Error) => void;
      let subscription!: ReturnType<typeof createPending>;
      let fallbackRuns = 0;
      const pending = new Promise<Node>((resolve) => (release = resolve));
      const fallback = new Promise<Node>((resolve, fail) => {
        resolveFallback = resolve;
        reject = fail;
      });
      const { boundary, host, scheduler } = setup((ctx: any) => {
        const element = ctx.document.createElement('div');
        const start = ctx.document.createComment('start');
        const end = ctx.document.createComment('end');
        element.appendChild(start);
        element.appendChild(end);
        subscription = createPending(
          ctx,
          new BranchRange(ctx.document, start, end),
          createQRL('chunk', 'pending', () => pending),
          createQRL('chunk', 'pendingFallback', () =>
            fallbackRuns++ === 0 ? fallback : ctx.document.createTextNode('current fallback')
          )
        );
        return element;
      });
      release(host.ownerDocument.createTextNode('ready'));
      await vi.waitFor(() => expect(host.textContent).toBe('ready'));
      let releaseNext!: () => void;
      subscription.suspend(new Promise<void>((resolve) => (releaseNext = resolve)));
      expect(host.textContent).toBe('current fallback');
      if (kind === 'rejected') {
        reject(new Error('discarded fallback'));
      } else {
        resolveFallback(host.ownerDocument.createTextNode('discarded fallback'));
      }
      await scheduler.flushInteraction();
      expect(boundary.error).toBeUndefined();
      expect(host.textContent).toBe('current fallback');
      releaseNext();
      await Promise.resolve();
      expect(host.textContent).toBe('ready');
    }
  );

  it.each([false, true])('allocates through the constructor QRL, lazy=%s', async (isLazy) => {
    const document = createDocument({ html: '<div></div>' });
    const ctx = createContainerContext(document.querySelector('div')!);
    const importer = vi.fn(async () => ({ _Catch: CatchContentSubscription }));
    const constructor = createQRL(
      'catch',
      '_Catch',
      isLazy ? null : CatchContentSubscription,
      importer
    );
    const getRoot = vi.spyOn(ctx, 'getRoot').mockResolvedValue(constructor);

    const boundary = await allocate(ctx, TypeIds.CatchSubscription, [TypeIds.Plain, 0]);

    expect(getRoot).toHaveBeenCalledWith(0);
    expect(importer).toHaveBeenCalledTimes(isLazy ? 1 : 0);
    expect(boundary).toBeInstanceOf(CatchContentSubscription);
    expect(boundary.owner).toBeNull();
    expect(boundary.scheduler).toBe(ctx.scheduler);
  });

  it.each([null, createQRL('catch', 'invalidConstructor', class {})])(
    'rejects an invalid resumed boundary constructor: %s',
    async (constructor) => {
      const document = createDocument({ html: '<div></div>' });
      const ctx = createContainerContext(document.querySelector('div')!);
      vi.spyOn(ctx, 'getRoot').mockResolvedValue(constructor);

      await expect(allocate(ctx, TypeIds.CatchSubscription, [TypeIds.Plain, 0])).rejects.toThrow(
        'Cannot allocate'
      );
    }
  );

  it('normalizes an error received directly by the boundary', () => {
    const { boundary, host } = setup(() => 'content');
    boundary.catchError('raw throw');
    expect(boundary.error).toBeInstanceOf(Error);
    expect(host.textContent).toBe('raw throw');
  });

  it('cannot revive discarded content after a cleanup failure', async () => {
    const value = useSignal('content');
    const cleanup = vi.fn(() => {
      throw new Error('cleanup failed');
    });
    const { boundary, host, scheduler } = setup((ctx: any) => {
      useTask(({ cleanup: onCleanup }) => onCleanup(cleanup));
      return ctx.document.createTextNode(value.value);
    });
    await scheduler.flushInteraction();
    expect(() => boundary.catchError(new Error('render failed'))).toThrow('cleanup failed');
    value.value = 'revived';
    await scheduler.flushInteraction();
    expect(host.textContent).toBe('');
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('does not render a discarded branch after its QRL finishes loading', async () => {
    let resolve!: (module: Record<string, ContentFn>) => void;
    const pending = new Promise<Record<string, ContentFn>>((done) => {
      resolve = done;
    });
    const { boundary, host, scheduler } = setup(createQRL('late', 'late', null, () => pending));
    await boundary.catchError(new Error('failed'));
    resolve({ late: (ctx: any) => ctx.document.createTextNode('late content') });
    await scheduler.flushInteraction();
    expect(host.textContent).toBe('failed');
  });

  it('catches a commit failure after asynchronous rendering', async () => {
    const { host, scheduler } = setup(async () => 'invalid');
    const document = host.ownerDocument;
    const createText = document.createTextNode.bind(document);
    const spy = vi.spyOn(document, 'createTextNode').mockImplementation((text) => {
      if (text === 'invalid') {
        throw new Error('commit failed');
      }
      return createText(text);
    });
    try {
      await scheduler.flushInteraction();
      expect(host.textContent).toBe('commit failed');
    } finally {
      spy.mockRestore();
    }
  });

  it.each([false, true])(
    'waits for qerror handling only for an async fallback: %s',
    async (isAsync) => {
      let resolve!: (value: string) => void;
      const pending = new Promise<string>((done) => (resolve = done));
      const { host } = setup(
        (ctx: any) => {
          const button = ctx.document.createElement('button');
          setEvent(button, 'q-e:click', () => {});
          return button;
        },
        createQRL('chunk', 'fallback', () => (isAsync ? pending : 'event failed'))
      );
      const event = {
        target: host.ownerDocument,
        detail: { element: host.querySelector('button')!, error: new Error('event failed') },
      } as unknown as Parameters<typeof _catchError>[0];

      const result = _catchError(event);
      if (isAsync) {
        expect(result).toBeInstanceOf(Promise);
        expect(event._qHandled).toBe(false);
        resolve('event failed');
        await result;
      } else {
        expect(result).toBeUndefined();
      }
      expect(event._qHandled).toBe(true);
      expect(host.textContent).toBe('event failed');
    }
  );

  it('ignores qerror without a boundary synchronously', () => {
    const document = createDocument({ html: '<button></button>' });
    const event = {
      target: document,
      detail: { element: document.querySelector('button')!, error: new Error('event failed') },
    } as unknown as Parameters<typeof _catchError>[0];

    expect(_catchError(event)).toBeUndefined();
    expect(event._qHandled).toBeUndefined();
  });

  it('ignores a cold event when its source is removed during resume', async () => {
    const { boundary, host, ctx } = setup((ctx: any) => ctx.document.createElement('button'));
    const button = host.querySelector('button')!;
    button.setAttribute('q:catch', '1');
    const getRoot = vi.spyOn(ctx, 'getRoot').mockImplementation(async () => {
      button.remove();
      return boundary;
    });
    try {
      await _catchError({
        target: host.ownerDocument,
        detail: { element: button, error: new Error('late event') },
      } as unknown as Parameters<typeof _catchError>[0]);
      expect(boundary.error).toBeUndefined();
    } finally {
      getRoot.mockRestore();
    }
  });

  it('preserves chunk import failures instead of rendering a fallback', async () => {
    const error = new Error('chunk unavailable');
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const qrl = createQRL('chunk', 'missing', null, () => Promise.reject(error));
      await expect(qrl.resolve()).rejects.toBe(error);
      const { boundary, host } = setup((ctx: any) => ctx.document.createTextNode('content'));
      expect(() => handleError(boundary.block.currentOwner, error)).toThrow(error);
      expect(boundary.error).toBeUndefined();
      expect(host.textContent).toBe('content');
    } finally {
      log.mockRestore();
    }
  });

  it.each([false, true])('catches an event handler failure, async=%s', async (async) => {
    const { host } = setup((ctx: any) => {
      const button = ctx.document.createElement('button');
      setEvent(button, 'q-e:click', () => {
        if (async) {
          return Promise.reject(new Error('event failed'));
        }
        throw new Error('event failed');
      });
      return button;
    });
    const button = host.querySelector('button')! as QElement;
    const dispatch = button._qDispatch!['e:click'] as (event: Event, element: Element) => unknown;
    await dispatch(new Event('click'), button);
    expect(host.textContent).toBe('event failed');
  });

  it.each([false, true])('catches a scheduled task failure, async=%s', async (async) => {
    const failed = useSignal(false);
    const { host, scheduler } = setup((ctx: any) => {
      useTask(() => {
        if (failed.value) {
          if (async) {
            return Promise.reject(new Error('task failed'));
          }
          throw new Error('task failed');
        }
      });
      return ctx.document.createTextNode('content');
    });
    await scheduler.flushInteraction();
    failed.value = true;
    await scheduler.flushInteraction();
    expect(host.textContent).toBe('task failed');
  });

  it('accepts a revoked proxy as a thrown value', () => {
    const { proxy, revoke } = Proxy.revocable({}, {});
    revoke();
    const { boundary, host } = setup(() => {
      throw proxy;
    });
    expect(boundary.error).toBeInstanceOf(Error);
    expect(host.textContent).toBe('An error occurred');
  });

  it.each([null, undefined, 'raw throw'])('wraps a non-Error throw: %s', (error) => {
    const { boundary, host } = setup(() => {
      throw error;
    });
    expect(boundary.error).toBeInstanceOf(Error);
    expect(host.textContent).toBe(String(error));
  });

  it('disposes the broken subtree and ignores a late render result', async () => {
    let resolve!: (value: Node) => void;
    const pending = new Promise<Node>((done) => {
      resolve = done;
    });
    const { boundary, host, scheduler } = setup(() => pending);
    await boundary.catchError(new Error('failed'));
    resolve(host.ownerDocument.createTextNode('late content'));
    await scheduler.flushInteraction();
    expect(host.textContent).toBe('failed');
  });

  it('removes child subscriptions when a scalar effect fails', async () => {
    const value = useSignal('initial');
    const { boundary, host, scheduler } = setup((ctx: any) => {
      const node = ctx.document.createTextNode('');
      const effect = createTextNodeEffect(node, value, ctx.scheduler);
      ctx.scheduler.notify(effect);
      return node;
    });
    await scheduler.flushInteraction();
    const contentOwner = boundary.block.currentOwner!;
    await boundary.catchError(new Error('failed'));
    expect(contentOwner.flags & OwnerFlags.Disposed).toBeTruthy();
    value.value = 'updated';
    await scheduler.flushInteraction();
    expect(host.textContent).toBe('failed');
  });
});

describe('buffered SSR Catch', () => {
  it('settles ordinary async output while retaining Pending deferral', async () => {
    let scope!: SsrRangeScope;
    let reject!: (error: unknown) => void;
    const pending = new Promise<string>((_done, fail) => {
      reject = fail;
    });
    let caught = false;
    const host = {
      scheduler: new Scheduler(() => {}),
      ownOutput: (output: SsrOutput) => output,
      canDefer: true,
      nextId: () => 1,
      addRoot: () => ({ type: 'root-value' as const, value: null }),
      wrapRange: (_id: number, output: any) => output,
      markCaughtError: () => {
        caught = true;
      },
      createRangeScope: () => {
        scope = Object.assign(Object.create(host), {
          flush: () => {},
          defer: () => {},
          reparentRanges: () => {},
        });
        return scope;
      },
    };
    const output = invoke(newInvokeContext({ owner: createOwner(null) }), () =>
      createSsrCatch(
        host,
        0,
        createQRL('chunk', 'content', () => ['partial', pending]),
        createQRL('chunk', 'fallback', (_ctx, error) => (error as Error).message)
      )
    );
    expect(scope.canDefer).toBe(true);
    expect(host.canDefer).toBe(true);
    expect(output).toBeInstanceOf(Promise);
    reject(new Error('async failed'));
    const resolved = (await output) as SsrCatchChunk;
    expect(resolved.type).toBe('catch');
    expect(
      JSON.stringify(resolved.boundary.output, (key, value) =>
        key === 'roots' || key === 'subscription' ? undefined : value
      )
    ).toContain('async failed');
    expect(caught).toBe(true);
  });
});

it.each([null, ['not a QRL', null], [null, new Error('invalid')]])(
  'rejects malformed serialized Catch state: %s',
  async (state) => {
    const document = createDocument({ html: '<div><!--d=0--><!--/d--></div>' });
    const ctx = createContainerContext(document.querySelector('div')!);
    const hostOwner = createOwner(null);
    const contentOwner = createOwner(hostOwner);
    const render = createQRL('chunk', 'render', () => '');
    const subscription = new CatchContentSubscription(null!, null!, ctx.scheduler);
    const parts = [0, EffectKind.Content, 0, [], [], render, contentOwner, null, null, true, state];
    const payload = [
      ...parts.flatMap((value) => [TypeIds.Plain, value]),
      TypeIds.Plain,
      hostOwner,
      TypeIds.Plain,
      0,
    ];
    await expect(
      Promise.resolve().then(() => inflate(ctx, subscription, TypeIds.CatchSubscription, payload))
    ).rejects.toThrow('Invalid serialized Catch state');
  }
);
