import { describe, expect, it, vi } from 'vitest';
import { createDocument } from '../../../testing/document';
import { disposeSubscriber } from '../../reactive/cleanup';
import { useSignal } from '../../reactive/public-api';
import { createQRL } from '../../shared/qrl/qrl-class';
import type { QRL } from '../../shared/qrl/qrl.public';
import { createContainerContext, type ContainerContext } from '../../runtime/container-context';
import { invoke, newInvokeContext } from '../../runtime/invoke-context';
import { createOwner } from '../../runtime/owner';
import { Scheduler } from '../../runtime/scheduler';
import { BranchRange } from '../branch/branch';
import { createTextNodeEffect } from '../effect/text-effect';
import { toArray } from '../../test-utils';
import { createContentBlock, createSuspense, type ContentOutput } from './content';

describe('ContentBlock', () => {
  it('renders initially and replaces content when a dependency changes', async () => {
    const value = useSignal('first');
    const { content, host } = setup([value], (document, _scheduler, signal) =>
      text(document, signal.value)
    );

    content.run();
    expect(host.textContent).toBe('first');

    value.value = 'second';
    await content.scheduler.flushInteraction();

    expect(host.textContent).toBe('second');
  });

  it('renders a primitive output as a text node', async () => {
    const value = useSignal('first');
    const { content, host } = setup([value], (_document, _scheduler, signal) => signal.value);

    content.run();
    expect(host.textContent).toBe('first');

    value.value = 'second';
    await content.scheduler.flushInteraction();

    expect(host.textContent).toBe('second');
  });

  it('renders nothing for a boolean output', async () => {
    const value = useSignal(false);
    const { content, host } = setup([value], (_document, _scheduler, signal) => signal.value);

    content.run();
    expect(host.textContent).toBe('');

    value.value = true;
    await content.scheduler.flushInteraction();

    expect(host.textContent).toBe('');
  });

  it('keeps the old DOM while a returned promise is pending', async () => {
    const value = useSignal('initial');
    const next = deferred<Node>();
    const { content, host } = setup([value], (document, _scheduler, signal) =>
      signal.value === 'initial' ? text(document, 'initial') : next.promise
    );

    content.run();
    value.value = 'pending';
    const pending = content.scheduler.flushInteraction();

    expect(host.textContent).toBe('initial');

    next.resolve(text(host.ownerDocument, 'ready'));
    await pending;

    expect(host.textContent).toBe('ready');
  });

  it('processes async updates sequentially', async () => {
    const value = useSignal(0);
    const first = deferred<Node>();
    const second = deferred<Node>();
    const started = deferred<void>();
    const calls: number[] = [];
    const { content, host } = setup([value], (document, _scheduler, signal) => {
      calls.push(signal.value);
      if (signal.value === 0) {
        return text(document, 'initial');
      }
      if (signal.value === 1) {
        started.resolve();
      }
      return signal.value === 1 ? first.promise : second.promise;
    });

    content.run();
    value.value = 1;
    const pending = content.scheduler.flushInteraction();
    await started.promise;
    value.value = 2;
    expect(host.textContent).toBe('initial');
    expect(calls).toEqual([0, 1]);

    first.resolve(text(host.ownerDocument, 'first'));
    second.resolve(text(host.ownerDocument, 'current'));
    await pending;
    expect(calls).toEqual([0, 1, 2]);
    expect(host.textContent).toBe('current');
  });

  it('keeps the previous DOM when the current attempt rejects', async () => {
    const value = useSignal(false);
    const next = deferred<Node>();
    const { content, host } = setup([value], (document, _scheduler, signal) =>
      signal.value ? next.promise : text(document, 'current')
    );

    content.run();
    value.value = true;
    const pending = content.run();
    const error = new Error('content failed');
    next.reject(error);

    await expect(pending).rejects.toBe(error);
    expect(host.textContent).toBe('current');
  });

  it('blocks a late async commit after disposal', async () => {
    const value = useSignal(false);
    const nested = useSignal('nested');
    const next = deferred<Node>();
    let attemptEffect: ReturnType<typeof createTextNodeEffect> | undefined;
    const { content, host } = setup([value], (document, scheduler, signal) => {
      if (signal.value) {
        attemptEffect = createTextNodeEffect(document.createTextNode(''), nested, scheduler);
        return next.promise;
      }
      return text(document, 'current');
    });

    content.run();
    value.value = true;
    const pending = content.run();
    disposeSubscriber(content);
    expect(attemptEffect?.owner).toBeNull();
    next.resolve(text(host.ownerDocument, 'late'));

    await pending;
    await Promise.resolve();
    expect(host.textContent).toBe('');
  });

  it('disposes nested effects with replaced content', async () => {
    const version = useSignal(0);
    const nested = useSignal('nested');
    const effects: ReturnType<typeof createTextNodeEffect>[] = [];
    const { content } = setup([version], (document, scheduler, signal) => {
      signal.value;
      const effect = createTextNodeEffect(document.createTextNode(''), nested, scheduler);
      effects.push(effect);
      scheduler.notify(effect);
      return text(document, `content-${signal.value}`);
    });

    content.run();
    await content.scheduler.flushInteraction();
    expect(toArray(nested.subs)).toContain(effects[0]);

    version.value = 1;
    await content.scheduler.flushInteraction();

    expect(effects[0].owner).toBeNull();
    expect(toArray(nested.subs)).not.toContain(effects[0]);
    expect(toArray(nested.subs)).toContain(effects[1]);
  });
});

describe('createSuspense', () => {
  it('passes the container context to content and fallback renders', () => {
    const pending = deferred<Node>();
    let contentContext: ContainerContext | undefined;
    let fallbackContext: ContainerContext | undefined;
    const { host } = setupSuspense(
      renderQrl((ctx) => {
        contentContext = ctx;
        return pending.promise;
      }),
      renderQrl((ctx) => {
        fallbackContext = ctx;
        return ctx!.document.createTextNode('loading');
      })
    );

    expect(contentContext?.document).toBe(host.ownerDocument);
    expect(fallbackContext).toBe(contentContext);
  });

  it('does not touch the fallback importer for synchronous content', () => {
    let fallbackImports = 0;
    const fallback = createQRL<RenderFn>('chunk', 'fallback', null, () => {
      fallbackImports++;
      return Promise.resolve({ fallback: () => null });
    });
    const { host } = setupSuspense(
      renderQrl(() => textNode('ready')),
      fallback
    );

    expect(host.textContent).toBe('ready');
    expect(fallbackImports).toBe(0);
  });

  it('renders one fallback while retaining the host range markers', async () => {
    const pending = deferred<Node>();
    let contentRuns = 0;
    let fallbackRuns = 0;
    const fallbackNode = textNode('loading');
    const readyNode = textNode('ready');
    const { host, start, end } = setupSuspense(
      renderQrl(() => {
        contentRuns++;
        return pending.promise;
      }),
      renderQrl(() => {
        fallbackRuns++;
        return fallbackNode;
      })
    );

    expect(Array.from(host.childNodes)).toEqual([start, fallbackNode, end]);
    expect(contentRuns).toBe(1);
    expect(fallbackRuns).toBe(1);

    pending.resolve(readyNode);
    await settle();

    expect(Array.from(host.childNodes)).toEqual([start, readyNode, end]);
    expect(fallbackRuns).toBe(1);
  });

  it('skips a delayed fallback when content wins', async () => {
    vi.useFakeTimers();
    try {
      const pending = deferred<Node>();
      let fallbackRuns = 0;
      const { host } = setupSuspense(
        renderQrl(() => pending.promise),
        renderQrl(() => {
          fallbackRuns++;
          return textNode('loading');
        }),
        20
      );

      pending.resolve(textNode('ready'));
      await settle();
      vi.advanceTimersByTime(20);

      expect(host.textContent).toBe('ready');
      expect(fallbackRuns).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('skips a delayed fallback after its boundary is disposed', () => {
    vi.useFakeTimers();
    try {
      const pending = deferred<Node>();
      const fallback = vi.fn(() => textNode('loading'));
      const setup = setupSuspense(
        renderQrl(() => pending.promise),
        renderQrl(fallback),
        20
      );

      disposeSubscriber(setup.content);
      vi.advanceTimersByTime(20);

      expect(fallback).not.toHaveBeenCalled();
      expect(Array.from(setup.host.childNodes)).toEqual([setup.start, setup.end]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('disposes the fallback owner when content commits', async () => {
    const pending = deferred<Node>();
    const nested = useSignal('nested');
    let effect!: ReturnType<typeof createTextNodeEffect>;
    const { content } = setupSuspense(
      renderQrl(() => pending.promise),
      renderQrl(() => {
        effect = createTextNodeEffect(textNode(''), nested);
        return textNode('loading');
      })
    );

    expect(effect.owner).not.toBeNull();
    expect(content.block.currentOwner).toBe(effect.owner);

    pending.resolve(textNode('ready'));
    await settle();

    expect(effect.owner).toBeNull();
  });

  it('disposes the complete fallback owner tree with its content root', async () => {
    const pending = deferred<Node>();
    const nested = useSignal('nested');
    let effect!: ReturnType<typeof createTextNodeEffect>;
    const setup = setupSuspense(
      renderQrl(() => pending.promise),
      renderQrl(() => {
        effect = createTextNodeEffect(textNode(''), nested);
        return textNode('loading');
      })
    );
    setup.ctx.state.liveRoots.set(0, setup.content);

    await setup.ctx.disposeRoot(0);

    expect(effect.owner).toBeNull();
    expect(Array.from(setup.host.childNodes)).toEqual([setup.start, setup.end]);
  });

  it('disposes a fallback owner while its render is pending', () => {
    const content = deferred<Node>();
    const fallback = deferred<Node>();
    const nested = useSignal('nested');
    let effect!: ReturnType<typeof createTextNodeEffect>;
    const setup = setupSuspense(
      renderQrl(() => content.promise),
      renderQrl(() => {
        effect = createTextNodeEffect(textNode(''), nested);
        return fallback.promise;
      })
    );

    disposeSubscriber(setup.content);

    expect(effect.owner).toBeNull();
    expect(Array.from(setup.host.childNodes)).toEqual([setup.start, setup.end]);
  });

  it('does not overwrite content when fallback rendering resolves late', async () => {
    const content = deferred<Node>();
    const fallback = deferred<Node>();
    const nested = useSignal('nested');
    let effect!: ReturnType<typeof createTextNodeEffect>;
    const setup = setupSuspense(
      renderQrl(() => content.promise),
      renderQrl(() => {
        effect = createTextNodeEffect(textNode(''), nested);
        return fallback.promise;
      })
    );

    content.resolve(textNode('ready'));
    await settle();
    expect(effect.owner).toBeNull();

    fallback.resolve(textNode('late fallback'));
    await setup.scheduler.flushInteraction();

    expect(setup.host.textContent).toBe('ready');
  });

  it('disposes rejected content and rethrows through the scheduler', async () => {
    const pending = deferred<Node>();
    const { content, host, start, end, scheduler } = setupSuspense(
      renderQrl(() => pending.promise),
      renderQrl(() => textNode('loading'))
    );
    const error = new Error('content failed');

    pending.reject(error);
    // The rejection reaches the scheduler several promise hops later.
    await new Promise((resolve) => setTimeout(resolve, 0));

    await expect(scheduler.flushInteraction()).rejects.toThrow(error);
    expect(Array.from(host.childNodes)).toEqual([start, end]);
    expect(content.block.currentOwner).toBeNull();
  });

  it('keeps resolved content stale during later updates without fallback', async () => {
    const source = useSignal(0);
    const initial = deferred<Node>();
    const update = deferred<Node>();
    let fallbackRuns = 0;
    const setup = setupSuspense(
      renderQrl(() => (source.value === 0 ? initial.promise : update.promise)),
      renderQrl(() => {
        fallbackRuns++;
        return textNode('loading');
      })
    );

    initial.resolve(textNode('ready'));
    await settle();
    source.value = 1;
    const updating = setup.scheduler.flushInteraction();
    await settle();

    expect(setup.host.textContent).toBe('ready');
    expect(fallbackRuns).toBe(1);

    update.resolve(textNode('updated'));
    await updating;

    expect(setup.host.textContent).toBe('updated');
    expect(fallbackRuns).toBe(1);
  });
});

function setup<TArgs extends unknown[]>(
  args: TArgs,
  fn: (
    document: Document,
    scheduler: Scheduler,
    ...args: TArgs
  ) => ContentOutput | Promise<ContentOutput>
) {
  const document = createDocument({ html: '<div></div>' });
  const host = document.querySelector('div')!;
  const start = document.createComment('start');
  const end = document.createComment('end');
  host.appendChild(start);
  host.appendChild(end);
  const scheduler = new Scheduler(() => {});
  const ctx = createContainerContext(host, scheduler);
  const context = newInvokeContext({ owner: createOwner(null), container: ctx });
  const content = invoke(context, () =>
    createContentBlock(ctx, start, end, args, (...args) => fn(document, scheduler, ...args))
  );
  return { content, host };
}

function text(document: Document, value: string): Node {
  return document.createTextNode(value);
}

type RenderFn = (
  ctx?: ContainerContext
) => Node | readonly Node[] | null | undefined | Promise<Node>;

let qrlId = 0;

function renderQrl(render: RenderFn): QRL<RenderFn> {
  return createQRL('chunk', `render${qrlId++}`, render);
}

function textNode(value: string): Text {
  return createDocument().createTextNode(value);
}

function setupSuspense(contentQrl: QRL<RenderFn>, fallbackQrl?: QRL<RenderFn>, delay = 0) {
  const document = createDocument({ html: '<div></div>' });
  const host = document.querySelector('div')!;
  const start = document.createComment('start');
  const end = document.createComment('end');
  host.appendChild(start);
  host.appendChild(end);
  const scheduler = new Scheduler(() => {});
  const ctx = createContainerContext(host, scheduler);
  const context = newInvokeContext({ owner: createOwner(null), container: ctx });
  const content = invoke(context, () =>
    createSuspense(ctx, new BranchRange(document, start, end), contentQrl, fallbackQrl, delay)
  );
  return { content, ctx, document, host, start, end, scheduler };
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
